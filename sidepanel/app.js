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
  initLibraries,
  openDependenciesModal,
  closeDependenciesModal,
  updateDependenciesBadge,
  getSelectedLibrariesForLanguage
} from './modules/libraries.js';
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
  getDefaultLanguage,
  openFileInTab,
  getTabByPath,
  saveActiveTabToDisk,
  saveActiveTabAs,
  setAutoSave,
  getAutoSave,
  getDirtyPaths
} from './modules/tabs.js';
import {
  openWorkspaceFolder,
  restoreSavedWorkspace,
  reauthorizeWorkspace,
  closeWorkspaceFolder,
  onWorkspaceChange,
  readFileFromDisk,
  isWorkspaceOpen,
  getWorkspaceTree,
  getWorkspaceName,
  getWorkspaceRootHandle,
  findNodeInTree,
  createFileInWorkspace,
  createFolderInWorkspace,
  deleteWorkspaceEntry,
  renameWorkspaceEntry,
  refreshWorkspaceTree
} from './modules/workspace.js';
import {
  initExplorer,
  toggleExplorer,
  renderExplorerTree,
  isExplorerVisible
} from './modules/explorer.js';
import {
  checkFsaSupport,
  redirectToBraveFlag
} from './modules/permissions.js';
import {
  initTerminal,
  updateTerminalPrompt,
  appendCommandLineEcho,
  getRunCommandForTab
} from './modules/terminal.js';

const $ = (id) => document.getElementById(id);

// ─── Settings state ─────────────────────────────────────────────────────────
let jsRunnerPreference = 'sandbox'; // 'sandbox' | 'cloud'
let customPistonUrl = '';
let currentIdeSettings = { libraries: [] };

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

  // 1. Ensure console is open and switch to Terminal tab
  import('./modules/console.js').then(({ openConsole, isConsoleOpen }) => {
    if (!isConsoleOpen()) openConsole();
  });
  $('tab-console')?.click();

  // 2. Clear any pending typed draft in CLI input
  const cliInput = $('terminal-cli-input');
  if (cliInput) cliInput.value = '';

  // 3. Print command prompt echo so command is shown FIRST and output is BELOW it
  const cmdStr = getRunCommandForTab(tab);
  appendCommandLineEcho(cmdStr);

  if (!runner) {
    import('./modules/console.js').then(({ appendLine, appendRunBadge, setExecTime }) => {
      appendLine('warn', `Language "${tab.language}" does not have an execution engine configured.`);
      appendRunBadge('Not runnable', true);
      setExecTime('—');
    });
    return;
  }

  const activePath = tab.filePath || tab.label || '';
  if (runner === 'sandbox') {
    await executeCode(code, tab.language, model, activePath);
  } else {
    const stdin = getStdin();
    if (!stdin.valid) {
      import('./modules/console.js').then(({ appendLine, appendRunBadge, setExecTime }) => {
        appendLine('error', `✖ ${stdin.error}`);
        appendRunBadge('Input Error', true);
        setExecTime('—');
      });
      return;
    }
    const activeLibs = getSelectedLibrariesForLanguage(tab.language);
    await executeViaCloud(code, tab.language, customPistonUrl, stdin.value, activeLibs, tab.id, activePath);
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

    // Ctrl+Alt+F — format code
    if (e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      import('./modules/editor.js').then(({ getEditor }) => {
        const ed = getEditor();
        if (ed) {
          const action = ed.getAction('editor.action.formatDocument');
          if (action && action.isSupported()) {
             action.run();
          }
        }
      });
      return;
    }

    // Ctrl+Alt+A — analyze code
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      import('./modules/analysis.js').then(({ runStandaloneAnalysis }) => {
        runStandaloneAnalysis(getActiveTab());
      });
      return;
    }

    // Ctrl+Shift+S — Save As...
    if (e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveActiveTabAs();
      return;
    }

    // Ctrl+S — save active tab directly to disk
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      saveActiveTabToDisk();
      return;
    }

    // Ctrl+N — new file
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      handleNewFile();
      return;
    }

    // Ctrl+O — open file
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      handleOpenFile();
      return;
    }

    // Ctrl+B — toggle file explorer sidebar
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      toggleExplorer();
      return;
    }

    // Ctrl+T — new file / tab
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      handleNewFile();
      return;
    }

    // Ctrl+W — close active tab
    if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      const activeId = getActiveTabId();
      if (activeId) closeTab(activeId);
      return;
    }

    // Ctrl+, — Open Settings
    if (e.key === ',') {
      e.preventDefault();
      const modal = $('settings-modal');
      if (modal) modal.hidden = false;
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

async function handleNewFile() {
  if (isWorkspaceOpen()) {
    const { handleCreateFile } = await import('./modules/explorer.js');
    handleCreateFile();
  } else {
    createTab();
  }
}

async function handleOpenFile() {
  try {
    const { openFileDialog } = await import('./modules/workspace.js');
    const result = await openFileDialog();
    if (!result) return;

    const existingTab = getTabByPath(result.path);
    if (existingTab) {
      activateTab(existingTab.id);
      let model = getModel(existingTab.id);
      if (!model || model.isDisposed()) {
        model = createModel(existingTab, (tabId, val) => {
          updateTabContent(tabId, val);
        });
      }
      setEditorModel(existingTab.id);
      renderExplorerTree(getDirtyPaths());
      return;
    }

    const tab = openFileInTab(result, result.content);
    let model = getModel(tab.id);
    if (!model || model.isDisposed()) {
      model = createModel(tab, (tabId, val) => {
        updateTabContent(tabId, val);
      });
    }
    setEditorModel(tab.id);
    renderExplorerTree(getDirtyPaths());
  } catch (err) {
    if (err.name !== 'AbortError') {
      alert(`Could not open file: ${err.message}`);
    }
  }
}

function wireFileMenu() {
  const btnFile = $('btn-menu-file');
  const dropdownFile = $('dropdown-file');
  if (!btnFile || !dropdownFile) return;

  function closeMenu() {
    dropdownFile.hidden = true;
    btnFile.classList.remove('active');
    btnFile.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu(e) {
    e.stopPropagation();
    const isOpen = !dropdownFile.hidden;
    if (isOpen) {
      closeMenu();
    } else {
      dropdownFile.hidden = false;
      btnFile.classList.add('active');
      btnFile.setAttribute('aria-expanded', 'true');
    }
  }

  btnFile.addEventListener('click', toggleMenu);

  window.addEventListener('click', (e) => {
    if (!dropdownFile.contains(e.target) && e.target !== btnFile) {
      closeMenu();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  $('menu-new-file')?.addEventListener('click', () => {
    closeMenu();
    handleNewFile();
  });

  $('menu-open-file')?.addEventListener('click', () => {
    closeMenu();
    handleOpenFile();
  });

  $('menu-open-folder')?.addEventListener('click', () => {
    closeMenu();
    handleOpenFolder();
  });

  $('menu-save')?.addEventListener('click', () => {
    closeMenu();
    saveActiveTabToDisk();
  });

  $('menu-save-as')?.addEventListener('click', () => {
    closeMenu();
    saveActiveTabAs();
  });

  $('menu-toggle-autosave')?.addEventListener('click', () => {
    closeMenu();
    const newState = !getAutoSave();
    setAutoSave(newState);
    $('autosave-check')?.classList.toggle('active', newState);
    storage.saveAutoSave(newState);
  });

  $('menu-close-editor')?.addEventListener('click', () => {
    closeMenu();
    const activeId = getActiveTabId();
    if (activeId) closeTab(activeId);
  });

  $('menu-close-folder')?.addEventListener('click', () => {
    closeMenu();
    closeWorkspaceFolder();
  });

  $('menu-preferences')?.addEventListener('click', () => {
    closeMenu();
    const modal = $('settings-modal');
    if (modal) modal.hidden = false;
  });
}

// ─── Workspace and Explorer handlers ─────────────────────────────────────────
async function handleExplorerFileSelect(node) {
  try {
    // 1. If tab is already open, smoothly switch to that exact tab
    const existingTab = getTabByPath(node.path);
    if (existingTab) {
      activateTab(existingTab.id);
      let model = getModel(existingTab.id);
      if (!model || model.isDisposed()) {
        model = createModel(existingTab, (tabId, val) => {
          updateTabContent(tabId, val);
        });
      }
      setEditorModel(existingTab.id);
      renderExplorerTree(getDirtyPaths());
      return;
    }

    // 2. Otherwise read from disk and open new tab
    const content = await readFileFromDisk(node.handle);
    const tab = openFileInTab(node, content);
    let model = getModel(tab.id);
    if (!model || model.isDisposed()) {
      model = createModel(tab, (tabId, val) => {
        updateTabContent(tabId, val);
      });
    }
    setEditorModel(tab.id);
    renderExplorerTree(getDirtyPaths());
  } catch (err) {
    alert(`Could not open file "${node.name}": ${err.message}`);
  }
}

async function handleOpenFolder() {
  const fsa = await checkFsaSupport();
  if (fsa.isBlockedInBrave) {
    $('brave-flag-banner')?.classList.remove('hidden');
    redirectToBraveFlag();
    return;
  }

  try {
    await openWorkspaceFolder();
    toggleExplorer(true);
    renderExplorerTree(getDirtyPaths());
  } catch (err) {
    if (err.name !== 'AbortError') {
      alert(`Failed to open folder: ${err.message}`);
    }
  }
}

async function handleReconnectWorkspace() {
  try {
    const ok = await reauthorizeWorkspace();
    if (ok) {
      $('workspace-reconnect-bar')?.classList.add('hidden');
      toggleExplorer(true);
      renderExplorerTree(getDirtyPaths());
    }
  } catch (err) {
    alert(`Failed to reconnect workspace: ${err.message}`);
  }
}

// ─── Wire all event listeners ────────────────────────────────────────────────
function wireEventListeners() {
  // Workspace & Explorer buttons
  $('btn-open-folder')?.addEventListener('click', handleOpenFolder);
  $('btn-toggle-explorer')?.addEventListener('click', () => toggleExplorer());
  $('btn-reconnect-workspace')?.addEventListener('click', handleReconnectWorkspace);
  $('btn-enable-brave-flag')?.addEventListener('click', () => redirectToBraveFlag());

  // Drag-to-resize explorer sidebar
  const splitter = $('explorer-splitter');
  const sidebar = $('explorer-sidebar');
  if (splitter && sidebar) {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    splitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = sidebar.getBoundingClientRect().width;
      splitter.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const newWidth = Math.max(100, Math.min(320, startWidth + dx));
      sidebar.style.width = `${newWidth}px`;
      layoutEditor();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        splitter.classList.remove('dragging');
        document.body.style.cursor = '';
        layoutEditor();
      }
    });
  }

  // Navigation & Toolbar buttons
  $('btn-new-tab')?.addEventListener('click', () => createTab());
  $('btn-close-panel')?.addEventListener('click', () => window.close());
  $('btn-run')?.addEventListener('click', () => handleRunCode());

  // Open dependencies from Settings modal
  $('btn-open-deps-from-settings')?.addEventListener('click', () => {
    const modal = $('settings-modal');
    if (modal) modal.hidden = true;
    const tab = getActiveTab();
    openDependenciesModal(tab ? tab.language : 'cpp');
  });

  // Re-analyze button in Problems panel
  $('btn-reanalyze')?.addEventListener('click', () => {
    import('./modules/analysis.js').then(({ runStandaloneAnalysis }) => {
      runStandaloneAnalysis(getActiveTab());
    });
  });

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

  function updateIdeSettings() {
    currentIdeSettings.fontSize = parseInt($('setting-font-size').value, 10);
    currentIdeSettings.tabSize = parseInt($('setting-tab-size').value, 10);
    currentIdeSettings.wordWrap = $('setting-word-wrap').checked;

    // Apply to monaco
    applyIdeSettingsToEditor(currentIdeSettings);
    
    // Apply to console
    document.documentElement.style.setProperty('--ide-font-size', `${currentIdeSettings.fontSize}px`);

    storage.saveIdeSettings(currentIdeSettings);
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

  // Wire VS Code File Menu
  wireFileMenu();
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
  const savedAutoSave = saved.autoSave !== undefined ? saved.autoSave : false;
  customPistonUrl = saved.customPistonUrl || '';

  // Apply persisted settings
  setJsRunnerPreference(savedJsRunner);
  setAutoSave(savedAutoSave);
  $('autosave-check')?.classList.toggle('active', savedAutoSave);

  const defaultLangSelect = $('setting-default-lang');
  if (defaultLangSelect) defaultLangSelect.value = savedDefaultLang;

  const jsRunnerSettingEl = $('setting-js-runner');
  if (jsRunnerSettingEl) jsRunnerSettingEl.value = savedJsRunner;

  const customPistonEl = $('setting-custom-piston');
  if (customPistonEl) customPistonEl.value = customPistonUrl;

  // Apply IDE settings
  currentIdeSettings = saved.ideSettings || { fontSize: 13, tabSize: 2, wordWrap: false, libraries: [] };
  if (saved.ideSettings && saved.ideSettings.wordWrap === undefined) {
    currentIdeSettings.wordWrap = false;
  }
  const savedIdeSettings = currentIdeSettings;
  if ($('setting-font-size')) $('setting-font-size').value = savedIdeSettings.fontSize;
  if ($('setting-tab-size')) $('setting-tab-size').value = savedIdeSettings.tabSize;
  if ($('setting-word-wrap')) $('setting-word-wrap').checked = !!savedIdeSettings.wordWrap;

  document.documentElement.style.setProperty('--ide-font-size', `${savedIdeSettings.fontSize}px`);

  // Initialize Instant Libraries module
  initLibraries(savedIdeSettings, (lang) => {
    const tab = getActiveTab();
    if (tab) updateDependenciesBadge(tab.language);
  });

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
        updateDependenciesBadge(tab.language);
        import('./modules/analysis.js').then(({ restoreProblemsForTab }) => {
          restoreProblemsForTab(tab.id);
        });
        storage.saveActiveTab(tab.id);
      } else {
        setEditorModel(null);
        updateRunControls('plaintext');
        updateDependenciesBadge('plaintext');
        import('./modules/analysis.js').then(({ updateProblemsView }) => {
          updateProblemsView([]);
        });
        storage.saveActiveTab(null);
      }
    },
    onTabCreate: (tab) => {
      createModel(tab, (tabId, content) => {
        updateTabContent(tabId, content);
        if (!tab.filePath) {
          storage.saveTabContent(tabId, content);
        }
      });
      storage.saveTabs(getTabs().filter((t) => !t.filePath));
    },
    onTabClose: (tabId) => {
      deleteModel(tabId);
      storage.saveTabs(getTabs().filter((t) => !t.filePath));
    },
    onTabsChange: (allTabs) => {
      storage.saveTabs(allTabs.filter((t) => !t.filePath));
      renderExplorerTree(getDirtyPaths());
    }
  }, savedDefaultLang);

  // Initialize Explorer
  const explorerContent = $('explorer-content');
  if (explorerContent) {
    initExplorer(explorerContent, handleExplorerFileSelect);
  }

  // Initialize Interactive Terminal CLI
  initTerminal({
    getWorkspaceTree: () => getWorkspaceTree(),
    getWorkspaceName: () => getWorkspaceName(),
    getWorkspaceRootHandle: () => getWorkspaceRootHandle(),
    getTabs: () => getTabs(),
    getActiveTab: () => getActiveTab(),
    getModelContent: (tabId) => getModel(tabId)?.getValue() || null,
    findWorkspaceFile: (filename) => findNodeInTree(filename),
    readFileFromDisk: (handle) => readFileFromDisk(handle),
    createFile: (dirHandle, name, content) => createFileInWorkspace(dirHandle, name, content),
    createFolder: (dirHandle, name) => createFolderInWorkspace(dirHandle, name),
    deleteEntry: (dirHandle, name, isDir) => deleteWorkspaceEntry(dirHandle, name, isDir),
    renameEntry: (parentHandle, handle, newName) => renameWorkspaceEntry(parentHandle, handle, newName),
    refreshTree: () => refreshWorkspaceTree(),
    createTab: (label) => createTab(label),
    runActiveTab: () => handleRunCode(),
    executeCode: async (code, lang, filenameOrPath) => {
      if (SANDBOX_LANGUAGES.has(lang)) {
        await executeCode(code, lang, null, filenameOrPath);
      } else {
        const stdin = getStdin();
        const activeLibs = getSelectedLibrariesForLanguage(lang);
        await executeViaCloud(code, lang, customPistonUrl, stdin.valid ? stdin.value : '', activeLibs, null, filenameOrPath);
      }
    },
    executeRawJs: async (code) => {
      await executeCode(code, 'javascript');
    }
  });

  // Listen to workspace state changes
  onWorkspaceChange(({ action }) => {
    updateTerminalPrompt();
    if (action === 'closed') {
      import('./modules/terminal.js').then(({ resetTerminalCwd }) => {
        if (typeof resetTerminalCwd === 'function') resetTerminalCwd();
      });
      toggleExplorer(false);
    } else {
      renderExplorerTree(getDirtyPaths());
    }
  });

  // Boot Monaco Editor
  await initMonaco(editorContainer, handleRunCode);
  applyIdeSettingsToEditor(savedIdeSettings);
  if (editorContainer) editorContainer.classList.remove('loading');

  // Create Monaco models for all saved tabs
  for (const tab of getTabs()) {
    createModel(tab, (tabId, content) => {
      updateTabContent(tabId, content);
      if (!tab.filePath) {
        storage.saveTabContent(tabId, content);
      }
    });
  }

  // Check FSA support & restore saved workspace if available
  const fsa = await checkFsaSupport();
  if (fsa.isBlockedInBrave) {
    $('brave-flag-banner')?.classList.remove('hidden');
  }

  const restored = await restoreSavedWorkspace();
  if (restored.status === 'granted') {
    toggleExplorer(true);
    renderExplorerTree(getDirtyPaths());
  } else if (restored.status === 'prompt' && restored.handle) {
    const banner = $('workspace-reconnect-bar');
    const nameEl = $('reconnect-folder-name');
    if (banner && nameEl) {
      nameEl.textContent = restored.handle.name;
      banner.classList.remove('hidden');
    }
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

// ─── Resource & Memory Profiler Listener for Debug Zone ─────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DEBUG_ZONE_ATTACHED') {
    import('./modules/logger.js').then(({ setDebugZoneActive }) => setDebugZoneActive(true));
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'DEBUG_ZONE_DETACHED') {
    import('./modules/logger.js').then(({ setDebugZoneActive }) => setDebugZoneActive(false));
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'GET_RESOURCE_PROFILE') {
    import('./modules/logger.js').then(({ setDebugZoneActive }) => setDebugZoneActive(true));
    (async () => {
      const mem = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      } : null;

      let storageEstimate = null;
      try {
        storageEstimate = await navigator.storage.estimate();
      } catch (_) {}

      const { getEditorModelsStats } = await import('./modules/editor.js');
      const modelsInfo = getEditorModelsStats();
      const allTabs = getTabs();

      const domNodeCount = document.getElementsByTagName('*').length;
      const explorerRowsCount = document.querySelectorAll('.vsc-tree-row').length;
      const consoleOutputLines = document.querySelectorAll('.console-line').length;

      // Leak danger & suspicious heuristics
      const issues = [];
      let dangerLevel = 'SAFE';

      // Check 1: Orphaned models
      const validTabIds = allTabs.map(t => t.id);
      const orphaned = modelsInfo.models.filter(m => !validTabIds.includes(m.id));
      if (orphaned.length > 0) {
        issues.push({
          severity: 'DANGER',
          category: 'Memory Leak',
          message: `Orphaned Monaco Models: ${orphaned.length} model(s) still allocated after tab closure!`,
          details: orphaned.map(o => `${o.uri || o.id} (${o.lineCount} lines)`).join(', ')
        });
        dangerLevel = 'DANGER';
      }

      // Check 2: Heap usage near limit
      if (mem && mem.usedJSHeapSize > mem.jsHeapSizeLimit * 0.8) {
        issues.push({
          severity: 'DANGER',
          category: 'Heap Exhaustion',
          message: 'Critical: JS Heap utilization is above 80% of browser heap limit.',
          details: `${(mem.usedJSHeapSize / (1024*1024)).toFixed(1)} MB / ${(mem.jsHeapSizeLimit / (1024*1024)).toFixed(1)} MB`
        });
        dangerLevel = 'DANGER';
      } else if (mem && mem.usedJSHeapSize > 150 * 1024 * 1024) {
        issues.push({
          severity: 'WARNING',
          category: 'High Memory',
          message: 'Elevated Memory Usage: Side panel JS Heap exceeds 150 MB.',
          details: 'Multiple large files or libraries currently active.'
        });
        if (dangerLevel !== 'DANGER') dangerLevel = 'WARNING';
      }

      // Check 3: Huge DOM tree
      if (domNodeCount > 6000) {
        issues.push({
          severity: 'WARNING',
          category: 'DOM Bloat',
          message: `High DOM node count (${domNodeCount} nodes).`,
          details: `${explorerRowsCount} explorer tree rows, ${consoleOutputLines} console output lines`
        });
        if (dangerLevel !== 'DANGER') dangerLevel = 'WARNING';
      }

      // Check 4: Console buffer accumulation
      if (consoleOutputLines > 1000) {
        issues.push({
          severity: 'WARNING',
          category: 'Buffer Growth',
          message: `Console buffer holds ${consoleOutputLines} output lines.`,
          details: 'Consider clearing console to free memory.'
        });
        if (dangerLevel !== 'DANGER') dangerLevel = 'WARNING';
      }

      // Check 5: Large file model
      const largeModels = modelsInfo.models.filter(m => m.charCount > 500000);
      if (largeModels.length > 0) {
        issues.push({
          severity: 'INFO',
          category: 'Large Model',
          message: `${largeModels.length} large source file(s) (>500KB) loaded in memory.`,
          details: largeModels.map(m => `${m.id} (${(m.charCount/1024).toFixed(0)} KB)`).join(', ')
        });
      }

      sendResponse({
        ok: true,
        timestamp: Date.now(),
        memory: mem,
        storage: storageEstimate,
        domNodeCount,
        explorerRowsCount,
        consoleOutputLines,
        tabsCount: allTabs.length,
        modelsInfo,
        dangerLevel,
        issues
      });
    })();
    return true;
  } else if (msg.type === 'FORCE_CLEANUP') {
    (async () => {
      const { cleanupOrphanedModels } = await import('./modules/editor.js');
      const validTabIds = getTabs().map(t => t.id);
      const cleaned = cleanupOrphanedModels(validTabIds);

      const consoleOutput = document.getElementById('console-output');
      let trimmed = 0;
      if (consoleOutput && consoleOutput.children.length > 300) {
        while (consoleOutput.children.length > 150) {
          consoleOutput.removeChild(consoleOutput.firstChild);
          trimmed++;
        }
      }

      sendResponse({ ok: true, cleanedModels: cleaned, trimmedConsoleLines: trimmed });
    })();
    return true;
  }
});
