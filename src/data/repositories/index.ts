import type { MonthKey } from '../../domain/calendar';
import { compareMonths } from '../../domain/calendar';
import type { LedgerEntry, OpenedMonth, RecurringItem } from '../../domain/ledger';
import { requestToPromise, type SettingsRecord, type TagRecord } from '../database';

export async function getSettings(tx: IDBTransaction): Promise<SettingsRecord | null> {
  const store = tx.objectStore('settings');
  const record = await requestToPromise<SettingsRecord | undefined>(store.get('app'));
  return record ?? null;
}

export async function putSettings(tx: IDBTransaction, settings: SettingsRecord): Promise<void> {
  const store = tx.objectStore('settings');
  await requestToPromise(store.put(settings));
}

export async function listRecurringItems(tx: IDBTransaction): Promise<RecurringItem[]> {
  const store = tx.objectStore('recurringItems');
  return requestToPromise<RecurringItem[]>(store.getAll());
}

export async function putRecurringItem(tx: IDBTransaction, item: RecurringItem): Promise<void> {
  const store = tx.objectStore('recurringItems');
  await requestToPromise(store.put(item));
}

export async function getEntriesForMonth(
  tx: IDBTransaction,
  month: MonthKey,
): Promise<LedgerEntry[]> {
  const store = tx.objectStore('entries');
  const monthIndex = store.index('monthKey');
  return requestToPromise<LedgerEntry[]>(monthIndex.getAll(IDBKeyRange.only(month)));
}

export async function getEntriesBeforeMonth(
  tx: IDBTransaction,
  month: MonthKey,
): Promise<LedgerEntry[]> {
  const store = tx.objectStore('entries');
  const monthIndex = store.index('monthKey');
  return requestToPromise<LedgerEntry[]>(monthIndex.getAll(IDBKeyRange.upperBound(month, true)));
}

export async function addLedgerEntry(tx: IDBTransaction, entry: LedgerEntry): Promise<void> {
  const store = tx.objectStore('entries');
  await requestToPromise(store.add(entry));
}

export async function getLedgerEntryById(
  tx: IDBTransaction,
  id: string,
): Promise<LedgerEntry | null> {
  const store = tx.objectStore('entries');
  const record = await requestToPromise<LedgerEntry | undefined>(store.get(id));
  return record ?? null;
}

export async function putLedgerEntry(tx: IDBTransaction, entry: LedgerEntry): Promise<void> {
  const store = tx.objectStore('entries');
  await requestToPromise(store.put(entry));
}

export async function removeLedgerEntry(tx: IDBTransaction, id: string): Promise<void> {
  const store = tx.objectStore('entries');
  await requestToPromise(store.delete(id));
}

export async function listOpenedMonths(tx: IDBTransaction): Promise<OpenedMonth[]> {
  const store = tx.objectStore('months');
  const rows = await requestToPromise<OpenedMonth[]>(store.getAll());
  return [...rows].sort((left, right) => compareMonths(left.monthKey, right.monthKey));
}

export async function getLatestOpenedMonth(tx: IDBTransaction): Promise<OpenedMonth | null> {
  const months = await listOpenedMonths(tx);
  return months.at(-1) ?? null;
}

export async function putOpenedMonth(tx: IDBTransaction, openedMonth: OpenedMonth): Promise<void> {
  const store = tx.objectStore('months');
  await requestToPromise(store.put(openedMonth));
}

export async function listTags(tx: IDBTransaction): Promise<TagRecord[]> {
  const store = tx.objectStore('tags');
  return requestToPromise<TagRecord[]>(store.getAll());
}

export async function putTag(tx: IDBTransaction, tag: TagRecord): Promise<void> {
  const store = tx.objectStore('tags');
  await requestToPromise(store.put(tag));
}
