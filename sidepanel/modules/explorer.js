/**
 * explorer.js — Collapsible VS Code-Style File Explorer for Sidecode
 *
 * Renders nested folder hierarchy, file icons, dirty indicators,
 * and handles file CRUD operations (Create, Read, Rename, Delete).
 */

import {
  getWorkspaceTree,
  getWorkspaceName,
  createFileInWorkspace,
  createFolderInWorkspace,
  renameWorkspaceEntry,
  deleteWorkspaceEntry,
  refreshWorkspaceTree,
  closeWorkspaceFolder
} from './workspace.js';

let containerEl = null;
let selectedFolderHandle = null;
let activeFilePath = null;
let onFileSelectCallback = null;
let isExplorerOpen = true;

const FILE_ICONS = {
  cpp: '📄',
  cc: '📄',
  c: '📄',
  h: '📑',
  hpp: '📑',
  rs: '🦀',
  py: '🐍',
  js: '📜',
  ts: '📘',
  html: '🌐',
  css: '🎨',
  json: '📊',
  md: '📝',
  go: '🐹',
  java: '☕',
  sql: '🗄️',
  sh: '💻',
  txt: '📄'
};

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || '📄';
}

export function initExplorer(container, onFileSelect) {
  containerEl = container;
  onFileSelectCallback = onFileSelect;
}

export function toggleExplorer(forceState = null) {
  const sidebar = document.getElementById('explorer-sidebar');
  const splitter = document.getElementById('explorer-splitter');
  if (!sidebar) return;

  isExplorerOpen = forceState !== null ? forceState : !isExplorerOpen;
  sidebar.hidden = !isExplorerOpen;
  if (splitter) splitter.hidden = !isExplorerOpen;

  // Re-layout monaco editor
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
 * @param {Array<string>} dirtyPaths - Paths of open tabs that have unsaved modifications
 */
export function renderExplorerTree(dirtyPaths = []) {
  if (!containerEl) return;
  const tree = getWorkspaceTree();
  const wsName = getWorkspaceName();

  containerEl.innerHTML = '';

  if (!tree) {
    containerEl.innerHTML = `
      <div class="explorer-empty">
        <p>No workspace folder open.</p>
        <button id="btn-open-folder-empty" class="btn-explorer-action">Open Folder...</button>
      </div>
    `;
    const openBtn = containerEl.querySelector('#btn-open-folder-empty');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        import('./workspace.js').then(({ openWorkspaceFolder }) => openWorkspaceFolder());
      });
    }
    return;
  }

  // Workspace Root Header
  const wsHeader = document.createElement('div');
  wsHeader.className = 'explorer-ws-header';
  wsHeader.innerHTML = `
    <span class="explorer-ws-title" title="${wsName}">${wsName.toUpperCase()}</span>
    <div class="explorer-ws-actions">
      <button class="icon-btn-exp" id="exp-add-file" title="New File">+📄</button>
      <button class="icon-btn-exp" id="exp-add-folder" title="New Folder">+📁</button>
      <button class="icon-btn-exp" id="exp-refresh" title="Refresh">🔄</button>
      <button class="icon-btn-exp" id="exp-close-ws" title="Close Workspace">✖</button>
    </div>
  `;

  wsHeader.querySelector('#exp-add-file').addEventListener('click', handleCreateFile);
  wsHeader.querySelector('#exp-add-folder').addEventListener('click', handleCreateFolder);
  wsHeader.querySelector('#exp-refresh').addEventListener('click', () => refreshWorkspaceTree());
  wsHeader.querySelector('#exp-close-ws').addEventListener('click', () => closeWorkspaceFolder());

  containerEl.appendChild(wsHeader);

  // Tree nodes container
  const treeRoot = document.createElement('div');
  treeRoot.className = 'explorer-tree-root';

  renderTreeNode(tree, treeRoot, 0, dirtyPaths);
  containerEl.appendChild(treeRoot);

  highlightActiveNode();
}

function renderTreeNode(node, parentEl, depth = 0, dirtyPaths = []) {
  if (depth === 0) {
    // Render top-level children
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => renderTreeNode(child, parentEl, 1, dirtyPaths));
    }
    return;
  }

  const row = document.createElement('div');
  row.className = `tree-node ${node.kind === 'directory' ? 'tree-node-dir' : 'tree-node-file'}`;
  row.style.paddingLeft = `${depth * 12 + 4}px`;
  row.dataset.path = node.path;

  const isDirty = dirtyPaths.includes(node.path);

  if (node.kind === 'directory') {
    row.innerHTML = `
      <span class="tree-expander">▾</span>
      <span class="tree-icon">📁</span>
      <span class="tree-label">${node.name}</span>
    `;

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFolderHandle = node.handle;
      const expander = row.querySelector('.tree-expander');
      const isExpanded = childrenContainer.style.display !== 'none';
      childrenContainer.style.display = isExpanded ? 'none' : 'block';
      expander.textContent = isExpanded ? '▸' : '▾';

      // Highlight selected folder
      containerEl.querySelectorAll('.tree-node-dir').forEach((n) => n.classList.remove('dir-selected'));
      row.classList.add('dir-selected');
    });

    parentEl.appendChild(row);
    parentEl.appendChild(childrenContainer);

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => renderTreeNode(child, childrenContainer, depth + 1, dirtyPaths));
    }
  } else {
    // File Node
    const icon = getFileIcon(node.name);
    row.innerHTML = `
      <span class="tree-spacer"></span>
      <span class="tree-icon">${icon}</span>
      <span class="tree-label">${node.name}</span>
      <span class="tree-dirty-dot ${isDirty ? '' : 'hidden'}">●</span>
      <div class="tree-actions">
        <button class="tree-action-btn btn-tree-rename" title="Rename">✏️</button>
        <button class="tree-action-btn btn-tree-delete" title="Delete">🗑️</button>
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
    row.querySelector('.btn-tree-rename').addEventListener('click', async (e) => {
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
    row.querySelector('.btn-tree-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to delete "${node.name}" from disk?`)) {
        try {
          await deleteWorkspaceEntry(node.parentHandle, node.name, false);
        } catch (err) {
          alert(`Delete failed: ${err.message}`);
        }
      }
    });

    parentEl.appendChild(row);
  }
}

async function handleCreateFile() {
  const target = selectedFolderHandle || null;
  const name = prompt('Enter new filename (e.g. main.cpp):');
  if (name) {
    try {
      await createFileInWorkspace(target, name, '');
    } catch (err) {
      alert(`Create file failed: ${err.message}`);
    }
  }
}

async function handleCreateFolder() {
  const target = selectedFolderHandle || null;
  const name = prompt('Enter new folder name:');
  if (name) {
    try {
      await createFolderInWorkspace(target, name);
    } catch (err) {
      alert(`Create folder failed: ${err.message}`);
    }
  }
}
