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
  getRunCommandForTab,
  fitTerminal,
  setTerminalFontSize,
  writePrompt,
  promptStdinFromTerminal
} from './modules/terminal.js';

const $ = (id) => document.getElementById(id);

// ─── Settings & Execution Environment state ───────────────────────────────
let activeEnv = 'cloud'; // 'cloud' (default) | 'local' | 'sandbox'
let customPistonUrl = '';
let currentIdeSettings = { libraries: [] };

function setActiveEnv(val) {
  activeEnv = val;
  const envSelect = $('env-select');
  if (envSelect && envSelect.value !== val) envSelect.value = val;
  const settingsSelect = $('setting-js-runner');
  if (settingsSelect) settingsSelect.value = val === 'sandbox' ? 'sandbox' : 'cloud';
}

function getActiveEnv() {
  return activeEnv;
}

function setJsRunnerPreference(val) {
  setActiveEnv(val);
}

// ─── Decide which runner to use for a given language ────────────────────────
function pickRunner(language) {
  if (activeEnv === 'local') {
    return 'local';
  }
  if (activeEnv === 'sandbox') {
    if (SANDBOX_LANGUAGES.has(language)) return 'sandbox';
    if (isCloudSupported(language) || customPistonUrl) return 'cloud';
    return null;
  }
  // Default is 'cloud'
  if (isCloudSupported(language) || customPistonUrl) {
    return 'cloud';
  }
  if (SANDBOX_LANGUAGES.has(language)) {
    return 'sandbox';
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

  // 2. Print command prompt echo so command is shown FIRST and output is BELOW it
  const cmdStr = getRunCommandForTab(tab);
  appendCommandLineEcho(cmdStr);

  if (!runner) {
    import('./modules/console.js').then(({ appendLine, appendRunBadge, setExecTime }) => {
      appendLine('warn', `Language "${tab.language}" does not have an execution engine configured.`);
      appendRunBadge('Not runnable', true);
      setExecTime('—');
    });
    import('./modules/terminal.js').then(({ writePrompt }) => writePrompt());
    return;
  }

function codeExpectsInput(code, lang) {
  if (!code) return false;
  if (lang === 'c' || lang === 'cpp') {
    return /\b(scanf|cin\s*>>|getline|fgets|getchar|gets)\b/.test(code);
  }
  if (lang === 'python' || lang === 'py') {
    return /\b(input\s*\(|sys\.stdin)\b/.test(code);
  }
  if (lang === 'java') {
    return /\b(Scanner|System\.in|BufferedReader)\b/.test(code);
  }
  if (lang === 'rust') {
    return /\b(stdin\(\)\.read_line|read_line)\b/.test(code);
  }
  return false;
}

  const activePath = tab.filePath || tab.label || '';
  try {
    // 1. If user explicitly selected "Local PC Terminal", execute via Local Native Bridge
    const { getTerminalMode, writeLineToTerminal, focusTerminal, getTerm } = await import('./modules/terminal.js');
    const isLocalMode = getTerminalMode() === 'local';

    if (isLocalMode && tab.language !== 'javascript' && tab.language !== 'typescript') {
      const { ensureBridgeRunning, executeViaBridge } = await import('./modules/bridgeClient.js');
      const folderName = getWorkspaceName() || 'workspace';
      const bridgeStatus = await ensureBridgeRunning(folderName);
      if (!bridgeStatus.ok) {
        writeLineToTerminal('warn', '⚠ Local PC Bridge not running on port 3888. (See README.md for 1-click setup)');
        return;
      }
      if (bridgeStatus.resolvedPath) {
        const { setLocalResolvedPath } = await import('./modules/terminal.js');
        setLocalResolvedPath(bridgeStatus.resolvedPath);
      }

      const isWin = bridgeStatus.data?.platform === 'win32';
      const exeName = isWin ? 'a.exe' : './a.out';
      const targetFile = tab.label || tab.filePath || 'main.c';
      let localCmd = '';
      if (tab.language === 'c') localCmd = `gcc "${targetFile}" -o ${isWin ? 'a.exe' : 'a.out'} && ${exeName}`;
      else if (tab.language === 'cpp') localCmd = `g++ "${targetFile}" -o ${isWin ? 'a.exe' : 'a.out'} && ${exeName}`;
      else if (tab.language === 'python') localCmd = `python -u "${targetFile}"`;
      else if (tab.language === 'rust') localCmd = `rustc "${targetFile}" && ${exeName}`;
      else if (tab.language === 'go') localCmd = `go run "${targetFile}"`;
      else if (tab.language === 'java') localCmd = `java "${targetFile}"`;

      if (localCmd) {
        writeLineToTerminal('system', `▶ Running via Local Native Bridge (${targetFile})...`);
        focusTerminal();

        // Gather files to sync into bridge workspace directory
        const filesToSync = [{ path: targetFile, content: code }];
        if (tab.filePath && tab.filePath !== targetFile) {
          filesToSync.push({ path: tab.filePath, content: code });
        }
        for (const t of getTabs()) {
          if (t.id !== tab.id) {
            const m = getModel(t.id);
            const content = m ? m.getValue() : (t.content || '');
            const p = t.filePath || t.label;
            if (p) filesToSync.push({ path: p, content });
          }
        }

        const folderName = getWorkspaceName() || 'workspace';

        try {
          await executeViaBridge(localCmd, {
            folder: folderName,
            files: filesToSync,
            onData: (chunk) => {
              const t = getTerm();
              if (t) t.write(chunk);
            }
          });
          return;
        } catch (err) {
          writeLineToTerminal('warn', `Local bridge error: ${err.message}. Falling back to Cloud...`);
        }
      }
    }

    // 2. Default: In-Browser Sandbox or Cloud Runner
    if (runner === 'sandbox') {
      await executeCode(code, tab.language, model, activePath);
    } else {
      let stdinVal = '';
      const stdin = getStdin();
      if (stdin.valid && stdin.value.trim()) {
        stdinVal = stdin.value;
      } else if (codeExpectsInput(code, tab.language)) {
        stdinVal = await promptStdinFromTerminal('? Enter input for program:');
      }

      const activeLibs = getSelectedLibrariesForLanguage(tab.language);
      await executeViaCloud(code, tab.language, customPistonUrl, stdinVal, activeLibs, tab.id, activePath);
    }
  } finally {
    import('./modules/terminal.js').then(({ writePrompt }) => writePrompt());
  }
}


// ─── Show/hide Run button based on active language ──────────────────────────
function updateRunControls(language) {
  const runBtn = $('btn-run');
  const canRun = RUNNABLE_LANGUAGES.has(language) || (!!customPistonUrl && isCloudSupported(language));
  if (runBtn) runBtn.hidden = !canRun;
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
      await restoreWorkspaceFilesFromDisk();
    }
  } catch (err) {
    alert(`Failed to reconnect workspace: ${err.message}`);
  }
}

function syncWorkspaceSession() {
  const wsTabs = getTabs().filter((t) => !!t.filePath);
  const active = getActiveTab();
  storage.saveWorkspaceSession({
    openPaths: wsTabs.map((t) => t.filePath),
    activePath: active?.filePath || (wsTabs.length > 0 ? wsTabs[0].filePath : null)
  });
}

async function restoreWorkspaceFilesFromDisk() {
  const session = storage.getWorkspaceSession();
  if (!session || !session.openPaths || session.openPaths.length === 0) return;

  const { findNodeInTree, readFileFromDisk } = await import('./modules/workspace.js');
  let openedAny = false;

  for (const path of session.openPaths) {
    const node = findNodeInTree(path);
    if (node && node.kind === 'file') {
      try {
        const content = await readFileFromDisk(node.handle);
        const tab = openFileInTab(node, content);
        let model = getModel(tab.id);
        if (!model || model.isDisposed()) {
          createModel(tab, (tabId, val) => {
            updateTabContent(tabId, val);
          });
        }
        openedAny = true;
      } catch (err) {
        console.warn('Could not restore workspace file:', path, err);
      }
    }
  }

  if (openedAny) {
    // Close clean untitled scratchpads so real workspace tabs take focus
    const scratchpads = getTabs().filter(
      (t) => !t.filePath && t.label.startsWith('Untitled-') && !t.isDirty && t.content === getDefaultContent(t.language)
    );
    for (const s of scratchpads) {
      closeTab(s.id);
    }

    const targetPath = session.activePath || session.openPaths[0];
    if (targetPath) {
      const activeTab = getTabByPath(targetPath);
      if (activeTab) {
        activateTab(activeTab.id);
        setEditorModel(activeTab.id);
      }
    }
    renderExplorerTree(getDirtyPaths());
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
    
    // Apply to console & terminal
    document.documentElement.style.setProperty('--ide-font-size', `${currentIdeSettings.fontSize}px`);
    import('./modules/terminal.js').then(({ setTerminalFontSize }) => {
      setTerminalFontSize(currentIdeSettings.fontSize);
    });

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

  // Unified Execution Environment selector (#env-select)
  $('env-select')?.addEventListener('change', async (e) => {
    const chosenEnv = e.target.value;
    setActiveEnv(chosenEnv);
    storage.saveEnv(chosenEnv);
    storage.saveTerminalMode(chosenEnv === 'local' ? 'local' : 'browser');
    storage.saveJsRunner(chosenEnv === 'sandbox' ? 'sandbox' : 'cloud');

    const { setTerminalMode, writeLineToTerminal, writePrompt, setLocalResolvedPath, clearTerminal } = await import('./modules/terminal.js');
    const { ensureBridgeRunning, startBridgeHeartbeat, stopBridgeHeartbeat } = await import('./modules/bridgeClient.js');

    if (chosenEnv === 'local') {
      setTerminalMode('local');
      clearTerminal();
      const wsName = getWorkspaceName();
      const res = await ensureBridgeRunning(wsName);
      if (res.ok) {
        startBridgeHeartbeat();
        if (res.resolvedPath) {
          setLocalResolvedPath(res.resolvedPath);
        }
        clearTerminal();
      } else {
        clearTerminal();
        writeLineToTerminal('warn', '⚠ Local PC Bridge not running on port 3888. (See README.md for 1-click setup)');
        writePrompt();
      }
    } else {
      setTerminalMode('browser');
      stopBridgeHeartbeat();
      setLocalResolvedPath('');
      clearTerminal();
    }
  });

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
  const savedAutoSave = saved.autoSave !== undefined ? saved.autoSave : false;
  customPistonUrl = saved.customPistonUrl || '';
  const savedEnv = saved.activeEnv || (saved.terminalMode === 'local' ? 'local' : (saved.jsRunner === 'sandbox' ? 'sandbox' : 'cloud'));
  const savedJsRunner = saved.jsRunner || (savedEnv === 'sandbox' ? 'sandbox' : 'cloud');

  // Apply persisted settings
  setActiveEnv(savedEnv);
  setAutoSave(savedAutoSave);
  $('autosave-check')?.classList.toggle('active', savedAutoSave);

  const envSelect = $('env-select');
  if (envSelect) envSelect.value = savedEnv;

  import('./modules/terminal.js').then(async ({ setTerminalMode, setLocalResolvedPath }) => {
    setTerminalMode(savedEnv === 'local' ? 'local' : 'browser');
    if (savedEnv === 'local') {
      const { checkBridgeStatus, startBridgeHeartbeat } = await import('./modules/bridgeClient.js');
      startBridgeHeartbeat();
      const wsName = getWorkspaceName();
      const status = await checkBridgeStatus(wsName);
      if (status.ok && status.resolvedPath) {
        setLocalResolvedPath(status.resolvedPath);
      }
    }
  });

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
    onLayout: () => {
      layoutEditor();
      fitTerminal();
    },
    onSaveHeight: (h) => storage.saveConsoleHeight(h)
  });

  // Initialize Sandboxed Runner (for JS/TS)
  initRunner();

  // Initialize Tabs module with saved default language
  initTabs(savedTabs, savedActiveId, {
    onTabActivate: (tab) => {
      syncWorkspaceSession();
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
      syncWorkspaceSession();
    },
    onTabClose: (tabId) => {
      deleteModel(tabId);
      storage.saveTabs(getTabs().filter((t) => !t.filePath));
      syncWorkspaceSession();
    },
    onTabsChange: (allTabs) => {
      storage.saveTabs(allTabs.filter((t) => !t.filePath));
      renderExplorerTree(getDirtyPaths());
      syncWorkspaceSession();
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
        let stdinVal = '';
        const stdin = getStdin();
        if (stdin.valid && stdin.value.trim()) {
          stdinVal = stdin.value;
        } else if (codeExpectsInput(code, lang)) {
          stdinVal = await promptStdinFromTerminal('? Enter input for program:');
        }
        const activeLibs = getSelectedLibrariesForLanguage(lang);
        await executeViaCloud(code, lang, customPistonUrl, stdinVal, activeLibs, null, filenameOrPath);
      }
    },
    executeRawJs: async (code) => {
      await executeCode(code, 'javascript');
    }
  });
  setTerminalFontSize(savedIdeSettings.fontSize);

  // Listen to workspace state changes
  onWorkspaceChange(async ({ action }) => {
    updateTerminalPrompt();
    if (action === 'closed') {
      import('./modules/terminal.js').then(({ resetTerminalCwd, setLocalResolvedPath, writePrompt }) => {
        if (typeof resetTerminalCwd === 'function') resetTerminalCwd();
        if (typeof setLocalResolvedPath === 'function') setLocalResolvedPath('');
        if (typeof writePrompt === 'function') writePrompt();
      });
      toggleExplorer(false);
    } else {
      renderExplorerTree(getDirtyPaths());
      const { getTerminalMode, setLocalResolvedPath, writePrompt } = await import('./modules/terminal.js');
      if (getTerminalMode() === 'local') {
        const { checkBridgeStatus } = await import('./modules/bridgeClient.js');
        const wsName = getWorkspaceName();
        const status = await checkBridgeStatus(wsName);
        if (status.ok && status.resolvedPath) {
          setLocalResolvedPath(status.resolvedPath);
          writePrompt();
        }
      }
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
    await restoreWorkspaceFilesFromDisk();
  } else if (restored.status === 'prompt' && restored.handle) {
    const banner = $('workspace-reconnect-bar');
    const nameEl = $('reconnect-folder-name');
    if (banner && nameEl) {
      nameEl.textContent = restored.handle.name;
      banner.classList.remove('hidden');
    }
    // Auto-reconnect on first click anywhere in the window
    const autoReconnect = async () => {
      window.removeEventListener('pointerdown', autoReconnect);
      if (!isWorkspaceOpen()) {
        await handleReconnectWorkspace();
      }
    };
    window.addEventListener('pointerdown', autoReconnect, { once: true });
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

// Auto-close bridge background service when extension sidepanel is closed
window.addEventListener('beforeunload', () => {
  import('./modules/bridgeClient.js').then(({ sendBridgeShutdown }) => {
    sendBridgeShutdown();
  });
});
window.addEventListener('pagehide', () => {
  import('./modules/bridgeClient.js').then(({ sendBridgeShutdown }) => {
    sendBridgeShutdown();
  });
});
