/**
 * tabs.js — Tab manager for Sidecode
 *
 * Supports both Scratchpad mode (ephemeral untitled tabs) and
 * Workspace mode (direct disk files with real paths, dirty tracking, and Ctrl+S saving).
 */

import { uid, escapeHtml, LANG_BADGE, getDefaultContent, RUNNABLE_LANGUAGES } from './constants.js';
import { saveFileToDisk, saveFileAsDialog } from './workspace.js';
import { getFileIconHtml } from './explorer.js';

let tabs = [];
let activeTabId = null;
let defaultLang = 'javascript';
let untitledCount = 1;
let isAutoSaveEnabled = false;
let autoSaveTimers = new Map();

let onTabActivate = null;
let onTabCreate = null;
let onTabClose = null;
let onTabsChange = null;

const $ = (id) => document.getElementById(id);

export function detectLanguageByFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',
    h: 'cpp',
    hpp: 'cpp',
    rs: 'rust',
    py: 'python',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    go: 'go',
    java: 'java',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin'
  };
  return map[ext] || 'plaintext';
}

export function initTabs(savedTabs = [], savedActiveId = null, listeners = {}, initialDefaultLang = 'javascript') {
  tabs = (savedTabs || []).map((t) => ({
    id: t.id,
    label: t.label,
    language: t.language,
    content: t.content,
    originalContent: t.originalContent !== undefined ? t.originalContent : t.content,
    filePath: t.filePath || null,
    fileHandle: t.fileHandle || null,
    parentHandle: t.parentHandle || null,
    isDirty: !!t.isDirty
  }));
  activeTabId = savedActiveId || (tabs.length > 0 ? tabs[0].id : null);
  defaultLang = initialDefaultLang || 'javascript';

  onTabActivate = listeners.onTabActivate || null;
  onTabCreate = listeners.onTabCreate || null;
  onTabClose = listeners.onTabClose || null;
  onTabsChange = listeners.onTabsChange || null;
}

export function setDefaultLanguage(lang) {
  if (lang) defaultLang = lang;
}

export function getDefaultLanguage() {
  return defaultLang;
}

export function getTabs() {
  return tabs;
}

export function getActiveTabId() {
  return activeTabId;
}

export function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

export function getTabByPath(filePath) {
  if (!filePath) return null;
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  return tabs.find((t) => t.filePath && t.filePath.replace(/\\/g, '/').toLowerCase() === norm) || null;
}

export function getDirtyPaths() {
  return tabs.filter((t) => t.isDirty && t.filePath).map((t) => t.filePath);
}

export function setAutoSave(enabled) {
  isAutoSaveEnabled = !!enabled;
  if (isAutoSaveEnabled) {
    autoSaveAllDirtyTabs();
  }
}

export function getAutoSave() {
  return isAutoSaveEnabled;
}

/**
 * Re-link open tabs to their physical FileSystemFileHandles from the workspace tree
 */
export async function relinkTabsToWorkspace(tree) {
  if (!tree) return;
  const { findNodeInTree } = await import('./workspace.js');
  tabs.forEach((tab) => {
    if (!tab.fileHandle) {
      const lookup = tab.filePath || tab.label;
      const node = findNodeInTree(lookup, tree);
      if (node && node.handle) {
        tab.fileHandle = node.handle;
        if (node.parentHandle) tab.parentHandle = node.parentHandle;
        if (!tab.filePath && node.path) tab.filePath = node.path;
      }
    }
  });
}

export function createTab(language = null, customLabel = null) {
  const chosenLang = language || defaultLang;
  const id = uid();
  const label = customLabel || `Untitled-${untitledCount++}`;
  const tab = {
    id,
    label,
    language: chosenLang,
    content: getDefaultContent(chosenLang),
    originalContent: getDefaultContent(chosenLang),
    filePath: null,
    fileHandle: null,
    parentHandle: null,
    isDirty: false
  };

  tabs.push(tab);

  if (onTabCreate) onTabCreate(tab);
  if (onTabsChange) onTabsChange(tabs);

  activateTab(id);
  return tab;
}

export function openFileInTab(node, content) {
  const existing = getTabByPath(node.path);
  if (existing) {
    if (node.handle) existing.fileHandle = node.handle;
    if (node.parentHandle) existing.parentHandle = node.parentHandle;
    if (!existing.isDirty && content !== undefined && content !== null) {
      existing.content = content;
      existing.originalContent = content;
    }
    activateTab(existing.id);
    return existing;
  }

  const id = uid();
  const detectedLang = detectLanguageByFilename(node.name);
  const tab = {
    id,
    label: node.name,
    language: detectedLang,
    content,
    originalContent: content,
    filePath: node.path,
    fileHandle: node.handle,
    parentHandle: node.parentHandle,
    isDirty: false
  };

  tabs.push(tab);

  if (onTabCreate) onTabCreate(tab);
  if (onTabsChange) onTabsChange(tabs);

  activateTab(id);
  return tab;
}

export function activateTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  const previousTabId = activeTabId;
  activeTabId = id;
  renderTabs();

  // If previous active tab was dirty and auto-save is enabled, auto-save it immediately
  if (isAutoSaveEnabled && previousTabId && previousTabId !== id) {
    const prev = tabs.find((t) => t.id === previousTabId);
    if (prev && prev.isDirty) {
      performAutoSave(prev);
    }
  }

  // Auto-detect and sync language on Monaco model
  import('./editor.js').then(({ setModelLanguage }) => {
    setModelLanguage(tab.id, tab.language);
  });

  syncRunButton();

  // Notify explorer of selection
  if (tab.filePath) {
    import('./explorer.js').then(({ setSelectedFile }) => setSelectedFile(tab.filePath));
  }

  if (onTabActivate) onTabActivate(tab);
}

export async function saveActiveTabToDisk() {
  const tab = getActiveTab();
  if (!tab) return false;

  // Try to resolve missing fileHandle from workspace tree
  if (!tab.fileHandle) {
    try {
      const { isWorkspaceOpen, findNodeInTree, createFileInWorkspace, getWorkspaceRootHandle } = await import('./workspace.js');
      if (isWorkspaceOpen()) {
        const lookup = tab.filePath || tab.label;
        let node = findNodeInTree(lookup);
        if (node && node.handle) {
          tab.fileHandle = node.handle;
          if (node.parentHandle) tab.parentHandle = node.parentHandle;
          if (!tab.filePath && node.path) tab.filePath = node.path;
        } else if (tab.label && !tab.label.startsWith('Untitled-')) {
          const root = getWorkspaceRootHandle();
          if (root) {
            const handle = await createFileInWorkspace(root, tab.label, tab.content);
            tab.fileHandle = handle;
            tab.filePath = tab.label;
          }
        }
      }
    } catch (err) {
      console.warn('Could not resolve file handle for save:', err);
    }
  }

  if (tab.fileHandle) {
    try {
      await saveFileToDisk(tab.fileHandle, tab.content);
      tab.originalContent = tab.content;
      tab.isDirty = false;
      renderTabs();

      // Update explorer tree dirty indicators
      import('./explorer.js').then(({ renderExplorerTree }) => {
        renderExplorerTree(getDirtyPaths());
      });

      import('./console.js').then(({ appendLine }) => {
        appendLine('system', `✔ Saved "${tab.label}" directly to disk.`);
      });
      return true;
    } catch (err) {
      alert(`Save failed for "${tab.label}": ${err.message}`);
      return false;
    }
  } else {
    // Untitled tab without handle: trigger Save As to choose disk location
    return await saveActiveTabAs();
  }
}

export async function saveActiveTabAs() {
  const tab = getActiveTab();
  if (!tab) return false;

  try {
    const result = await saveFileAsDialog(tab.content, tab.label);
    if (!result) return false;

    tab.label = result.name;
    tab.filePath = result.name;
    tab.fileHandle = result.handle;
    tab.language = detectLanguageByFilename(result.name);
    tab.originalContent = tab.content;
    tab.isDirty = false;

    import('./editor.js').then(({ setModelLanguage }) => {
      setModelLanguage(tab.id, tab.language);
    });

    renderTabs();

    import('./explorer.js').then(({ renderExplorerTree }) => {
      renderExplorerTree(getDirtyPaths());
    });

    import('./console.js').then(({ appendLine }) => {
      appendLine('system', `✔ Saved as "${tab.label}".`);
    });
    return true;
  } catch (err) {
    if (err.name !== 'AbortError') alert(`Save As failed: ${err.message}`);
    return false;
  }
}

export async function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];

  // Intercept dirty changes: auto-save if enabled, else prompt user
  if (tab.isDirty) {
    if (isAutoSaveEnabled) {
      await performAutoSave(tab);
    } else {
      const choice = confirm(`Do you want to save the changes you made to "${tab.label}"?\n\nClick OK to Save and Close, or Cancel to Discard Changes.`);
      if (choice) {
        if (tab.fileHandle) {
          await saveFileToDisk(tab.fileHandle, tab.content);
        } else {
          await saveActiveTabAs();
        }
      }
    }
  }

  const closingActive = activeTabId === id;
  tabs.splice(idx, 1);

  if (onTabClose) onTabClose(id);
  if (onTabsChange) onTabsChange(tabs);

  // Update explorer tree dirty indicator
  import('./explorer.js').then(({ renderExplorerTree }) => {
    renderExplorerTree(getDirtyPaths());
  });

  if (closingActive) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    if (next) {
      activateTab(next.id);
    } else {
      activeTabId = null;
      renderTabs();
      syncRunButton();
      if (onTabActivate) onTabActivate(null);
    }
  } else {
    renderTabs();
  }
}

export function setTabLanguage(id, language) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  tab.language = language;
  renderTabs();
  syncRunButton();

  if (onTabsChange) onTabsChange(tabs);
}

/**
 * Perform auto-save for a tab:
 * 1. Resolves fileHandle from workspace tree if missing
 * 2. Writes to physical disk if handle exists
 * 3. Falls back to chrome.storage.local persistence
 * 4. Clears dirty flag and updates tab + explorer indicators
 */
export async function performAutoSave(tab) {
  if (!tab || !tab.isDirty) return false;

  // 1. Try to resolve missing fileHandle from workspace if open
  if (!tab.fileHandle) {
    try {
      const { isWorkspaceOpen, findNodeInTree, createFileInWorkspace, getWorkspaceRootHandle } = await import('./workspace.js');
      if (isWorkspaceOpen()) {
        const lookup = tab.filePath || tab.label;
        let node = findNodeInTree(lookup);
        if (node && node.handle) {
          tab.fileHandle = node.handle;
          if (node.parentHandle) tab.parentHandle = node.parentHandle;
          if (!tab.filePath && node.path) tab.filePath = node.path;
        } else if (tab.label && !tab.label.startsWith('Untitled-')) {
          const root = getWorkspaceRootHandle();
          if (root) {
            const handle = await createFileInWorkspace(root, tab.label, tab.content);
            tab.fileHandle = handle;
            tab.filePath = tab.label;
          }
        }
      }
    } catch (err) {
      console.warn('Auto-save workspace resolve error:', err);
    }
  }

  // 2. If tab has fileHandle, save directly to physical disk
  if (tab.fileHandle) {
    try {
      await saveFileToDisk(tab.fileHandle, tab.content);
      tab.originalContent = tab.content;
      tab.isDirty = false;
      renderTabs();

      import('./explorer.js').then(({ renderExplorerTree }) => {
        renderExplorerTree(getDirtyPaths());
      });
      return true;
    } catch (e) {
      console.warn('Auto-save disk write failed, falling back to storage:', e);
    }
  }

  // 3. Fallback / Scratchpad / Storage mode:
  // Persist to storage cache and clear dirty indicator so state is saved
  try {
    const { storage } = await import('../storage.js');
    storage.saveTabContent(tab.id, tab.content);
    storage.saveTabs(tabs);
    tab.originalContent = tab.content;
    tab.isDirty = false;
    renderTabs();

    import('./explorer.js').then(({ renderExplorerTree }) => {
      renderExplorerTree(getDirtyPaths());
    });
    return true;
  } catch (e) {
    console.warn('Auto-save storage fallback error:', e);
  }

  return false;
}

export async function autoSaveAllDirtyTabs() {
  const dirtyTabs = tabs.filter((t) => t.isDirty);
  for (const t of dirtyTabs) {
    await performAutoSave(t);
  }
}

export function updateTabContent(id, content) {
  const tab = tabs.find((t) => t.id === id);
  if (tab) {
    tab.content = content;
    const wasDirty = tab.isDirty;
    tab.isDirty = tab.content !== tab.originalContent;

    if (wasDirty !== tab.isDirty) {
      renderTabs();
      import('./explorer.js').then(({ renderExplorerTree }) => {
        renderExplorerTree(getDirtyPaths());
      });
    }

    // Debounced Auto Save when enabled
    if (isAutoSaveEnabled && tab.isDirty) {
      if (autoSaveTimers.has(tab.id)) {
        clearTimeout(autoSaveTimers.get(tab.id));
      }
      const timer = setTimeout(async () => {
        autoSaveTimers.delete(tab.id);
        await performAutoSave(tab);
      }, 500);
      autoSaveTimers.set(tab.id, timer);
    }
  }
}

export function renderTabs() {
  const elTabs = $('tabs');
  if (!elTabs) return;

  elTabs.innerHTML = '';
  tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.id = tab.id;
    el.setAttribute('role', 'tab');
    el.title = tab.filePath || tab.label;

    const fileIcon = getFileIconHtml(tab.label);
    const dirtyIcon = `<span class="tab-dirty-dot ${tab.isDirty ? '' : 'hidden'}">●</span>`;

    el.innerHTML = `
      <span class="tab-icon-wrap">${fileIcon}</span>
      <span class="tab-label">${escapeHtml(tab.label)}</span>
      ${dirtyIcon}
      <button class="tab-close" title="Close (Ctrl+W)" aria-label="Close tab">&#10005;</button>
    `;

    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        activateTab(tab.id);
      }
    });

    const closeBtn = el.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
    }

    elTabs.appendChild(el);
  });

  const activeEl = elTabs.querySelector('.tab.active');
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  updateNoTabsMsg();
  syncRunButton();
}

function updateNoTabsMsg() {
  const editorCont = $('editor-container');
  let el = $('no-tabs-msg');
  if (tabs.length > 0) {
    if (el) el.remove();
    return;
  }
  if (!el && editorCont) {
    el = document.createElement('div');
    el.id = 'no-tabs-msg';
    el.innerHTML = `<span>No editor tabs open</span><button id="btn-first-tab">+ New Tab</button>`;
    editorCont.appendChild(el);
    const firstTabBtn = $('btn-first-tab');
    if (firstTabBtn) {
      firstTabBtn.addEventListener('click', () => createTab());
    }
  }
}

export function syncRunButton() {
  const runBtn = $('btn-run');
  if (!runBtn) return;
  const tab = getActiveTab();
  const isRunnable = tab && RUNNABLE_LANGUAGES.has(tab.language);
  runBtn.hidden = !isRunnable;
}

/**
 * Synchronize open tabs when a file or directory is renamed in the workspace
 */
export function handleWorkspaceRenamed(oldPath, newPath, newHandle = null) {
  if (!oldPath || !newPath) return;
  let changed = false;

  tabs.forEach((tab) => {
    if (!tab.filePath) return;
    if (tab.filePath === oldPath) {
      tab.filePath = newPath;
      tab.label = newPath.split('/').pop();
      tab.language = detectLanguageByFilename(tab.label);
      if (newHandle) tab.fileHandle = newHandle;
      changed = true;
    } else if (tab.filePath.startsWith(oldPath + '/')) {
      tab.filePath = newPath + tab.filePath.slice(oldPath.length);
      tab.label = tab.filePath.split('/').pop();
      tab.language = detectLanguageByFilename(tab.label);
      changed = true;
    }
  });

  if (changed) {
    renderTabs();
    const activeTab = getActiveTab();
    if (activeTab) {
      import('./editor.js').then(({ setModelLanguage }) => {
        setModelLanguage(activeTab.id, activeTab.language);
      });
      syncRunButton();
    }
    if (onTabsChange) onTabsChange(tabs);
  }
}

