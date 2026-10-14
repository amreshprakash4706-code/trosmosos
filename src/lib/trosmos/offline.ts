/** IndexedDB-backed offline mutation queue for Notes, Tasks, and VFS metadata. */

const DB_NAME = "trosmos-offline";
const STORE = "mutations";

export type QueuedMutation = {
  id: string;
  idempotencyKey: string;
  op: string;
  payload: unknown;
  status: "pending" | "syncing" | "error" | "applied";
  error?: string;
  createdAt: number;
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueLocal(op: string, payload: unknown, idempotencyKey?: string): Promise<QueuedMutation> {
  const rec: QueuedMutation = {
    id: idempotencyKey || `off_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
    idempotencyKey: idempotencyKey || `off_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
    op,
    payload,
    status: "pending",
    createdAt: Date.now(),
    attempts: 0,
  };
  rec.id = rec.idempotencyKey;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return rec;
}

export async function listQueued(): Promise<QueuedMutation[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const rows = await new Promise<QueuedMutation[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedMutation[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateQueued(id: string, patch: Partial<QueuedMutation>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = get.result as QueuedMutation | undefined;
      if (!cur) return;
      store.put({ ...cur, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function removeQueued(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export async function flushQueue(
  apply: (rec: QueuedMutation) => Promise<unknown>,
): Promise<{ applied: number; failed: number }> {
  const rows = await listQueued();
  let applied = 0;
  let failed = 0;
  for (const rec of rows) {
    if (rec.status === "applied") {
      await removeQueued(rec.id);
      continue;
    }
    await updateQueued(rec.id, { status: "syncing", attempts: rec.attempts + 1 });
    try {
      await apply(rec);
      await removeQueued(rec.id);
      applied += 1;
    } catch (err) {
      failed += 1;
      await updateQueued(rec.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }
  return { applied, failed };
}
