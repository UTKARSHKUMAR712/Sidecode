/**
 * explorer.js — Authentic VS Code-Style File Explorer for Sidecode
 *
 * Implements:
 * - Pixel-perfect VS Code dark theme styling (matching Material / VS Code Workbench)
 * - Custom file & folder icons (JS, HTML, CSS, Git, JSON, NPM, README, C++, Rust, Python)
 * - Expand/collapse directory toggles with chevron animations
 * - Indent guide lines
 * - Action buttons: New File (+📄), New Folder (+📁), Refresh (↻), Collapse All (⮑)
 * - Safe file CRUD (Create, Read, Rename, Delete)
 */

import {
  getWorkspaceTree,
  getWorkspaceName,
  createFileInWorkspace,
  createFolderInWorkspace,
  renameWorkspaceEntry,
  deleteWorkspaceEntry,
  refreshWorkspaceTree,
  closeWorkspaceFolder,
  openWorkspaceFolder
} from './workspace.js';

let containerEl = null;
let selectedFolderHandle = null;
let activeFilePath = null;
let onFileSelectCallback = null;
let isExplorerOpen = true;
let isWorkspaceRootExpanded = true;
const collapsedDirPaths = new Set();

const SVGS = {
  chevronDown: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M3.22 6.22a.75.75 0 0 1 1.06 0L8 9.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 0-1.06z"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/></svg>`,
  newFile: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6L9 1zm3 8h-2v2a1 1 0 1 1-2 0V9H6a1 1 0 1 1 0-2h2V5a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2z"/></svg>`,
  newFolder: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.086a1.5 1.5 0 0 1 1.06.44L8.087 3.88A.5.5 0 0 0 8.44 4H13.5A1.5 1.5 0 0 1 15 5.5v2.75a.75.75 0 0 1-1.5 0V5.5a.5.5 0 0 0-.5-.5H8.44a1.5 1.5 0 0 1-1.06-.44L5.94 3.12A.5.5 0 0 0 5.586 3H2.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5H8a.75.75 0 0 1 0 1.5H2.5A1.5 1.5 0 0 1 1 13V3.5zm11.25 6.25a.75.75 0 0 1 .75.75v1.25H14.25a.75.75 0 0 1 0 1.5H13v1.25a.75.75 0 0 1-1.5 0V13.25H10.25a.75.75 0 0 1 0-1.5H11.5V10.5a.75.75 0 0 1 .75-.75z"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.418A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>`,
  collapseAll: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h11A1.5 1.5 0 0 1 15 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9zM2.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-11zM4 7.5h8v1H4v-1z"/></svg>`,
  moreOptions: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="14" cy="8" r="1.5"/></svg>`
};

function getFolderSvg(name, isOpen) {
  let color = '#dcb67a'; // Default amber/yellow
  if (name === 'debug') color = '#e6a147';
  else if (name === 'docs') color = '#388bfd';
  else if (name === 'icons') color = '#26a69a';
  else if (name === 'node_modules') color = '#8bc34a';
  else if (name === 'sidepanel') color = '#78909c';

  if (isOpen) {
    return `<svg class="tree-icon-svg" width="16" height="16" viewBox="0 0 16 16"><path fill="${color}" d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H8.2L6.85 2.65A1.5 1.5 0 0 0 5.8 2H1.5z"/></svg>`;
  }
  return `<svg class="tree-icon-svg" width="16" height="16" viewBox="0 0 16 16"><path fill="${color}" d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V5.5A1.5 1.5 0 0 0 14.5 4H8.2L6.85 2.65A1.5 1.5 0 0 0 5.8 2H1.5z"/></svg>`;
}

export function getFileIconHtml(filename) {
  const lower = filename.toLowerCase();

  if (lower === 'package.json' || lower === 'package-lock.json') {
    return `<span class="vsc-badge vsc-badge-npm">npm</span>`;
  }
  if (lower === '.gitignore') {
    return `<span class="vsc-badge vsc-badge-git">⌥</span>`;
  }
  if (lower === 'readme.md' || lower.endsWith('.md')) {
    return `<span class="vsc-badge vsc-badge-info">ℹ</span>`;
  }

  const ext = lower.split('.').pop();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return `<span class="vsc-badge vsc-badge-js">JS</span>`;
    case 'ts':
      return `<span class="vsc-badge vsc-badge-ts">TS</span>`;
    case 'html':
    case 'htm':
      return `<span class="vsc-badge vsc-badge-html">&lt;&gt;</span>`;
    case 'css':
    case 'scss':
    case 'less':
      return `<span class="vsc-badge vsc-badge-css">#</span>`;
    case 'json':
      return `<span class="vsc-badge vsc-badge-json">{}</span>`;
    case 'cpp':
    case 'cc':
    case 'cxx':
      return `<span class="vsc-badge vsc-badge-cpp">C++</span>`;
    case 'c':
      return `<span class="vsc-badge vsc-badge-c">C</span>`;
    case 'h':
    case 'hpp':
      return `<span class="vsc-badge vsc-badge-h">H</span>`;
    case 'rs':
      return `<span class="vsc-badge vsc-badge-rs">RS</span>`;
    case 'py':
      return `<span class="vsc-badge vsc-badge-py">PY</span>`;
    case 'go':
      return `<span class="vsc-badge vsc-badge-go">GO</span>`;
    case 'java':
      return `<span class="vsc-badge vsc-badge-java">☕</span>`;
    default:
      return `<span class="vsc-badge vsc-badge-file">📄</span>`;
  }
}

let activeContextMenu = null;

export function closeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

export function initExplorer(container, onFileSelect) {
  containerEl = container;
  onFileSelectCallback = onFileSelect;

  // Disable default browser context menu and show custom VS Code explorer menu
  containerEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = e.target.closest('.vsc-tree-row');
    const node = row ? row.__node : null;
    showContextMenu(e, node);
  });

  window.addEventListener('click', closeContextMenu);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu();
  });
}

export function toggleExplorer(forceState = null) {
  const sidebar = document.getElementById('explorer-sidebar');
  const splitter = document.getElementById('explorer-splitter');
  if (!sidebar) return;

  isExplorerOpen = forceState !== null ? forceState : !isExplorerOpen;
  sidebar.hidden = !isExplorerOpen;
  if (splitter) splitter.hidden = !isExplorerOpen;

  import('./editor.js').then(({ layoutEditor }) => layoutEditor());
}

export function isExplorerVisible() {
  return isExplorerOpen;
}

export function setSelectedFile(path) {
  activeFilePath = path;
  highlightActiveNode();
}

function highlightActiveNode() {
  if (!containerEl) return;
  containerEl.querySelectorAll('.tree-node-file').forEach((node) => {
    if (node.dataset.path === activeFilePath) {
      node.classList.add('selected');
    } else {
      node.classList.remove('selected');
    }
  });
}

/**
 * Re-render explorer tree view
 * @param {Array<string>} dirtyPaths - Paths of open tabs with unsaved changes
 */
export function renderExplorerTree(dirtyPaths = []) {
  if (!containerEl) return;
  const tree = getWorkspaceTree();
  const wsName = getWorkspaceName();

  containerEl.innerHTML = '';

  // 1. Top Explorer Title Bar
  const titleBar = document.createElement('div');
  titleBar.className = 'vsc-explorer-topbar';
  titleBar.innerHTML = `
    <span class="vsc-explorer-heading">Explorer</span>
    <button class="vsc-topbar-action" id="vsc-more-actions" title="More Actions...">${SVGS.moreOptions}</button>
  `;
  containerEl.appendChild(titleBar);

  // If no workspace folder is open
  if (!tree) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'vsc-explorer-empty';
    emptyDiv.innerHTML = `
      <p class="vsc-empty-title">NO FOLDER OPENED</p>
      <p class="vsc-empty-desc">You have not yet opened a folder.</p>
      <button id="btn-open-folder-empty" class="btn-vsc-primary">Open Folder</button>
    `;
    emptyDiv.querySelector('#btn-open-folder-empty').addEventListener('click', async () => {
      try {
        await openWorkspaceFolder();
      } catch (err) {
        if (err.name !== 'AbortError') alert(`Could not open folder: ${err.message}`);
      }
    });
    containerEl.appendChild(emptyDiv);
    return;
  }

  // 2. Workspace Root Section Header (Collapsible)
  const rootHeader = document.createElement('div');
  rootHeader.className = 'vsc-section-header';
  rootHeader.innerHTML = `
    <div class="vsc-section-title-row">
      <span class="vsc-chevron ${isWorkspaceRootExpanded ? 'open' : ''}">${isWorkspaceRootExpanded ? SVGS.chevronDown : SVGS.chevronRight}</span>
      <span class="vsc-section-name" title="${wsName}">${wsName}</span>
    </div>
    <div class="vsc-section-actions">
      <button class="vsc-action-btn" id="vsc-add-file" title="New File">${SVGS.newFile}</button>
      <button class="vsc-action-btn" id="vsc-add-folder" title="New Folder">${SVGS.newFolder}</button>
      <button class="vsc-action-btn" id="vsc-refresh" title="Refresh Explorer">${SVGS.refresh}</button>
      <button class="vsc-action-btn" id="vsc-collapse-all" title="Collapse Folders in Explorer">${SVGS.collapseAll}</button>
    </div>
  `;

  // Actions
  rootHeader.querySelector('.vsc-section-title-row').addEventListener('click', () => {
    isWorkspaceRootExpanded = !isWorkspaceRootExpanded;
    renderExplorerTree(dirtyPaths);
  });
  rootHeader.querySelector('#vsc-add-file').addEventListener('click', (e) => {
    e.stopPropagation();
    handleCreateFile();
  });
  rootHeader.querySelector('#vsc-add-folder').addEventListener('click', (e) => {
    e.stopPropagation();
    handleCreateFolder();
  });
  rootHeader.querySelector('#vsc-refresh').addEventListener('click', (e) => {
    e.stopPropagation();
    refreshWorkspaceTree();
  });
  rootHeader.querySelector('#vsc-collapse-all').addEventListener('click', (e) => {
    e.stopPropagation();
    collapseAllDirectories(tree);
    renderExplorerTree(dirtyPaths);
  });

  containerEl.appendChild(rootHeader);

  // 3. Tree Content Container
  if (isWorkspaceRootExpanded) {
    const treeContainer = document.createElement('div');
    treeContainer.className = 'vsc-tree-container';

    renderTreeNode(tree, treeContainer, 0, dirtyPaths);
    containerEl.appendChild(treeContainer);
  }

  highlightActiveNode();
}

function collapseAllDirectories(node) {
  if (!node) return;
  if (node.kind === 'directory' && node.path) {
    collapsedDirPaths.add(node.path);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(collapseAllDirectories);
  }
}

function renderTreeNode(node, parentEl, depth = 0, dirtyPaths = []) {
  if (depth === 0) {
    // Top-level children of the workspace
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => renderTreeNode(child, parentEl, 1, dirtyPaths));
    }
    return;
  }

  const row = document.createElement('div');
  row.className = `vsc-tree-row ${node.kind === 'directory' ? 'vsc-row-dir' : 'tree-node-file'}`;
  row.style.paddingLeft = `${depth * 14 + 6}px`;
  row.dataset.path = node.path;
  row.__node = node;

  const isDirty = dirtyPaths.includes(node.path);

  if (node.kind === 'directory') {
    const isCollapsed = collapsedDirPaths.has(node.path);
    const chevronHtml = isCollapsed ? SVGS.chevronRight : SVGS.chevronDown;
    const folderSvg = getFolderSvg(node.name, !isCollapsed);

    row.innerHTML = `
      <span class="vsc-chevron-dir">${chevronHtml}</span>
      <span class="vsc-folder-icon">${folderSvg}</span>
      <span class="vsc-row-label">${node.name}</span>
    `;

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'vsc-tree-children';
    childrenContainer.style.display = isCollapsed ? 'none' : 'block';

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFolderHandle = node.handle;

      if (collapsedDirPaths.has(node.path)) {
        collapsedDirPaths.delete(node.path);
      } else {
        collapsedDirPaths.add(node.path);
      }

      containerEl.querySelectorAll('.vsc-row-dir').forEach((n) => n.classList.remove('selected'));
      row.classList.add('selected');

      renderExplorerTree(dirtyPaths);
    });

    parentEl.appendChild(row);
    parentEl.appendChild(childrenContainer);

    if (!isCollapsed && Array.isArray(node.children)) {
      node.children.forEach((child) => renderTreeNode(child, childrenContainer, depth + 1, dirtyPaths));
    }
  } else {
    // File Node
    const fileBadge = getFileIconHtml(node.name);
    row.innerHTML = `
      <span class="vsc-file-indent-spacer"></span>
      <span class="vsc-file-icon-wrap">${fileBadge}</span>
      <span class="vsc-row-label">${node.name}</span>
      <span class="vsc-dirty-indicator ${isDirty ? '' : 'hidden'}">●</span>
      <div class="vsc-row-actions">
        <button class="vsc-row-action-btn btn-rename" title="Rename">✏️</button>
        <button class="vsc-row-action-btn btn-delete" title="Delete">🗑️</button>
      </div>
    `;

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      activeFilePath = node.path;
      highlightActiveNode();
      if (onFileSelectCallback) {
        onFileSelectCallback(node);
      }
    });

    // Rename
    row.querySelector('.btn-rename').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newName = prompt(`Enter new filename for "${node.name}":`, node.name);
      if (newName && newName !== node.name) {
        try {
          await renameWorkspaceEntry(node.parentHandle, node.handle, newName);
        } catch (err) {
          alert(`Rename failed: ${err.message}`);
        }
      }
    });

    // Delete
    row.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to permanently delete "${node.name}" from disk?`)) {
        try {
          await deleteWorkspaceEntry(node.parentHandle, node.name, false);
          import('./tabs.js').then(({ getTabByPath, closeTab }) => {
            const openTab = getTabByPath(node.path);
            if (openTab) closeTab(openTab.id);
          });
        } catch (err) {
          alert(`Delete failed: ${err.message}`);
        }
      }
    });

    parentEl.appendChild(row);
  }
}

function showContextMenu(e, targetNode) {
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'vsc-context-menu';

  const isDir = targetNode && targetNode.kind === 'directory';
  const isFile = targetNode && targetNode.kind === 'file';

  if (isDir) {
    menu.innerHTML = `
      <div class="vsc-context-entry" id="ctx-new-file"><span>📄 New File...</span></div>
      <div class="vsc-context-entry" id="ctx-new-folder"><span>📁 New Folder...</span></div>
      <div class="vsc-context-separator"></div>
      <div class="vsc-context-entry" id="ctx-rename"><span>✏️ Rename...</span></div>
      <div class="vsc-context-entry" id="ctx-delete"><span>🗑️ Delete</span></div>
    `;
  } else if (isFile) {
    menu.innerHTML = `
      <div class="vsc-context-entry" id="ctx-open"><span>👁️ Open</span></div>
      <div class="vsc-context-entry" id="ctx-new-file"><span>📄 New File...</span></div>
      <div class="vsc-context-entry" id="ctx-new-folder"><span>📁 New Folder...</span></div>
      <div class="vsc-context-separator"></div>
      <div class="vsc-context-entry" id="ctx-rename"><span>✏️ Rename...</span></div>
      <div class="vsc-context-entry" id="ctx-delete"><span>🗑️ Delete</span></div>
    `;
  } else {
    menu.innerHTML = `
      <div class="vsc-context-entry" id="ctx-new-file"><span>📄 New File...</span></div>
      <div class="vsc-context-entry" id="ctx-new-folder"><span>📁 New Folder...</span></div>
      <div class="vsc-context-separator"></div>
      <div class="vsc-context-entry" id="ctx-refresh"><span>↻ Refresh Explorer</span></div>
    `;
  }

  // Calculate coordinates to keep within side panel bounds
  const x = Math.min(e.clientX, window.innerWidth - 170);
  const y = Math.min(e.clientY, window.innerHeight - 200);
  menu.style.left = `${Math.max(4, x)}px`;
  menu.style.top = `${Math.max(4, y)}px`;

  menu.querySelector('#ctx-open')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    if (onFileSelectCallback && targetNode) onFileSelectCallback(targetNode);
  });

  menu.querySelector('#ctx-new-file')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    const parentHandle = isDir ? targetNode.handle : (isFile ? targetNode.parentHandle : null);
    const parentName = isDir ? targetNode.name : (isFile ? 'current folder' : 'workspace');
    const parentPath = isDir ? targetNode.path : (isFile ? targetNode.path.split('/').slice(0, -1).join('/') : '');
    handleCreateFile(parentHandle, parentName, parentPath);
  });

  menu.querySelector('#ctx-new-folder')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    const parentHandle = isDir ? targetNode.handle : (isFile ? targetNode.parentHandle : null);
    const parentName = isDir ? targetNode.name : (isFile ? 'current folder' : 'workspace');
    const parentPath = isDir ? targetNode.path : (isFile ? targetNode.path.split('/').slice(0, -1).join('/') : '');
    handleCreateFolder(parentHandle, parentName, parentPath);
  });

  menu.querySelector('#ctx-rename')?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    if (!targetNode) return;
    const newName = prompt(`Enter new name for "${targetNode.name}":`, targetNode.name);
    if (newName && newName !== targetNode.name) {
      try {
        await renameWorkspaceEntry(targetNode.parentHandle, targetNode.handle, newName);
      } catch (err) {
        alert(`Rename failed: ${err.message}`);
      }
    }
  });

  menu.querySelector('#ctx-delete')?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    if (!targetNode) return;
    if (confirm(`Are you sure you want to delete "${targetNode.name}" permanently from disk?`)) {
      try {
        await deleteWorkspaceEntry(targetNode.parentHandle, targetNode.name, targetNode.kind === 'directory');
        if (targetNode.kind === 'file') {
          import('./tabs.js').then(({ getTabByPath, closeTab }) => {
            const openTab = getTabByPath(targetNode.path);
            if (openTab) closeTab(openTab.id);
          });
        }
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    }
  });

  menu.querySelector('#ctx-refresh')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    refreshWorkspaceTree();
  });

  document.body.appendChild(menu);
  activeContextMenu = menu;
}

export async function handleCreateFile(targetDirHandle = null, folderName = '', parentPath = '') {
  const target = targetDirHandle || selectedFolderHandle || null;
  const promptMsg = folderName ? `New file in "${folderName}":` : 'New file name (e.g. app.js):';
  const name = prompt(promptMsg);
  if (!name) return;

  try {
    const fileHandle = await createFileInWorkspace(target, name, '');
    if (parentPath) {
      collapsedDirPaths.delete(parentPath);
    }
    const node = {
      name,
      kind: 'file',
      handle: fileHandle,
      parentHandle: target,
      path: parentPath ? `${parentPath}/${name}` : name
    };
    if (onFileSelectCallback) {
      onFileSelectCallback(node);
    }
    renderExplorerTree();
  } catch (err) {
    alert(`Create file failed: ${err.message}`);
  }
}

export async function handleCreateFolder(targetDirHandle = null, folderName = '', parentPath = '') {
  const target = targetDirHandle || selectedFolderHandle || null;
  const promptMsg = folderName ? `New folder in "${folderName}":` : 'New folder name:';
  const name = prompt(promptMsg);
  if (!name) return;

  try {
    await createFolderInWorkspace(target, name);
    if (parentPath) {
      collapsedDirPaths.delete(parentPath);
    }
    renderExplorerTree();
  } catch (err) {
    alert(`Create folder failed: ${err.message}`);
  }
}
