/**
 * app.js — Main application entry point for Sidecode
 *
 * Coordinates tabs, Monaco editor, console panel and code execution.
 */

import { storage } from './storage.js';
import {
  initConsole,
  toggleConsole,
  closeConsole,
  clearConsole
} from './modules/console.js';
import { initRunner, executeCode } from './modules/runner.js';
import {
  initMonaco,
  createModel,
  deleteModel,
  setEditorModel,
  setModelLanguage,
  getModel,
  layoutEditor
} from './modules/editor.js';
import {
  initTabs,
  createTab,
  activateTab,
  closeTab,
  setTabLanguage,
  updateTabContent,
  getActiveTab,
  getActiveTabId,
  getTabs,
  renderTabs
} from './modules/tabs.js';

const $ = (id) => document.getElementById(id);

async function handleRunCode() {
  const tab = getActiveTab();
  if (!tab) return;

  const model = getModel(tab.id);
  if (!model) return;

  const code = model.getValue();
  await executeCode(code, tab.language, model);
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+` or Ctrl+~ — toggle console
    if (mod && (e.key === '`' || e.key === '~')) {
      e.preventDefault();
      toggleConsole();
      return;
    }

    if (!mod) return;

    // Ctrl+Shift+Z — close panel
    if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      window.close();
      return;
    }

    // Ctrl+Enter — run code
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRunCode();
      return;
    }

    // Ctrl+T — new tab
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      createTab();
      return;
    }

    // Ctrl+W — close active tab
    if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      const activeId = getActiveTabId();
      if (activeId) closeTab(activeId);
      return;
    }

    // Ctrl+1…9 — switch tabs by index
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 9) {
      const allTabs = getTabs();
      const target = allTabs[num - 1];
      if (target) {
        e.preventDefault();
        activateTab(target.id);
      }
    }
  });
}

function wireEventListeners() {
  // Navigation & Toolbar buttons
  $('btn-new-tab')?.addEventListener('click', () => createTab());
  $('btn-close-panel')?.addEventListener('click', () => window.close());
  $('btn-run')?.addEventListener('click', () => handleRunCode());

  // Console buttons
  $('btn-console-run')?.addEventListener('click', () => handleRunCode());
  $('btn-console-clear')?.addEventListener('click', clearConsole);
  $('btn-console-close')?.addEventListener('click', closeConsole);

  // Language selector
  $('lang-select')?.addEventListener('change', (e) => {
    const activeId = getActiveTabId();
    if (!activeId) return;

    const newLang = e.target.value;
    setTabLanguage(activeId, newLang);
    setModelLanguage(activeId, newLang);
    storage.saveTabLanguage(activeId, newLang);
  });
}

async function init() {
  const editorContainer = $('editor-container');
  if (editorContainer) editorContainer.classList.add('loading');

  wireEventListeners();
  setupKeyboard();

  // Load saved state from storage
  const saved = await storage.load();
  const savedTabs = saved.tabs || [];
  const savedActiveId = saved.activeTabId || null;
  const savedConsoleHeight = saved.consoleHeight || 200;

  // Initialize Console module
  initConsole({
    initialHeight: savedConsoleHeight,
    onLayout: layoutEditor,
    onSaveHeight: (h) => storage.saveConsoleHeight(h)
  });

  // Initialize Sandboxed Runner
  initRunner();

  // Initialize Tabs module
  initTabs(savedTabs, savedActiveId, {
    onTabActivate: (tab) => {
      if (tab) {
        setEditorModel(tab.id);
        storage.saveActiveTab(tab.id);
      } else {
        setEditorModel(null);
        storage.saveActiveTab(null);
      }
    },
    onTabCreate: (tab) => {
      createModel(tab, (tabId, content) => {
        updateTabContent(tabId, content);
        storage.saveTabContent(tabId, content);
      });
      storage.saveTabs(getTabs());
    },
    onTabClose: (tabId) => {
      deleteModel(tabId);
      storage.saveTabs(getTabs());
    },
    onTabsChange: (allTabs) => {
      storage.saveTabs(allTabs);
    }
  });

  // Boot Monaco Editor
  await initMonaco(editorContainer, handleRunCode);
  if (editorContainer) editorContainer.classList.remove('loading');

  // Create Monaco models for all saved tabs
  for (const tab of getTabs()) {
    createModel(tab, (tabId, content) => {
      updateTabContent(tabId, content);
      storage.saveTabContent(tabId, content);
    });
  }

  // Activate initial tab or create first tab if none exist
  if (getTabs().length === 0) {
    createTab('javascript');
  } else {
    const initialId = savedActiveId && getTabs().some((t) => t.id === savedActiveId)
      ? savedActiveId
      : getTabs()[0].id;
    activateTab(initialId);
  }
}

// Start application
init();
