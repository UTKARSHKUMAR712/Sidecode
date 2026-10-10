/**
 * editor.js — Monaco Editor Manager for Sidecode
 *
 * Configures static web workers (compliant with MV3 CSP),
 * editor options, auto-completion, model swapping and syntax services.
 */

let editor = null;
let isMonacoReady = false;
const models = new Map();

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
        wordBasedSuggestions: 'currentDocument',
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

        registerJsCompletions();
      }

      // Add Ctrl+Enter command to run code
      if (onRunCommand) {
        editor.addCommand(
          window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
          onRunCommand
        );
      }

      isMonacoReady = true;
      resolve(editor);
    });
  });
}

function registerJsCompletions() {
  const snippets = [
    {
      label: 'console.log',
      kind: window.monaco.languages.CompletionItemKind.Snippet,
      insertText: 'console.log(${1:value});',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Log output to console',
      detail: 'console.log(...)'
    },
    {
      label: 'console.error',
      kind: window.monaco.languages.CompletionItemKind.Snippet,
      insertText: 'console.error(${1:error});',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Log error to console',
      detail: 'console.error(...)'
    },
    {
      label: 'console.warn',
      kind: window.monaco.languages.CompletionItemKind.Snippet,
      insertText: 'console.warn(${1:warning});',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Log warning to console',
      detail: 'console.warn(...)'
    },
    {
      label: 'console.table',
      kind: window.monaco.languages.CompletionItemKind.Snippet,
      insertText: 'console.table(${1:data});',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Display tabular data as a table',
      detail: 'console.table(...)'
    },
    {
      label: 'console.clear',
      kind: window.monaco.languages.CompletionItemKind.Snippet,
      insertText: 'console.clear();',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Clear console output',
      detail: 'console.clear()'
    },
    {
      label: 'console',
      kind: window.monaco.languages.CompletionItemKind.Variable,
      insertText: 'console',
      documentation: 'The console object provides access to the browser debugging console',
      detail: 'Console'
    },
    {
      label: 'const',
      kind: window.monaco.languages.CompletionItemKind.Keyword,
      insertText: 'const ${1:name} = ${2:value};',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Declare a block-scoped constant',
      detail: 'const declaration'
    },
    {
      label: 'let',
      kind: window.monaco.languages.CompletionItemKind.Keyword,
      insertText: 'let ${1:name} = ${2:value};',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Declare a block-scoped variable',
      detail: 'let declaration'
    },
    {
      label: 'function',
      kind: window.monaco.languages.CompletionItemKind.Snippet,
      insertText: 'function ${1:name}(${2:params}) {\n\t${3}\n}',
      insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Declare a function',
      detail: 'function statement'
    }
  ];

  const provider = {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      const suggestions = snippets.map((s) => ({ ...s, range }));
      return { suggestions };
    }
  };

  window.monaco.languages.registerCompletionItemProvider('javascript', provider);
  window.monaco.languages.registerCompletionItemProvider('typescript', provider);
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
