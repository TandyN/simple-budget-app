import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, test, vi } from 'vitest';
import { formatMoney } from '../domain/money';
import { aRecurringExpense, anExpense, money } from '../domain/test-builders';
import {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_UPGRADES,
  createDatabase,
  openDatabaseAtVersion,
  requestToPromise,
  type SettingsRecord,
} from './database';
import {
  addLedgerEntry,
  getEntriesBeforeMonth,
  getEntriesForMonth,
  getSettings,
  listRecurringItems,
  putRecurringItem,
  putSettings,
} from './repositories';

function createFreshTestDatabase() {
  return createDatabase({ idbFactory: new IDBFactory() });
}

describe('local IndexedDB schema, constraints and transactions', () => {
  test('schema in code matches architecture §4 object stores and indexes', async () => {
    const db = createFreshTestDatabase();
    const rawDb = await db.open();

    expect(Array.from(rawDb.objectStoreNames).sort()).toEqual([
      'entries',
      'months',
      'recurringItems',
      'settings',
      'tags',
    ]);

    await db.transaction('readonly', ['tags', 'recurringItems', 'entries'], (tx) => {
      const tagsStore = tx.objectStore('tags');
      expect(tagsStore.index('nameKey').unique).toBe(true);

      const recurringStore = tx.objectStore('recurringItems');
      expect(Array.from(recurringStore.indexNames).sort()).toEqual([
        'endMonth',
        'kind',
        'startMonth',
      ]);

      const entriesStore = tx.objectStore('entries');
      expect(Array.from(entriesStore.indexNames).sort()).toEqual([
        'date',
        'monthKey',
        'monthKey_date',
        'recurrenceKey',
        'recurringItemId',
        'source',
        'tagIds',
      ]);
      expect(entriesStore.index('recurrenceKey').unique).toBe(true);
      expect(entriesStore.index('tagIds').multiEntry).toBe(true);
    });

    await db.close();
  });

  test('the database refuses a second recurring line for the same item in the same month', async () => {
    const db = createFreshTestDatabase();

    const firstRentSnapshot = {
      id: 'entry-rent-nov-1',
      date: '2026-11-01',
      monthKey: '2026-11',
      amount: money('-$1,800.00'),
      name: 'Rent',
      note: '',
      tagIds: [],
      source: 'recurring' as const,
      recurringItemId: 'item-rent',
      recurrenceKey: '2026-11:item-rent',
      createdAt: '2026-11-01T09:00:00.000Z',
      updatedAt: '2026-11-01T09:00:00.000Z',
    };

    const duplicateRentSnapshot = {
      ...firstRentSnapshot,
      id: 'entry-rent-nov-2',
    };

    await db.transaction('readwrite', ['entries'], async (tx) => {
      await addLedgerEntry(tx, firstRentSnapshot);
    });

    await expect(
      db.transaction('readwrite', ['entries'], async (tx) => {
        await addLedgerEntry(tx, duplicateRentSnapshot);
      }),
    ).rejects.toThrow();

    const novemberEntries = await db.transaction('readonly', ['entries'], (tx) =>
      getEntriesForMonth(tx, '2026-11'),
    );
    expect(novemberEntries).toHaveLength(1);
    expect(novemberEntries[0]?.id).toBe('entry-rent-nov-1');

    await db.close();
  });

  test('if a write fails halfway, nothing from that write is saved', async () => {
    const db = createFreshTestDatabase();

    await expect(
      db.transaction('readwrite', ['settings', 'recurringItems'], async (tx) => {
        await putSettings(tx, {
          id: 'app',
          currency: 'USD',
          locale: 'en-US',
          weekStartsOn: 0,
          setupCompletedAt: '2026-11-05T09:00:00.000Z',
          lastBackupAt: null,
        });
        await putRecurringItem(
          tx,
          aRecurringExpense({ id: 'item-rent', name: 'Rent', amount: '$1,800.00' }),
        );
        throw new Error('Simulated mid-transaction failure');
      }),
    ).rejects.toThrow('Simulated mid-transaction failure');

    const [savedSettings, savedItems] = await db.transaction(
      'readonly',
      ['settings', 'recurringItems'],
      async (tx) => Promise.all([getSettings(tx), listRecurringItems(tx)]),
    );

    expect(savedSettings).toBeNull();
    expect(savedItems).toEqual([]);

    await db.close();
  });

  test('entries can be found by month without reading other months', async () => {
    const db = createFreshTestDatabase();

    const octoberCoffee = anExpense({
      id: 'oct-coffee',
      name: 'Coffee',
      amount: '$5.50',
      date: '2026-10-14',
    });
    const novemberGroceries = anExpense({
      id: 'nov-groceries',
      name: 'Groceries',
      amount: '$120.00',
      date: '2026-11-05',
    });
    const decemberGift = anExpense({
      id: 'dec-gift',
      name: 'Holiday gift',
      amount: '$45.00',
      date: '2026-12-02',
    });

    await db.transaction('readwrite', ['entries'], async (tx) => {
      await addLedgerEntry(tx, octoberCoffee);
      await addLedgerEntry(tx, novemberGroceries);
      await addLedgerEntry(tx, decemberGift);
    });

    await db.transaction('readonly', ['entries'], async (tx) => {
      const entriesStore = tx.objectStore('entries');
      const storeGetAllSpy = vi.spyOn(entriesStore, 'getAll');
      const indexSpy = vi.spyOn(entriesStore, 'index');

      const novemberEntries = await getEntriesForMonth(tx, '2026-11');
      const entriesBeforeNovember = await getEntriesBeforeMonth(tx, '2026-11');

      expect(storeGetAllSpy).not.toHaveBeenCalled();
      expect(indexSpy).toHaveBeenCalledWith('monthKey');

      expect(novemberEntries.map((entry) => entry.name)).toEqual(['Groceries']);
      // -$120.00 in November
      expect(novemberEntries.map((entry) => formatMoney(entry.amount))).toEqual(['−$120.00']);

      expect(entriesBeforeNovember.map((entry) => entry.name)).toEqual(['Coffee']);
      // -$5.50 before November
      expect(entriesBeforeNovember.map((entry) => formatMoney(entry.amount))).toEqual(['−$5.50']);
    });

    await db.close();
  });

  test('opening a database at an older version upgrades cleanly to a newer schema version', async () => {
    const idbFactory = new IDBFactory();
    const dbName = 'upgrade-test-db';

    const v1Db = openDatabaseAtVersion({
      name: dbName,
      idbFactory,
      version: CURRENT_SCHEMA_VERSION,
      upgrades: SCHEMA_UPGRADES,
    });

    await v1Db.transaction('readwrite', ['settings'], async (tx) => {
      await putSettings(tx, {
        id: 'app',
        currency: 'USD',
        locale: 'en-US',
        weekStartsOn: 0,
        setupCompletedAt: '2026-11-05T09:00:00.000Z',
        lastBackupAt: null,
      });
    });
    await v1Db.close();

    const v2Db = openDatabaseAtVersion({
      name: dbName,
      idbFactory,
      version: 2,
      upgrades: {
        ...SCHEMA_UPGRADES,
        2: (_rawDb, tx) => {
          const settingsStore = tx.objectStore('settings');
          settingsStore.put({
            id: 'app',
            currency: 'USD',
            locale: 'en-US',
            weekStartsOn: 1,
            setupCompletedAt: '2026-11-05T09:00:00.000Z',
            lastBackupAt: '2026-11-06T00:00:00.000Z',
          });
        },
      },
    });

    const upgradedSettings = await v2Db.transaction('readonly', ['settings'], (tx) =>
      requestToPromise<SettingsRecord>(tx.objectStore('settings').get('app')),
    );
    expect(upgradedSettings).toEqual({
      id: 'app',
      currency: 'USD',
      locale: 'en-US',
      weekStartsOn: 1,
      setupCompletedAt: '2026-11-05T09:00:00.000Z',
      lastBackupAt: '2026-11-06T00:00:00.000Z',
    });

    await v2Db.close();
  });
});
