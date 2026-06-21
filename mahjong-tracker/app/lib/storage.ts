// Minimal dependency-free IndexedDB wrapper. Replaces the prototype's
// `window.storage`. Everything persists ON-DEVICE — no server, no accounts.
// Photos are stored as Blobs (IndexedDB supports them natively).

import type { Win } from './types';

const DB_NAME = 'mahjong-tracker';
const DB_VERSION = 1;

// Object stores
const STORE_HAND_COUNTS = 'handCounts'; // key: handId  -> value: number
const STORE_HAND_NOTES = 'handNotes'; // key: handId  -> value: notation string
const STORE_WINS = 'wins'; // keyPath: id
const STORE_META = 'meta'; // key: string -> value: any (e.g. shareCount)

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HAND_COUNTS)) db.createObjectStore(STORE_HAND_COUNTS);
      if (!db.objectStoreNames.contains(STORE_HAND_NOTES)) db.createObjectStore(STORE_HAND_NOTES);
      if (!db.objectStoreNames.contains(STORE_WINS)) db.createObjectStore(STORE_WINS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function getAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

function getAllKeys(store: string): Promise<IDBValidKey[]> {
  return tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());
}

// ---- Hand win counts ------------------------------------------------------

export async function loadHandCounts(): Promise<Record<string, number>> {
  try {
    const [keys, vals] = await Promise.all([getAllKeys(STORE_HAND_COUNTS), getAll<number>(STORE_HAND_COUNTS)]);
    const out: Record<string, number> = {};
    keys.forEach((k, i) => (out[String(k)] = vals[i]));
    return out;
  } catch {
    return {};
  }
}

export async function setHandCount(handId: string, count: number): Promise<void> {
  await tx(STORE_HAND_COUNTS, 'readwrite', (s) => s.put(count, handId));
}

// ---- Hand notation overrides ----------------------------------------------

export async function loadHandNotes(): Promise<Record<string, string>> {
  try {
    const [keys, vals] = await Promise.all([getAllKeys(STORE_HAND_NOTES), getAll<string>(STORE_HAND_NOTES)]);
    const out: Record<string, string> = {};
    keys.forEach((k, i) => (out[String(k)] = vals[i]));
    return out;
  } catch {
    return {};
  }
}

export async function setHandNote(handId: string, notation: string): Promise<void> {
  await tx(STORE_HAND_NOTES, 'readwrite', (s) => s.put(notation, handId));
}

// ---- Wins journal ---------------------------------------------------------

export async function loadWins(): Promise<Win[]> {
  try {
    const wins = await getAll<Win>(STORE_WINS);
    return wins.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveWin(win: Win): Promise<void> {
  await tx(STORE_WINS, 'readwrite', (s) => s.put(win));
}

export async function deleteWin(id: string): Promise<void> {
  await tx(STORE_WINS, 'readwrite', (s) => s.delete(id));
}

// ---- Meta (analytics, misc) ----------------------------------------------

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await tx<T>(STORE_META, 'readonly', (s) => s.get(key));
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await tx(STORE_META, 'readwrite', (s) => s.put(value, key));
}
