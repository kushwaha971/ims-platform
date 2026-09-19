/**
 * Part 19 §19.10.4 — the ledger-entry outbox.
 *
 * Sprint 0 ships the SCHEMA and the TYPES; the replay loop is Sprint 4's (the
 * ledger spine). They are here from day one because §19.10.5's seams are what
 * make Phase 2's general write queue additive rather than a rewrite, and
 * because a store shape invented later would not match the rows a shipped
 * client had already written.
 *
 * IndexedDB, not `localStorage`: the payload may carry an image, and
 * `localStorage` is synchronous and size-capped.
 *
 * The database name is PER TENANT — `ub-outbox-<tenantId>` — so a tenant switch
 * cannot replay one business's entries into another.
 */

export const OUTBOX_DB_VERSION = 1;
export const OUTBOX_STORE = 'writes';
export const OUTBOX_INDEX_SEQ = 'by_seq';
export const OUTBOX_INDEX_PARTY = 'by_party';

export const outboxDbName = (tenantId: string): string => `ub-outbox-${tenantId}`;

/** Class A is the whole of the MVP outbox: the manual ledger entry (§19.10.4). */
export type TOutboxKind = 'ledger.entry' | 'ledger.opening';

export type TOutboxStatus = 'queued' | 'sending' | 'needs_attention';

export interface TOutboxEntry {
  /** === the Idempotency-Key, minted at Save and reused on every attempt. */
  readonly id: string;
  /** Monotonic per device; replay is strictly serial in ascending seq. */
  readonly seq: number;
  readonly kind: TOutboxKind;
  readonly partyId: string;
  /** Plain and serialisable: never a Date, never a formatted string. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attachment?: {
    readonly blob: Blob;
    readonly name: string;
    readonly type: string;
  };
  /** ISO, device clock — display only. */
  readonly createdAt: string;
  readonly attempts: number;
  readonly lastError: { readonly code: string; readonly message: string } | null;
  readonly status: TOutboxStatus;
}

const isSupported = (): boolean => typeof indexedDB !== 'undefined';

/**
 * Opens (and on first use creates) the tenant's outbox database.
 *
 * The upgrade handler IS the schema: store `writes` keyed on `id`, index
 * `by_seq` for replay order and `by_party` so a party timeline can rebuild its
 * optimistic rows on mount without scanning the store.
 */
export const openOutbox = (tenantId: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!isSupported()) {
      reject(new Error('IndexedDB is unavailable; the outbox cannot be opened.'));
      return;
    }
    const request = indexedDB.open(outboxDbName(tenantId), OUTBOX_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        store.createIndex(OUTBOX_INDEX_SEQ, 'seq', { unique: false });
        store.createIndex(OUTBOX_INDEX_PARTY, 'partyId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the outbox.'));
  });

const withStore = async <T>(
  tenantId: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openOutbox(tenantId);
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, mode);
    const request = run(tx.objectStore(OUTBOX_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Outbox operation failed.'));
    tx.oncomplete = () => db.close();
  });
};

/** Writes one entry. The caller mints `id` (the idempotency key) and `seq`. */
export const putOutboxEntry = (tenantId: string, entry: TOutboxEntry): Promise<IDBValidKey> =>
  withStore(tenantId, 'readwrite', (store) => store.put(entry) as IDBRequest<IDBValidKey>);

export const deleteOutboxEntry = (tenantId: string, id: string): Promise<undefined> =>
  withStore(tenantId, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>);

/** Replay order. Ascending `seq`, one request in flight at a time (§19.10.4). */
export const listOutboxEntries = async (tenantId: string): Promise<readonly TOutboxEntry[]> => {
  const rows = await withStore(
    tenantId,
    'readonly',
    (store) => store.index(OUTBOX_INDEX_SEQ).getAll() as IDBRequest<TOutboxEntry[]>
  );
  return [...rows].sort((a, b) => a.seq - b.seq);
};

/** The party header's "+ ₹500 waiting to send" line reads this. */
export const listOutboxEntriesForParty = (
  tenantId: string,
  partyId: string
): Promise<TOutboxEntry[]> =>
  withStore(
    tenantId,
    'readonly',
    (store) => store.index(OUTBOX_INDEX_PARTY).getAll(partyId) as IDBRequest<TOutboxEntry[]>
  );

export const countOutboxEntries = (tenantId: string): Promise<number> =>
  withStore(tenantId, 'readonly', (store) => store.count() as IDBRequest<number>);

/** The next monotonic sequence number for this device's queue. */
export const nextOutboxSeq = async (tenantId: string): Promise<number> => {
  const entries = await listOutboxEntries(tenantId);
  const last = entries.at(-1);
  return last ? last.seq + 1 : 1;
};
