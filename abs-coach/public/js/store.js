// Saved data. Numbers live in localStorage; photos live in IndexedDB.
// Nothing here leaves the device unless you export a backup.

const KEY = 'corecheck.v1';
const DB_NAME = 'corecheck';
const STORE = 'photos';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save', e);
    return false;
  }
}

// ---------- photos ----------
let dbPromise = null;
const memory = new Map(); // used when IndexedDB is unavailable (some private windows)
let persistent = true;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    }).catch((e) => {
      console.warn('IndexedDB unavailable, photos kept in memory only', e);
      persistent = false;
      return null;
    });
  }
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const photosPersistent = () => persistent;

export async function putPhoto(id, blob) {
  const db = await openDb();
  if (!db) return void memory.set(id, blob);
  try {
    await tx(db, 'readwrite', (s) => s.put(blob, id));
  } catch (e) {
    console.warn('Photo save failed, keeping in memory', e);
    memory.set(id, blob);
  }
}

export async function getPhoto(id) {
  if (!id) return null;
  if (memory.has(id)) return memory.get(id);
  const db = await openDb();
  if (!db) return null;
  try {
    return (await tx(db, 'readonly', (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function clearPhotos() {
  memory.clear();
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  const db = await openDb();
  if (db) await tx(db, 'readwrite', (s) => s.clear()).catch(() => {});
}

const urls = new Map();
export async function photoUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const blob = await getPhoto(id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.clear();
  } catch {}
  return clearPhotos();
}

// Ask the browser not to clear our storage when space runs low.
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {}
}

// ---------- backup ----------
const toDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

function dataUrlToBlob(url) {
  const [head, b64] = String(url).split(',');
  const mime = /^data:([^;,]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup(state) {
  const photos = {};
  for (const e of state.entries) {
    for (const id of Object.values(e.photos || {})) {
      const b = await getPhoto(id);
      if (b) photos[id] = await toDataUrl(b);
    }
  }
  return new Blob([JSON.stringify({ app: 'core-check', version: 1, exportedAt: new Date().toISOString(), state, photos })], { type: 'application/json' });
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'core-check' || !data.state || !Array.isArray(data.state.entries)) throw new Error('That file is not a Core Check backup.');
  await clearPhotos();
  for (const [id, url] of Object.entries(data.photos || {})) await putPhoto(id, dataUrlToBlob(url));
  saveState(data.state);
  return data.state;
}
