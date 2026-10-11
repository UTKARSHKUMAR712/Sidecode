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
let autoSaveTimer = null;

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
  tabs = savedTabs || [];
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
  return tabs.find((t) => t.filePath === filePath) || null;
}

export function getDirtyPaths() {
  return tabs.filter((t) => t.isDirty && t.filePath).map((t) => t.filePath);
}

export function setAutoSave(enabled) {
  isAutoSaveEnabled = !!enabled;
}

export function getAutoSave() {
  return isAutoSaveEnabled;
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

  activeTabId = id;
  renderTabs();

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

  // Intercept dirty changes with prompt
  if (tab.isDirty) {
    const choice = confirm(`Do you want to save the changes you made to "${tab.label}"?\n\nClick OK to Save and Close, or Cancel to Discard Changes.`);
    if (choice) {
      if (tab.fileHandle) {
        await saveFileToDisk(tab.fileHandle, tab.content);
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

    // Debounced Auto Save to disk when enabled
    if (isAutoSaveEnabled && tab.fileHandle && tab.isDirty) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        try {
          await saveFileToDisk(tab.fileHandle, tab.content);
          tab.originalContent = tab.content;
          tab.isDirty = false;
          renderTabs();
          import('./explorer.js').then(({ renderExplorerTree }) => {
            renderExplorerTree(getDirtyPaths());
          });
        } catch (e) {
          console.warn('Auto-save error:', e);
        }
      }, 750);
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

