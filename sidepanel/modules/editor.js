import { registerAllLanguageCompletions } from './completions.js';

let editor = null;
let isMonacoReady = false;
const models = new Map();

export function getEditor() {
  return editor;
}

/**
 * Initialize Monaco editor
 * @param {HTMLElement} containerEl - DOM container for the editor
 * @param {Function} onRunCommand - Triggered on Ctrl+Enter
 */
export function initMonaco(containerEl, onRunCommand) {
  return new Promise((resolve) => {
    // eslint-disable-next-line no-undef
    require.config({ paths: { vs: 'vs' } });

    // eslint-disable-next-line no-undef
    require(['vs/editor/editor.main'], () => {
      // Configure MonacoEnvironment with physical static workers (avoids CSP blob: errors)
      window.MonacoEnvironment = {
        getWorker(moduleId, label) {
          const getWorkerPath = () => {
            switch (label) {
              case 'json':
                return 'workers/json.worker.js';
              case 'css':
              case 'scss':
              case 'less':
                return 'workers/css.worker.js';
              case 'html':
              case 'handlebars':
              case 'razor':
                return 'workers/html.worker.js';
              case 'typescript':
              case 'javascript':
                return 'workers/ts.worker.js';
              default:
                return 'workers/editor.worker.js';
            }
          };
          return new Worker(chrome.runtime.getURL('sidepanel/' + getWorkerPath()));
        }
      };

      editor = window.monaco.editor.create(containerEl, {
        model: null,
        theme: 'vs-dark',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
        padding: { top: 6, bottom: 6 },
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
        overviewRulerLanes: 0,
        renderLineHighlight: 'gutter',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'smart',
        tabCompletion: 'on',
        snippetSuggestions: 'top',
        suggestSelection: 'first',
        parameterHints: { enabled: true, cycle: true },
        wordBasedSuggestions: 'allDocuments',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: true },
        suggest: {
          showWords: true,
          showSnippets: true,
          showClasses: true,
          showFunctions: true,
          showVariables: true,
          showConstants: true,
          showConstructors: true,
          showFields: true,
          showInterfaces: true,
          showKeywords: true,
          showMethods: true,
          showProperties: true,
          preview: true,
          shareSuggestSelections: true,
          filterGraceful: true,
          localityBonus: true
        }
      });

      // Configure TypeScript/JavaScript language defaults
      if (window.monaco.languages && window.monaco.languages.typescript) {
        window.monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false
        });
        window.monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
          target: window.monaco.languages.typescript.ScriptTarget.ESNext,
          allowNonTsExtensions: true,
          allowJs: true
        });
        window.monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
        window.monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
      }

      // Register rich completions and snippets for Python, C, C++, Java, Go, Rust, SQL, JS, TS, etc.
      registerAllLanguageCompletions(window.monaco);

      // Register Godbolt formatters for C, C++, Rust, Go, Java
      import('./formatters.js').then(({ registerCloudFormatters }) => {
        registerCloudFormatters(window.monaco);
      });

      // Add Ctrl+Enter command to run code
      if (onRunCommand) {
        editor.addCommand(
          window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
          onRunCommand
        );
      }

      // Add Ctrl+S command to save active tab to disk
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS,
        () => {
          import('./tabs.js').then(({ saveActiveTabToDisk }) => {
            saveActiveTabToDisk();
          });
        }
      );

      // Add Ctrl+Shift+S command for Save As
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Shift | window.monaco.KeyCode.KeyS,
        () => {
          import('./tabs.js').then(({ saveActiveTabAs }) => {
            saveActiveTabAs();
          });
        }
      );

      // Add Ctrl+O command to open file
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyO,
        () => {
          const fileEntry = document.getElementById('menu-open-file');
          if (fileEntry) fileEntry.click();
        }
      );

      // Add Ctrl+B command to toggle file explorer
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyB,
        () => {
          import('./explorer.js').then(({ toggleExplorer }) => {
            toggleExplorer();
          });
        }
      );

      // Add Ctrl+Alt+F command to trigger Monaco's native format document
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Alt | window.monaco.KeyCode.KeyF,
        () => {
          const action = editor.getAction('editor.action.formatDocument');
          if (action) action.run();
          
          // Optionally notify in console
          const model = editor.getModel();
          if (model) {
            const lang = model.getLanguageId();
            const builtinFormatters = ['javascript', 'typescript', 'html', 'css', 'json', 'markdown'];
            if (builtinFormatters.includes(lang)) {
              import('./console.js').then(({ openConsole, appendLine }) => {
                openConsole();
                appendLine('system', `Formatted using Monaco built-in formatter.`);
              });
            }
          }
        }
      );

      // Add right-click context menu item: Save to Disk
      editor.addAction({
        id: 'sidecode.save-to-disk',
        label: 'Save File (Ctrl+S)',
        keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS],
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.5,
        run: () => {
          import('./tabs.js').then(({ saveActiveTabToDisk }) => {
            saveActiveTabToDisk();
          });
        }
      });

      // Add right-click context menu item: Manage Libraries (Dependencies)...
      editor.addAction({
        id: 'sidecode.manage-dependencies',
        label: 'Manage Libraries (Dependencies)...',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 2.0,
        run: () => {
          import('./libraries.js').then(({ openDependenciesModal }) => {
            const model = editor.getModel();
            const lang = model ? model.getLanguageId() : 'cpp';
            openDependenciesModal(lang);
          });
        }
      });

      // Add right-click context menu item: Analyze Code (Static Analysis)
      editor.addAction({
        id: 'sidecode.run-static-analysis',
        label: 'Analyze Code (Static Analysis)',
        keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Alt | window.monaco.KeyCode.KeyA],
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 2.1,
        run: () => {
          import('./analysis.js').then(({ runStandaloneAnalysis }) => {
            import('./tabs.js').then(({ getActiveTab }) => {
              runStandaloneAnalysis(getActiveTab());
            });
          });
        }
      });

      isMonacoReady = true;
      resolve(editor);
    });
  });
}

const LANG_EXTENSIONS = {
  javascript: 'js',
  typescript: 'ts',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  python: 'py',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  rust: 'rs',
  go: 'go',
  markdown: 'md',
  sql: 'sql',
  shell: 'sh',
  yaml: 'yml',
  xml: 'xml'
};

function getModelUri(tab, language) {
  if (tab.filePath) {
    return window.monaco.Uri.file('/' + tab.filePath);
  }
  const ext = LANG_EXTENSIONS[language || tab.language] || 'txt';
  return window.monaco.Uri.file(`/workspace/${tab.id}.${ext}`);
}

const contentChangeCallbacks = new Map();
const viewStates = new Map();
let currentActiveTabId = null;

export function createModel(tab, onContentChange) {
  if (!window.monaco) return null;

  if (onContentChange) {
    contentChangeCallbacks.set(tab.id, onContentChange);
  }

  const uri = getModelUri(tab, tab.language || 'plaintext');
  const existing = window.monaco.editor.getModel(uri);
  if (existing) existing.dispose();

  const model = window.monaco.editor.createModel(
    tab.content || '',
    tab.language || 'plaintext',
    uri
  );

  let saveTimer = null;
  model.onDidChangeContent(() => {
    const content = model.getValue();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const cb = contentChangeCallbacks.get(tab.id);
      if (cb) cb(tab.id, content);
    }, 400);
  });

  models.set(tab.id, model);
  return model;
}

export function getModel(tabId) {
  return models.get(tabId) || null;
}

export function deleteModel(tabId) {
  contentChangeCallbacks.delete(tabId);
  viewStates.delete(tabId);
  if (models.has(tabId)) {
    models.get(tabId).dispose();
    models.delete(tabId);
  }
}

export function applyIdeSettingsToEditor(settings) {
  if (editor) {
    editor.updateOptions({
      fontSize: settings.fontSize || 13,
      tabSize: settings.tabSize || 2,
      wordWrap: settings.wordWrap ? 'on' : 'off'
    });
  }
}

export function setEditorModel(tabId) {
  if (!editor) return;

  // Save view state of outgoing tab
  if (currentActiveTabId && editor.getModel()) {
    viewStates.set(currentActiveTabId, editor.saveViewState());
  }
  currentActiveTabId = tabId;

  const model = models.get(tabId);
  if (model) {
    editor.setModel(model);
    // Restore previous scroll and cursor position if saved
    if (viewStates.has(tabId)) {
      editor.restoreViewState(viewStates.get(tabId));
    }
    editor.focus();
  } else {
    editor.setModel(null);
  }
}

export function setModelLanguage(tabId, language) {
  const oldModel = models.get(tabId);
  if (!oldModel || !window.monaco) return;

  const targetUri = getModelUri(tabId, language);
  if (oldModel.uri.toString() === targetUri.toString()) {
    window.monaco.editor.setModelLanguage(oldModel, language);
    return;
  }

  // Language changed with a different file extension — recreate model with new URI so language services attach
  const content = oldModel.getValue();
  const isCurrentModel = editor && editor.getModel() === oldModel;

  oldModel.dispose();
  const existing = window.monaco.editor.getModel(targetUri);
  if (existing) existing.dispose();

  const newModel = window.monaco.editor.createModel(content, language, targetUri);

  let saveTimer = null;
  newModel.onDidChangeContent(() => {
    const val = newModel.getValue();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const cb = contentChangeCallbacks.get(tabId);
      if (cb) cb(tabId, val);
    }, 600);
  });

  models.set(tabId, newModel);
  if (isCurrentModel && editor) {
    editor.setModel(newModel);
  }
}

export function layoutEditor() {
  if (editor) editor.layout();
}

export function focusEditor() {
  if (editor) editor.focus();
}

export function getEditorValue() {
  return editor?.getValue() || '';
}

export function isReady() {
  return isMonacoReady;
}

export function setDiagnostics(tabId, diagnostics = []) {
  if (!window.monaco) return;
  const model = models.get(tabId);
  if (!model) return;

  const markers = diagnostics.map(d => {
    let severity = window.monaco.MarkerSeverity.Warning;
    if (d.severity === 'error') severity = window.monaco.MarkerSeverity.Error;
    else if (d.severity === 'info') severity = window.monaco.MarkerSeverity.Info;

    return {
      severity,
      startLineNumber: Math.max(1, d.line),
      startColumn: Math.max(1, d.column),
      endLineNumber: Math.max(1, d.line),
      endColumn: Math.max(1, d.column + 2),
      message: d.ruleId ? `${d.message} [${d.ruleId}]` : d.message,
      source: d.source || 'Static Analysis'
    };
  });

  window.monaco.editor.setModelMarkers(model, 'static-analysis', markers);
}

export function revealLocation(lineNumber, column = 1) {
  if (!editor || !window.monaco) return;
  const line = Math.max(1, lineNumber);
  const col = Math.max(1, column);
  editor.revealPositionInCenter({ lineNumber: line, column: col }, window.monaco.editor.ScrollType.Smooth);
  editor.setPosition({ lineNumber: line, column: col });
  editor.focus();
}

/**
 * Return detailed diagnostic metrics for all Monaco models currently in memory
 */
export function getEditorModelsStats() {
  const list = [];
  for (const [id, model] of models.entries()) {
    if (!model.isDisposed()) {
      const lineCount = model.getLineCount();
      const length = model.getValueLength();
      list.push({
        id,
        uri: model.uri ? model.uri.toString() : id,
        language: model.getLanguageId(),
        lineCount,
        charCount: length,
        estimatedBytes: length * 2
      });
    }
  }
  return {
    totalModels: models.size,
    activeModels: list.length,
    models: list
  };
}

/**
 * Cleanup any models that no longer have a corresponding open tab
 */
export function cleanupOrphanedModels(validTabIds = []) {
  let cleaned = 0;
  for (const [id, model] of models.entries()) {
    if (!validTabIds.includes(id)) {
      try {
        if (!model.isDisposed()) model.dispose();
      } catch (_) {}
      models.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}
