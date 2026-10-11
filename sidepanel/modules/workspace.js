/**
 * workspace.js — Real PC Workspace and File System Access Manager for Sidecode
 *
 * Provides direct, in-place editing of physical folders on the user's PC.
 * Maintains tree hierarchies, parent handles, transactional file operations,
 * and multi-file project discovery.
 */

import { saveWorkspaceHandle, getWorkspaceHandle, clearWorkspaceHandle } from './workspaceDB.js';
import { queryDirectoryPermission, requestDirectoryPermission } from './permissions.js';

let currentRootHandle = null;
let currentTree = null;
let workspaceListeners = [];

export function onWorkspaceChange(listener) {
  if (typeof listener === 'function') {
    workspaceListeners.push(listener);
  }
}

function notifyWorkspaceChange(state) {
  workspaceListeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.error('Workspace listener error:', e);
    }
  });
}

export function isWorkspaceOpen() {
  return currentRootHandle !== null;
}

export function getWorkspaceRootHandle() {
  return currentRootHandle;
}

export function getWorkspaceName() {
  return currentRootHandle ? currentRootHandle.name : null;
}

export function getWorkspaceTree() {
  return currentTree;
}

/**
 * Open a PC folder using window.showDirectoryPicker()
 */
export async function openWorkspaceFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('File System Access API (showDirectoryPicker) is not supported or blocked in this browser.');
  }

  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  currentRootHandle = handle;

  // Persist handle to IndexedDB
  await saveWorkspaceHandle(handle);

  // Scan tree
  currentTree = await scanWorkspaceTree(handle);

  notifyWorkspaceChange({
    action: 'opened',
    name: handle.name,
    tree: currentTree,
    handle
  });

  return { handle, tree: currentTree };
}

/**
 * Attempt to restore previously opened workspace from IndexedDB
 * @returns {Promise<{ status: 'granted'|'prompt'|'none', handle: FileSystemDirectoryHandle|null, tree: any|null }>}
 */
export async function restoreSavedWorkspace() {
  const handle = await getWorkspaceHandle();
  if (!handle) {
    return { status: 'none', handle: null, tree: null };
  }

  currentRootHandle = handle;
  const permission = await queryDirectoryPermission(handle);

  if (permission === 'granted') {
    currentTree = await scanWorkspaceTree(handle);
    notifyWorkspaceChange({
      action: 'restored',
      name: handle.name,
      tree: currentTree,
      handle
    });
    return { status: 'granted', handle, tree: currentTree };
  }

  return { status: 'prompt', handle, tree: null };
}

/**
 * Request permission for the restored workspace
 */
export async function reauthorizeWorkspace() {
  if (!currentRootHandle) return false;
  const perm = await requestDirectoryPermission(currentRootHandle);
  if (perm === 'granted') {
    currentTree = await scanWorkspaceTree(currentRootHandle);
    notifyWorkspaceChange({
      action: 'reconnected',
      name: currentRootHandle.name,
      tree: currentTree,
      handle: currentRootHandle
    });
    return true;
  }
  return false;
}

/**
 * Close the current workspace and return to Scratchpad mode
 */
export async function closeWorkspaceFolder() {
  currentRootHandle = null;
  currentTree = null;
  await clearWorkspaceHandle();

  notifyWorkspaceChange({
    action: 'closed',
    name: null,
    tree: null,
    handle: null
  });
}

/**
 * Recursively scans directory and builds hierarchical tree with parentHandle and relative paths
 */
export async function scanWorkspaceTree(dirHandle = currentRootHandle, depth = 0, maxDepth = 12, parentHandle = null, dirRelPath = '') {
  if (!dirHandle) return null;

  const node = {
    name: dirHandle.name,
    kind: 'directory',
    handle: dirHandle,
    parentHandle,
    path: dirRelPath,
    relativePath: dirRelPath || '.',
    children: [],
    filesCount: 0,
    dirsCount: 0
  };

  try {
    for await (const [name, entry] of dirHandle.entries()) {
      // Only ignore internal .git repository directory
      if (entry.kind === 'directory' && name === '.git') {
        continue;
      }

      const entryRelPath = dirRelPath ? `${dirRelPath}/${name}` : name;

      if (entry.kind === 'directory') {
        node.dirsCount++;
        if (depth < maxDepth) {
          const childDir = await scanWorkspaceTree(entry, depth + 1, maxDepth, dirHandle, entryRelPath);
          node.children.push(childDir);
          node.filesCount += childDir.filesCount;
          node.dirsCount += childDir.dirsCount;
        } else {
          node.children.push({
            name,
            kind: 'directory',
            handle: entry,
            parentHandle: dirHandle,
            path: entryRelPath,
            children: []
          });
        }
      } else if (entry.kind === 'file') {

        node.filesCount++;
        let size = 0;
        try {
          const f = await entry.getFile();
          size = f.size;
        } catch (_) {}
        node.children.push({
          name,
          kind: 'file',
          size,
          handle: entry,
          parentHandle: dirHandle,
          path: entryRelPath
        });
      }
    }

    // Sort: directories first, then alphabetical
    node.children.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name);
      return a.kind === 'directory' ? -1 : 1;
    });

    if (depth === 0) {
      currentTree = node;
    }
    return node;
  } catch (err) {
    console.error(`Error scanning directory "${dirHandle.name}":`, err);
    throw err;
  }
}

/**
 * Refresh current workspace tree
 */
export async function refreshWorkspaceTree() {
  if (!currentRootHandle) return null;
  currentTree = await scanWorkspaceTree(currentRootHandle);
  notifyWorkspaceChange({
    action: 'refreshed',
    name: currentRootHandle.name,
    tree: currentTree,
    handle: currentRootHandle
  });
  return currentTree;
}

/**
 * Read text file from disk
 */
export async function readFileFromDisk(fileHandle) {
  if (!fileHandle) throw new Error('No file handle provided.');
  const file = await fileHandle.getFile();
  return await file.text();
}

/**
 * Save text directly to physical disk using createWritable()
 */
export async function saveFileToDisk(fileHandle, text) {
  if (!fileHandle) throw new Error('No file handle provided.');
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

/**
 * Create a new file in a specific directory
 */
export async function createFileInWorkspace(parentDirHandle, filename, initialContent = '') {
  const targetDir = parentDirHandle || currentRootHandle;
  if (!targetDir) throw new Error('No active workspace folder.');

  const fileHandle = await targetDir.getFileHandle(filename, { create: true });
  if (initialContent) {
    const writable = await fileHandle.createWritable();
    await writable.write(initialContent);
    await writable.close();
  }

  await refreshWorkspaceTree();
  return fileHandle;
}

/**
 * Create a new subfolder in a specific directory
 */
export async function createFolderInWorkspace(parentDirHandle, folderName) {
  const targetDir = parentDirHandle || currentRootHandle;
  if (!targetDir) throw new Error('No active workspace folder.');

  const subDir = await targetDir.getDirectoryHandle(folderName, { create: true });
  await refreshWorkspaceTree();
  return subDir;
}

/**
 * Rename an entry with verified transactional copy+verify+delete
 */
export async function renameWorkspaceEntry(parentDirHandle, handle, newName) {
  const parent = parentDirHandle || currentRootHandle;
  if (!parent) throw new Error('No parent directory found.');
  if (!handle) throw new Error('No item specified for rename.');

  if (handle === currentRootHandle) {
    throw new Error('The root workspace folder cannot be renamed from within Sidecode. Please rename it in Windows File Explorer.');
  }

  const trimmedNewName = (newName || '').trim();
  if (!trimmedNewName) {
    throw new Error('Filename or folder name cannot be empty.');
  }

  if (trimmedNewName === handle.name) {
    return handle;
  }

  if (/[\\/:*?"<>|]/.test(trimmedNewName)) {
    throw new Error('A file or folder name cannot contain characters: \\ / : * ? " < > |');
  }

  const isCaseOnlyChange = handle.name.toLowerCase() === trimmedNewName.toLowerCase();

  // If not a case-only change, check if an entry with this name already exists in parent
  if (!isCaseOnlyChange) {
    let existingKind = null;
    try {
      await parent.getFileHandle(trimmedNewName);
      existingKind = 'file';
    } catch (e) {
      if (e.name === 'TypeMismatchError') {
        existingKind = 'directory';
      } else {
        try {
          await parent.getDirectoryHandle(trimmedNewName);
          existingKind = 'directory';
        } catch (_) {}
      }
    }

    if (existingKind === 'file') {
      throw new Error(`A file named "${trimmedNewName}" already exists in this location. Please choose a different name.`);
    } else if (existingKind === 'directory') {
      throw new Error(`A folder named "${trimmedNewName}" already exists in this location. Please choose a different name.`);
    }
  }

  // Try native move first
  if (typeof handle.move === 'function') {
    try {
      await handle.move(trimmedNewName);
      await refreshWorkspaceTree();
      return handle;
    } catch (_) {
      // Native move unsupported on local PC filesystems, proceed to transactional fallback
    }
  }

  // If case-only rename on Windows NTFS, use a 2-step rename to avoid same-file conflict
  if (isCaseOnlyChange) {
    const tempName = `.__sidecode_rename_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const intermediateHandle = await executeCopyAndDelete(parent, handle, tempName);
    const finalHandle = await executeCopyAndDelete(parent, intermediateHandle, trimmedNewName);
    await refreshWorkspaceTree();
    return finalHandle;
  }

  const resultHandle = await executeCopyAndDelete(parent, handle, trimmedNewName);
  await refreshWorkspaceTree();
  return resultHandle;
}

async function executeCopyAndDelete(parent, handle, targetName) {
  if (handle.kind === 'file') {
    const file = await handle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    const newFileHandle = await parent.getFileHandle(targetName, { create: true });
    const writable = await newFileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    const verifyFile = await newFileHandle.getFile();
    if (verifyFile.size !== file.size) {
      try { await parent.removeEntry(targetName); } catch (_) {}
      throw new Error(`Integrity check failed: new file size does not match original. Original preserved.`);
    }

    await safeRemoveEntry(parent, handle.name, false);
    return newFileHandle;
  } else if (handle.kind === 'directory') {
    const newDirHandle = await parent.getDirectoryHandle(targetName, { create: true });
    await copyDirectoryRecursive(handle, newDirHandle);
    await safeRemoveEntry(parent, handle.name, true);
    return newDirHandle;
  } else {
    throw new Error(`Unsupported handle kind "${handle.kind}".`);
  }
}

async function safeRemoveEntry(parentDir, entryName, isRecursive) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await parentDir.removeEntry(entryName, { recursive: isRecursive });
      return;
    } catch (err) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}

async function copyDirectoryRecursive(srcDir, destDir) {
  for await (const [name, entry] of srcDir.entries()) {
    if (entry.kind === 'file') {
      const f = await entry.getFile();
      const destFile = await destDir.getFileHandle(name, { create: true });
      const w = await destFile.createWritable();
      await w.write(await f.arrayBuffer());
      await w.close();
    } else if (entry.kind === 'directory') {
      const destSub = await destDir.getDirectoryHandle(name, { create: true });
      await copyDirectoryRecursive(entry, destSub);
    }
  }
}

/**
 * Delete a file or folder from its parent directory
 */
export async function deleteWorkspaceEntry(parentDirHandle, name, isDirectory = false) {
  const parent = parentDirHandle || currentRootHandle;
  if (!parent) throw new Error('No parent directory found.');

  await safeRemoveEntry(parent, name, isDirectory);
  await refreshWorkspaceTree();
  return true;
}

/**
 * Gather all workspace files for multi-file cloud compilation
 * @returns {Promise<Array<{ path: string, filename: string, contents: string, handle: FileSystemFileHandle }>>}
 */
export async function collectAllWorkspaceFiles(node = currentTree) {
  if (!node) return [];
  const results = [];

  async function traverse(current) {
    if (current.kind === 'file') {
      try {
        const text = await readFileFromDisk(current.handle);
        results.push({
          path: current.path,
          filename: current.name,
          contents: text,
          handle: current.handle
        });
      } catch (err) {
        console.warn(`Could not read workspace file "${current.name}" for compilation:`, err);
      }
    } else if (current.kind === 'directory' && Array.isArray(current.children)) {
      for (const child of current.children) {
        await traverse(child);
      }
    }
  }

  await traverse(node);
  return results;
}

/**
 * Open single file dialog from user PC
 * @returns {Promise<{ handle: FileSystemFileHandle, name: string, path: string, content: string }|null>}
 */
export async function openFileDialog() {
  if (typeof window.showOpenFilePicker !== 'function') {
    throw new Error('File System Access API (showOpenFilePicker) is not supported in this browser.');
  }
  const [handle] = await window.showOpenFilePicker({ multiple: false });
  if (!handle) return null;
  const file = await handle.getFile();
  const content = await file.text();
  return {
    handle,
    name: handle.name,
    path: handle.name,
    content
  };
}

/**
 * Save As dialog to write content to a chosen PC file location
 * @param {string} content
 * @param {string} defaultName
 * @returns {Promise<{ handle: FileSystemFileHandle, name: string }|null>}
 */
export async function saveFileAsDialog(content, defaultName = 'untitled.txt') {
  if (typeof window.showSaveFilePicker !== 'function') {
    throw new Error('File System Access API (showSaveFilePicker) is not supported in this browser.');
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: defaultName
  });
  if (!handle) return null;
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return { handle, name: handle.name };
}
