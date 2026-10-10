/**
 * app.js — Main application entry point for Sidecode
 *
 * Coordinates tabs, Monaco editor, console panel and code execution.
 * Supports two execution strategies:
 *   - Sandbox runner (in-browser sandbox iframe, offline, zero latency for JS/TS)
 *   - Cloud runner   (Compiler Explorer / Godbolt by default: C, C++, Java, Python, Go, Rust)
 *                     Also supports custom user-configured Piston server if provided.
 *
 * For JavaScript and TypeScript, users can choose between in-browser sandbox or Cloud runner.
 */

import { storage } from './storage.js';
import {
  initConsole,
  toggleConsole,
  closeConsole,
  clearConsole,
  getStdin
} from './modules/console.js';
import { initRunner, executeCode } from './modules/runner.js';
import { executeViaCloud, isCloudSupported } from './modules/cloudRunner.js';
import {
  initMonaco,
  createModel,
  deleteModel,
  setEditorModel,
  setModelLanguage,
  getModel,
  layoutEditor,
  applyIdeSettingsToEditor
} from './modules/editor.js';
import {
  getDefaultContent,
  SANDBOX_LANGUAGES,
  RUNNABLE_LANGUAGES
} from './modules/constants.js';
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
  renderTabs,
  setDefaultLanguage,
  getDefaultLanguage
} from './modules/tabs.js';

const $ = (id) => document.getElementById(id);

// ─── Settings state ─────────────────────────────────────────────────────────
let jsRunnerPreference = 'sandbox'; // 'sandbox' | 'cloud'
let customPistonUrl = '';

function setJsRunnerPreference(val) {
  jsRunnerPreference = val;
  const consoleSelect = $('runner-select');
  const settingsSelect = $('setting-js-runner');
  if (consoleSelect && consoleSelect.value !== val) consoleSelect.value = val;
  if (settingsSelect && settingsSelect.value !== val) settingsSelect.value = val;
}

// ─── Decide which runner to use for a given language ────────────────────────
function pickRunner(language) {
  if (SANDBOX_LANGUAGES.has(language)) {
    return jsRunnerPreference;
  }
  if (isCloudSupported(language) || customPistonUrl) {
    return 'cloud';
  }
  return null;
}

// ─── Execute current tab's code ─────────────────────────────────────────────
async function handleRunCode() {
  const tab = getActiveTab();
  if (!tab) return;

  const model = getModel(tab.id);
  if (!model) return;

  const code = model.getValue();
  const runner = pickRunner(tab.language);

  if (!runner) {
    import('./modules/console.js').then(({ openConsole, appendLine, appendRunBadge, setExecTime }) => {
      openConsole();
      appendLine('warn', `Language "${tab.language}" does not have an execution engine configured.`);
      appendRunBadge('Not runnable', true);
      setExecTime('—');
    });
    return;
  }

  if (runner === 'sandbox') {
    await executeCode(code, tab.language, model);
  } else {
    const stdin = getStdin();
    if (!stdin.valid) {
      import('./modules/console.js').then(({ openConsole, appendLine, appendRunBadge, setExecTime }) => {
        openConsole();
        appendLine('error', `✖ ${stdin.error}`);
        appendRunBadge('Input Error', true);
        setExecTime('—');
      });
      return;
    }
    await executeViaCloud(code, tab.language, customPistonUrl, stdin.value);
  }
}

// ─── Format current tab's code ──────────────────────────────────────────────
async function handleFormatCode() {
  const tab = getActiveTab();
  if (!tab) return;
  const model = getModel(tab.id);
  if (!model) return;

  const lang = tab.language;
  const builtinFormatters = ['html', 'css', 'json', 'markdown'];

  if (builtinFormatters.includes(lang)) {
    import('./modules/editor.js').then(({ getEditor }) => {
      const ed = getEditor();
      if (ed) {
        ed.trigger('anyString', 'editor.action.formatDocument');
        import('./modules/console.js').then(({ appendLine }) => {
          appendLine('system', `Formatted using browser built-in formatter.`);
        });
      }
    });
    return;
  }

  let formatter = null;
  if (['c', 'cpp', 'java', 'javascript', 'typescript'].includes(lang)) {
    formatter = 'clangformat';
  } else if (lang === 'rust') formatter = 'rustfmt';
  else if (lang === 'go') formatter = 'gofmt';

  if (!formatter) {
    if (lang !== 'python') {
      import('./modules/console.js').then(({ openConsole, appendLine }) => {
        openConsole();
        appendLine('warn', `No remote formatter available for language: ${lang}`);
      });
    }
    return;
  }

  import('./modules/console.js').then(({ openConsole, appendLine }) => {
    openConsole();
    appendLine('system', `Formatting with ${formatter}...`);
  });

  try {
    const res = await fetch(`https://godbolt.org/api/format/${formatter}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ source: model.getValue(), base: 'Google' })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.answer) {
        model.setValue(data.answer);
        import('./modules/console.js').then(({ appendLine }) => {
          appendLine('system', `Code formatted successfully.`);
        });
      }
    } else {
      const err = await res.text();
      import('./modules/console.js').then(({ appendLine }) => {
        appendLine('error', `Format failed: ${err}`);
      });
    }
  } catch (err) {
    import('./modules/console.js').then(({ appendLine }) => {
      appendLine('error', `Network error during formatting: ${err.message}`);
    });
  }
}

// ─── Show/hide Run button & runner selector based on active language ─────────
function updateRunControls(language) {
  const runBtn = $('btn-run');
  const runnerSelect = $('runner-select');

  const canRun = RUNNABLE_LANGUAGES.has(language) || (!!customPistonUrl && isCloudSupported(language));
  const isJsOrTs = SANDBOX_LANGUAGES.has(language);

  if (runBtn) runBtn.hidden = !canRun;
  if (runnerSelect) runnerSelect.hidden = !isJsOrTs;
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
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

    // Ctrl+S — format code
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      handleFormatCode();
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

// ─── Wire all event listeners ────────────────────────────────────────────────
function wireEventListeners() {
  // Navigation & Toolbar buttons
  $('btn-new-tab')?.addEventListener('click', () => createTab());
  $('btn-close-panel')?.addEventListener('click', () => window.close());
  $('btn-run')?.addEventListener('click', () => handleRunCode());
  $('btn-format')?.addEventListener('click', () => handleFormatCode());

  // ── Runner selector in console header (JS/TS only) ──
  $('runner-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    setJsRunnerPreference(val);
    storage.saveJsRunner(val);
  });

  // ── Settings Modal controls ──
  const modal = $('settings-modal');
  $('btn-settings')?.addEventListener('click', () => {
    if (modal) modal.hidden = false;
  });
  $('btn-close-settings')?.addEventListener('click', () => {
    if (modal) modal.hidden = true;
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  // Default language setting change
  $('setting-default-lang')?.addEventListener('change', (e) => {
    const chosenLang = e.target.value;
    setDefaultLanguage(chosenLang);
    storage.saveDefaultLanguage(chosenLang);
  });

  // JS runner preference in Settings
  $('setting-js-runner')?.addEventListener('change', (e) => {
    const val = e.target.value;
    setJsRunnerPreference(val);
    storage.saveJsRunner(val);
  });

  // Custom Piston endpoint URL
  $('setting-custom-piston')?.addEventListener('change', (e) => {
    customPistonUrl = e.target.value.trim();
    storage.saveCustomPistonUrl(customPistonUrl);
  });

  // IDE Settings
  const ideSettings = {
    fontSize: 12,
    tabSize: 2,
    wordWrap: false
  };

  function updateIdeSettings() {
    ideSettings.fontSize = parseInt($('setting-font-size').value, 10);
    ideSettings.tabSize = parseInt($('setting-tab-size').value, 10);
    ideSettings.wordWrap = $('setting-word-wrap').checked;
    
    // Apply to monaco
    applyIdeSettingsToEditor(ideSettings);
    
    // Apply to console
    document.documentElement.style.setProperty('--ide-font-size', `${ideSettings.fontSize}px`);

    storage.saveIdeSettings(ideSettings);
  }

  $('setting-font-size')?.addEventListener('change', updateIdeSettings);
  $('setting-tab-size')?.addEventListener('change', updateIdeSettings);
  $('setting-word-wrap')?.addEventListener('change', updateIdeSettings);

  // Open Debug Zone
  $('btn-open-debug')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('debug/index.html') });
  });

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

    // Update Run button and runner selector visibility
    updateRunControls(newLang);

    // If file is empty or only whitespace, auto-load boilerplate for chosen language
    const model = getModel(activeId);
    if (model) {
      const currentCode = model.getValue();
      if (!currentCode.trim()) {
        const template = getDefaultContent(newLang);
        model.setValue(template);
        updateTabContent(activeId, template);
        storage.saveTabContent(activeId, template);
      }
    }
  });
}

// ─── App initialisation ──────────────────────────────────────────────────────
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
  const savedDefaultLang = saved.defaultLanguage || 'javascript';
  const savedJsRunner = saved.jsRunner || 'sandbox';
  customPistonUrl = saved.customPistonUrl || '';

  // Apply persisted settings
  setJsRunnerPreference(savedJsRunner);

  const defaultLangSelect = $('setting-default-lang');
  if (defaultLangSelect) defaultLangSelect.value = savedDefaultLang;

  const jsRunnerSettingEl = $('setting-js-runner');
  if (jsRunnerSettingEl) jsRunnerSettingEl.value = savedJsRunner;

  const customPistonEl = $('setting-custom-piston');
  if (customPistonEl) customPistonEl.value = customPistonUrl;

  // Apply IDE settings
  const savedIdeSettings = saved.ideSettings || { fontSize: 13, tabSize: 2, wordWrap: true };
  if ($('setting-font-size')) $('setting-font-size').value = savedIdeSettings.fontSize;
  if ($('setting-tab-size')) $('setting-tab-size').value = savedIdeSettings.tabSize;
  if ($('setting-word-wrap')) $('setting-word-wrap').checked = savedIdeSettings.wordWrap;
  document.documentElement.style.setProperty('--ide-font-size', `${savedIdeSettings.fontSize}px`);

  // Initialize Console module
  initConsole({
    initialHeight: savedConsoleHeight,
    onLayout: layoutEditor,
    onSaveHeight: (h) => storage.saveConsoleHeight(h)
  });

  // Initialize Sandboxed Runner (for JS/TS)
  initRunner();

  // Initialize Tabs module with saved default language
  initTabs(savedTabs, savedActiveId, {
    onTabActivate: (tab) => {
      if (tab) {
        setEditorModel(tab.id);
        updateRunControls(tab.language);
        storage.saveActiveTab(tab.id);
      } else {
        setEditorModel(null);
        updateRunControls('plaintext');
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
  }, savedDefaultLang);

  // Boot Monaco Editor
  await initMonaco(editorContainer, handleRunCode, handleFormatCode);
  applyIdeSettingsToEditor(savedIdeSettings);
  if (editorContainer) editorContainer.classList.remove('loading');

  // Create Monaco models for all saved tabs
  for (const tab of getTabs()) {
    createModel(tab, (tabId, content) => {
      updateTabContent(tabId, content);
      storage.saveTabContent(tabId, content);
    });
  }

  // Activate initial tab or create first tab with default language if none exist
  if (getTabs().length === 0) {
    createTab();
  } else {
    const initialId = savedActiveId && getTabs().some((t) => t.id === savedActiveId)
      ? savedActiveId
      : getTabs()[0].id;
    activateTab(initialId);
  }
}

// Start application
init();
