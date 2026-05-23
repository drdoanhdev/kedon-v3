export type MediaUploadScope = 'don_kinh' | 'don_thuoc';
export type UploadSourceDevice = 'camera' | 'file_picker';

export interface DraftUploadItemLike {
  file: File;
  sourceDevice: UploadSourceDevice;
}

export interface PersistedDraftUploadItem {
  fileName: string;
  mimeType: string;
  sourceDevice: UploadSourceDevice;
  fileBlob: Blob;
  createdAt: string;
}

export interface PersistedBackgroundUploadTask {
  id?: number;
  scope: MediaUploadScope;
  ownerId: number;
  items: PersistedDraftUploadItem[];
  status: 'pending' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'kedon_background_uploads_v1';
const DB_VERSION = 1;
const STORE_NAME = 'tasks';

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function toPersistedItems(items: DraftUploadItemLike[]): PersistedDraftUploadItem[] {
  const now = new Date().toISOString();
  return items.map((item) => ({
    fileName: item.file.name || `upload-${Date.now()}`,
    mimeType: item.file.type || 'application/octet-stream',
    sourceDevice: item.sourceDevice,
    fileBlob: item.file,
    createdAt: now,
  }));
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('scope_status', ['scope', 'status'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueBackgroundUploadTask(
  scope: MediaUploadScope,
  ownerId: number,
  items: DraftUploadItemLike[]
): Promise<number | null> {
  if (items.length === 0) return null;
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    const payload: PersistedBackgroundUploadTask = {
      scope,
      ownerId,
      items: toPersistedItems(items),
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    const req = store.add(payload);
    req.onsuccess = () => resolve(Number(req.result));
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function listBackgroundUploadTasks(scope: MediaUploadScope): Promise<PersistedBackgroundUploadTask[]> {
  const db = await openDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('scope');
    const req = index.getAll(scope);

    req.onsuccess = () => {
      const rows = ((req.result || []) as PersistedBackgroundUploadTask[])
        .filter((row) => typeof row.ownerId === 'number' && Number.isFinite(row.ownerId));
      rows.sort((a, b) => {
        const at = new Date(a.createdAt || 0).getTime();
        const bt = new Date(b.createdAt || 0).getTime();
        return at - bt;
      });
      resolve(rows);
    };
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function getBackgroundUploadTask(taskId: number): Promise<PersistedBackgroundUploadTask | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(taskId);

    req.onsuccess = () => resolve((req.result as PersistedBackgroundUploadTask) || null);
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function removeBackgroundUploadTask(taskId: number): Promise<void> {
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(taskId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function updateBackgroundUploadTask(
  taskId: number,
  patch: Partial<Pick<PersistedBackgroundUploadTask, 'items' | 'status' | 'attempts' | 'lastError'>>
): Promise<PersistedBackgroundUploadTask | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(taskId);

    getReq.onsuccess = () => {
      const current = getReq.result as PersistedBackgroundUploadTask | undefined;
      if (!current) {
        resolve(null);
        return;
      }

      const next: PersistedBackgroundUploadTask = {
        ...current,
        ...patch,
        id: current.id,
        updatedAt: new Date().toISOString(),
      };

      const putReq = store.put(next);
      putReq.onsuccess = () => resolve(next);
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  });
}

export function persistedItemsToDraftQueue(items: PersistedDraftUploadItem[]): DraftUploadItemLike[] {
  return items.map((item) => ({
    file: new File([item.fileBlob], item.fileName || `upload-${Date.now()}`, {
      type: item.mimeType || 'application/octet-stream',
      lastModified: new Date(item.createdAt || Date.now()).getTime(),
    }),
    sourceDevice: item.sourceDevice,
  }));
}
