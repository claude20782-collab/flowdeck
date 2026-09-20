/* ============================================================
 * Persistence layer
 * - localStorage: small, fast-restoring state (settings, timer)
 * - IndexedDB: structured app data (tasks, notes, sessions, ...)
 *
 * Zustand persist supports async storages; we expose a
 * StateStorage-compatible adapter over a single IDB database
 * with one object store, one key per persisted slice.
 * ============================================================ */

import type { StateStorage } from "zustand/middleware";

const DB_NAME = "flowdeck";
const STORE = "kv";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

/** Storage adapter backed by IndexedDB (async). */
export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(name);
        req.onsuccess = () => resolve((req.result as string) ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* storage full or unavailable — fail silently, app still works in-memory */
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* ignore */
    }
  },
};

/** Wipe all Flowdeck keys from both storages (used by "Reset everything"). */
export async function wipeAllStorage(keys: string[]): Promise<void> {
  try {
    for (const k of keys) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const k of keys) store.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

/** Approximate persisted-size report (bytes) for the Data settings panel. */
export async function storageReport(keys: string[]): Promise<{ key: string; bytes: number }[]> {
  const report: { key: string; bytes: number }[] = [];
  for (const k of keys) {
    let bytes = 0;
    try {
      const ls = localStorage.getItem(k);
      if (ls) bytes += ls.length;
    } catch { /* ignore */ }
    try {
      const v = await idbStorage.getItem(k);
      if (v) bytes += v.length;
    } catch { /* ignore */ }
    report.push({ key: k, bytes });
  }
  return report;
}
