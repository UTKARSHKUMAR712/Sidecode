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

export function createModel(tab, onContentChange) {
  if (!window.monaco) return null;

  const model = window.monaco.editor.createModel(
    tab.content || '',
    tab.language || 'plaintext'
  );

  let saveTimer = null;
  model.onDidChangeContent(() => {
    const content = model.getValue();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (onContentChange) onContentChange(tab.id, content);
    }, 600);
  });

  models.set(tab.id, model);
  return model;
}

export function getModel(tabId) {
  return models.get(tabId) || null;
}

export function deleteModel(tabId) {
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
  const model = models.get(tabId);
  if (model && window.monaco) {
    window.monaco.editor.setModelLanguage(model, language);
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
