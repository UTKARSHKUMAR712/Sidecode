/**
 * workspaceDB.js — IndexedDB handle persistence for Sidecode
 *
 * Stores and retrieves FileSystemDirectoryHandle instances across sessions.
 * Chromium allows directory handles to be serialized in IndexedDB via the Structured Clone Algorithm.
 */

const DB_NAME = 'SidecodeWorkspaceDB';
const DB_VERSION = 1;
const STORE_HANDLES = 'workspace_handles';
const CURRENT_WORKSPACE_KEY = 'active_workspace';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save directory handle for the current active workspace
 * @param {FileSystemDirectoryHandle} handle
 */
export async function saveWorkspaceHandle(handle) {
  if (!handle) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLES, 'readwrite');
    tx.objectStore(STORE_HANDLES).put({
      id: CURRENT_WORKSPACE_KEY,
      handle,
      name: handle.name,
      updatedAt: new Date().toISOString()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve saved directory handle for the active workspace
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function getWorkspaceHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get(CURRENT_WORKSPACE_KEY);
      req.onsuccess = () => resolve(req.result?.handle || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not read workspace handle from IndexedDB:', err);
    return null;
  }
}

/**
 * Clear stored workspace handle
 */
export async function clearWorkspaceHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).delete(CURRENT_WORKSPACE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Could not clear workspace handle from IndexedDB:', err);
  }
}
