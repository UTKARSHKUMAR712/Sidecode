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
 * @param {Function} onFormatCommand - Triggered on Ctrl+S
 */
export function initMonaco(containerEl, onRunCommand, onFormatCommand) {
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

      // Add Ctrl+Enter command to run code
      if (onRunCommand) {
        editor.addCommand(
          window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
          onRunCommand
        );
      }

      // Add Ctrl+S command to format code
      if (onFormatCommand) {
        editor.addCommand(
          window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS,
          onFormatCommand
        );
      }

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

function getModelUri(tabId, language) {
  const ext = LANG_EXTENSIONS[language] || 'txt';
  return window.monaco.Uri.file(`/workspace/${tabId}.${ext}`);
}

const contentChangeCallbacks = new Map();

export function createModel(tab, onContentChange) {
  if (!window.monaco) return null;

  if (onContentChange) {
    contentChangeCallbacks.set(tab.id, onContentChange);
  }

  const uri = getModelUri(tab.id, tab.language || 'plaintext');
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
    }, 600);
  });

  models.set(tab.id, model);
  return model;
}

export function getModel(tabId) {
  return models.get(tabId) || null;
}

export function deleteModel(tabId) {
  contentChangeCallbacks.delete(tabId);
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
  const model = models.get(tabId);
  if (model) {
    editor.setModel(model);
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
