/**
 * Simple Budget — Local IndexedDB Schema & Transactional Wrapper (`src/data/database.ts`)
 *
 * MIGRATION POLICY (Golden Rule #7):
 * - NEVER edit an existing schema version's store or index definitions once shipped.
 * - To change the schema in a future task, increment `CURRENT_SCHEMA_VERSION` to `n + 1`
 *   and add a new upgrade step `SCHEMA_UPGRADES[n + 1] = (db, tx) => { ... }`, accompanied
 *   by a backup-format migration and an upgrade test using `openDatabaseAtVersion`.
 */

import type { IsoDate, MonthKey, WeekStartsOn } from '../domain/calendar';
import { instantFromLocal, localDateOf } from '../domain/instant';
import type { LedgerEntry, OpenedMonth, RecurringItem } from '../domain/ledger';

export const CURRENT_SCHEMA_VERSION = 2;
export const DEFAULT_DATABASE_NAME = 'simple-budget';

export type StoreName = 'settings' | 'tags' | 'recurringItems' | 'entries' | 'months';

export const ALL_STORE_NAMES: readonly StoreName[] = [
  'settings',
  'tags',
  'recurringItems',
  'entries',
  'months',
];

export interface SettingsRecord {
  readonly id: 'app';
  readonly currency: 'USD';
  readonly locale: string;
  readonly weekStartsOn: WeekStartsOn;
  readonly setupCompletedAt: string | null;
  readonly lastBackupAt: string | null;
}

export interface TagRecord {
  readonly id: string;
  readonly name: string;
  readonly nameKey: string;
  readonly color: string;
  readonly createdAt: string;
}

export interface StoreRecordMap {
  readonly settings: SettingsRecord;
  readonly tags: TagRecord;
  readonly recurringItems: RecurringItem;
  readonly entries: LedgerEntry;
  readonly months: OpenedMonth;
}

export type SchemaUpgradeFn = (db: IDBDatabase, transaction: IDBTransaction) => void;

export const SCHEMA_UPGRADES: Readonly<Record<number, SchemaUpgradeFn>> = {
  1: (db) => {
    db.createObjectStore('settings', { keyPath: 'id' });

    const tagsStore = db.createObjectStore('tags', { keyPath: 'id' });
    tagsStore.createIndex('nameKey', 'nameKey', { unique: true });

    const recurringItemsStore = db.createObjectStore('recurringItems', { keyPath: 'id' });
    recurringItemsStore.createIndex('kind', 'kind', { unique: false });
    recurringItemsStore.createIndex('startMonth', 'startMonth', { unique: false });
    recurringItemsStore.createIndex('endMonth', 'endMonth', { unique: false });

    const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
    entriesStore.createIndex('monthKey', 'monthKey', { unique: false });
    entriesStore.createIndex('date', 'date', { unique: false });
    entriesStore.createIndex('monthKey_date', ['monthKey', 'date'], { unique: false });
    entriesStore.createIndex('source', 'source', { unique: false });
    entriesStore.createIndex('recurringItemId', 'recurringItemId', { unique: false });
    entriesStore.createIndex('recurrenceKey', 'recurrenceKey', { unique: true });
    entriesStore.createIndex('tagIds', 'tagIds', { unique: false, multiEntry: true });

    db.createObjectStore('months', { keyPath: 'monthKey' });
  },
  /**
   * v2: every ledger entry gets `occurredAt`, a UTC ISO-8601 timestamp.
   * Old rows only knew their local day, so they get that day at local midnight (recurring and
   * adjustment lines) or their creation time when that was on the same local day (manual lines).
   */
  2: (_db, transaction) => {
    const entriesStore = transaction.objectStore('entries');
    const cursorRequest = entriesStore.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        return;
      }
      const entry = cursor.value as Omit<LedgerEntry, 'occurredAt'> & { occurredAt?: string };
      if (entry.occurredAt === undefined) {
        cursor.update({ ...entry, occurredAt: backfillOccurredAt(entry) });
      }
      cursor.continue();
    };
  },
};

export function backfillOccurredAt(
  entry: Pick<LedgerEntry, 'date' | 'createdAt' | 'source'>,
): string {
  if (entry.source === 'manual' && localDateOf(entry.createdAt) === entry.date) {
    return entry.createdAt;
  }
  return instantFromLocal(entry.date, '00:00');
}

export function requestToPromise<T = unknown>(request: IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result as T);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    return new Error(value);
  }
  return new Error(fallbackMessage);
}

interface NativeStorageBridge {
  postMessage(message: {
    readonly action: 'read' | 'write';
    readonly payload?: string;
  }): Promise<string | boolean | null>;
}

function getNativeIosStorageBridge(): NativeStorageBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const win = window as Window & {
    webkit?: {
      messageHandlers?: {
        nativeStorage?: NativeStorageBridge;
      };
    };
  };
  return win.webkit?.messageHandlers?.nativeStorage ?? null;
}

export interface DatabaseSnapshot {
  readonly settings: readonly SettingsRecord[];
  readonly tags: readonly TagRecord[];
  readonly recurringItems: readonly RecurringItem[];
  readonly entries: readonly LedgerEntry[];
  readonly months: readonly OpenedMonth[];
}

export interface CreateDatabaseOptions {
  readonly name?: string;
  readonly idbFactory?: IDBFactory;
  readonly version?: number;
  readonly upgrades?: Readonly<Record<number, SchemaUpgradeFn>>;
}

export type DatabaseChangeListener = () => void;

export class SimpleBudgetDatabase {
  readonly name: string;
  private readonly idbFactory: IDBFactory;
  private readonly version: number;
  private readonly upgrades: Readonly<Record<number, SchemaUpgradeFn>>;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly listeners = new Set<DatabaseChangeListener>();
  private revision = 0;

  constructor(options: CreateDatabaseOptions = {}) {
    this.name = options.name ?? DEFAULT_DATABASE_NAME;
    const factory =
      options.idbFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!factory) {
      throw new Error('No IDBFactory available in this environment.');
    }
    this.idbFactory = factory;
    this.version = options.version ?? CURRENT_SCHEMA_VERSION;
    this.upgrades = options.upgrades ?? SCHEMA_UPGRADES;
  }

  getRevision(): number {
    return this.revision;
  }

  subscribe(listener: DatabaseChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.idbFactory.open(this.name, this.version);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction;
        if (!tx) {
          return;
        }
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion ?? this.version;
        for (let v = oldVersion + 1; v <= newVersion; v += 1) {
          const upgrade = this.upgrades[v];
          if (upgrade) {
            upgrade(db, tx);
          }
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error(`Failed to open IndexedDB "${this.name}"`));
      };
    });

    return this.dbPromise;
  }

  async close(): Promise<void> {
    if (!this.dbPromise) {
      return;
    }
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = null;
  }

  async transaction<T>(
    mode: IDBTransactionMode,
    storeNames: readonly StoreName[],
    work: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    const db = await this.open();

    const result = await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([...storeNames], mode);
      let workResult: T;
      let workSettled = false;
      let workError: unknown = null;

      tx.oncomplete = () => {
        if (workError !== null) {
          reject(toError(workError, 'IndexedDB transaction work failed'));
          return;
        }
        if (workSettled) {
          resolve(workResult);
        }
      };

      tx.onerror = () => {
        reject(toError(workError ?? tx.error, 'IndexedDB transaction failed and was rolled back'));
      };

      tx.onabort = () => {
        reject(toError(workError ?? tx.error, 'IndexedDB transaction aborted and was rolled back'));
      };

      Promise.resolve()
        .then(() => work(tx))
        .then((value) => {
          workResult = value;
          workSettled = true;
        })
        .catch((err: unknown) => {
          workError = err;
          try {
            tx.abort();
          } catch {
            // Transaction may already be aborting due to a constraint error
          }
        });
    });

    if (mode === 'readwrite') {
      this.notifyListeners();
      void this.syncToNativeIosBridge();
    }

    return result;
  }

  private async syncToNativeIosBridge(): Promise<void> {
    const bridge = getNativeIosStorageBridge();
    if (!bridge) {
      return;
    }
    try {
      const snapshot = await this.exportRawSnapshot();
      await bridge.postMessage({
        action: 'write',
        payload: JSON.stringify(snapshot),
      });
    } catch {
      // Best-effort mirror to native iOS Application Support bridge
    }
  }

  async exportRawSnapshot(): Promise<DatabaseSnapshot> {
    return this.transaction('readonly', ALL_STORE_NAMES, async (tx) => {
      const [settings, tags, recurringItems, entries, months] = await Promise.all([
        requestToPromise<SettingsRecord[]>(tx.objectStore('settings').getAll()),
        requestToPromise<TagRecord[]>(tx.objectStore('tags').getAll()),
        requestToPromise<RecurringItem[]>(tx.objectStore('recurringItems').getAll()),
        requestToPromise<LedgerEntry[]>(tx.objectStore('entries').getAll()),
        requestToPromise<OpenedMonth[]>(tx.objectStore('months').getAll()),
      ]);
      return { settings, tags, recurringItems, entries, months };
    });
  }
}

let uniqueDbCounter = 0;

export function createDatabase(options: CreateDatabaseOptions = {}): SimpleBudgetDatabase {
  uniqueDbCounter += 1;
  return new SimpleBudgetDatabase({
    ...options,
    name: options.name ?? `${DEFAULT_DATABASE_NAME}-instance-${String(uniqueDbCounter)}`,
  });
}

export function openDatabaseAtVersion(options: {
  readonly name: string;
  readonly idbFactory?: IDBFactory;
  readonly version: number;
  readonly upgrades: Readonly<Record<number, SchemaUpgradeFn>>;
}): SimpleBudgetDatabase {
  return new SimpleBudgetDatabase(options);
}

export type { IsoDate, MonthKey, LedgerEntry, OpenedMonth, RecurringItem };
