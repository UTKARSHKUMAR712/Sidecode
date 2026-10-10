/**
 * app.js — Sidecode Side Panel v2.0
 *
 * Features:
 *  • Monaco multi-tab editor with per-tab language + persistence
 *  • JS/TS sandboxed execution via blob-iframe
 *  • VS Code-style console panel: Ctrl+` to toggle, drag-to-resize
 *  • console.log / warn / error / info capture with color coding
 *  • Ctrl+Enter to run, Ctrl+T new tab, Ctrl+W close tab
 */

import { storage } from './storage.js';

/* ─── Editor state ─── */
let tabs        = [];
let activeTabId = null;
let monacoReady = false;
const models    = new Map();
let editor      = null;

/* ─── Console state ─── */
let consoleOpen    = false;
let consoleHeight  = 200;   // px, persisted
let isDragging     = false;
let dragStartY     = 0;
let dragStartH     = 0;
let execIframe     = null;  // reusable sandboxed iframe

/* ─── Runnable languages ─── */
const RUNNABLE = new Set(['javascript', 'typescript']);

/* ─── DOM refs ─── */
const $ = (id) => document.getElementById(id);
const elTabs          = $('tabs');
const elBtnNewTab     = $('btn-new-tab');
const elLangSelect    = $('lang-select');
const elBtnRun        = $('btn-run');
const elBtnClose      = $('btn-close-panel');
const elEditorCont    = $('editor-container');
const elMainArea      = $('main-area');
const elResizeHandle  = $('console-resize-handle');
const elConsolePanel  = $('console-panel');
const elConsoleOutput = $('console-output');
const elExecTime      = $('console-exec-time');
const elBtnConsoleRun = $('btn-console-run');
const elBtnClear      = $('btn-console-clear');
const elBtnConsClose  = $('btn-console-close');

/* ─── Language badge map ─── */
const LANG_BADGE = {
  plaintext:'TXT', javascript:'JS', typescript:'TS', html:'HTML',
  css:'CSS', json:'JSON', python:'PY', java:'JAVA', csharp:'C#',
  cpp:'C++', c:'C', go:'GO', rust:'RS', php:'PHP', ruby:'RB',
  swift:'SW', kotlin:'KT', sql:'SQL', shell:'SH', yaml:'YML',
  markdown:'MD', xml:'XML',
};

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════
   TAB BAR
══════════════════════════════════════════════ */
function renderTabs() {
  elTabs.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.id = tab.id;
    el.setAttribute('role', 'tab');
    el.title = tab.label;

    const badge = LANG_BADGE[tab.language] || tab.language.toUpperCase().slice(0, 4);
    el.innerHTML = `
      <span class="tab-label">${escapeHtml(tab.label)}</span>
      <span class="tab-lang-badge">${badge}</span>
      <button class="tab-close" title="Close (Ctrl+W)" aria-label="Close tab">&#10005;</button>`;

    el.addEventListener('click', e => {
      if (!e.target.classList.contains('tab-close')) activateTab(tab.id);
    });
    el.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation(); closeTab(tab.id);
    });
    elTabs.appendChild(el);
  });

  const activeEl = elTabs.querySelector('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'nearest' });

  updateNoTabsMsg();
  syncRunButton();
}

/* ══════════════════════════════════════════════
   NO-TABS PLACEHOLDER
══════════════════════════════════════════════ */
function updateNoTabsMsg() {
  let el = $('no-tabs-msg');
  if (tabs.length > 0) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'no-tabs-msg';
    el.innerHTML = `<span>No editor tabs open</span><button id="btn-first-tab">+ New Tab</button>`;
    elEditorCont.appendChild(el);
    $('btn-first-tab').addEventListener('click', () => newTab());
  }
}

/* ══════════════════════════════════════════════
   RUN BUTTON VISIBILITY
══════════════════════════════════════════════ */
function syncRunButton() {
  const tab = tabs.find(t => t.id === activeTabId);
  const runnable = tab && RUNNABLE.has(tab.language);
  elBtnRun.hidden = !runnable;
}

/* ══════════════════════════════════════════════
   TAB OPERATIONS
══════════════════════════════════════════════ */
function newTab(language = 'javascript') {
  const id  = uid();
  const tab = { id, label: `Tab ${tabs.length + 1}`, language, content: getDefaultContent(language) };
  tabs.push(tab);
  if (monacoReady) createModel(tab);
  storage.saveTabs(tabs);
  activateTab(id);
}

function activateTab(id) {
  activeTabId = id;
  storage.saveActiveTab(id);
  renderTabs();
  if (!monacoReady) return;

  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  if (!models.has(id)) createModel(tab);
  editor.setModel(models.get(id));
  elLangSelect.value = tab.language;
  editor.focus();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  if (monacoReady && models.has(id)) { models.get(id).dispose(); models.delete(id); }
  tabs.splice(idx, 1);
  storage.saveTabs(tabs);

  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    if (next) {
      activateTab(next.id);
    } else {
      activeTabId = null;
      storage.saveActiveTab(null);
      if (monacoReady && editor) editor.setModel(null);
      renderTabs();
    }
  } else {
    renderTabs();
  }
}

/* ══════════════════════════════════════════════
   LANGUAGE CHANGE
══════════════════════════════════════════════ */
elLangSelect.addEventListener('change', () => {
  if (!activeTabId || !monacoReady) return;
  const lang = elLangSelect.value;
  const tab  = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.language = lang;
  storage.saveTabLanguage(activeTabId, lang);
  if (models.has(activeTabId)) {
    window.monaco.editor.setModelLanguage(models.get(activeTabId), lang);
  }
  renderTabs();  // re-render syncs run button too
});

/* ══════════════════════════════════════════════
   MONACO SETUP
══════════════════════════════════════════════ */
function createModel(tab) {
  const model = window.monaco.editor.createModel(tab.content || '', tab.language || 'plaintext');
  let saveTimer = null;
  model.onDidChangeContent(() => {
    const content = model.getValue();
    const t = tabs.find(t => t.id === tab.id);
    if (t) t.content = content;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storage.saveTabContent(tab.id, content), 600);
  });
  models.set(tab.id, model);
  return model;
}

function initMonaco() {
  return new Promise(resolve => {
    // eslint-disable-next-line no-undef
    require.config({ paths: { vs: 'vs' } });
    // eslint-disable-next-line no-undef
    // eslint-disable-next-line no-undef
    require(['vs/editor/editor.main'], () => {
      // Configure MonacoEnvironment with static workers to prevent CSP blob: violations
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

      editor = window.monaco.editor.create(elEditorCont, {
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

      // Configure JavaScript/TypeScript defaults for full intellisense (DOM, console, ES features)
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

        // Immediate helper completions for common JS globals and snippets
        const createJsSnippets = () => [
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
            const suggestions = createJsSnippets().map(s => ({ ...s, range }));
            return { suggestions };
          }
        };

        window.monaco.languages.registerCompletionItemProvider('javascript', provider);
        window.monaco.languages.registerCompletionItemProvider('typescript', provider);
      }

      // Ctrl+Enter inside Monaco → run
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
        () => runCode()
      );

      monacoReady = true;
      resolve();
    });
  });
}

/* ══════════════════════════════════════════════
   DEFAULT CONTENT
══════════════════════════════════════════════ */
function getDefaultContent(lang) {
  const d = {
    javascript: '// JavaScript\nconsole.log("Hello, World!");\n',
    typescript: '// TypeScript\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("World"));\n',
    html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n',
    css: '/* Styles */\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n',
    python: '# Python\nprint("Hello, World!")\n',
    json: '{\n  "name": "example",\n  "version": "1.0.0"\n}\n',
    sql: '-- SQL\nSELECT *\nFROM table_name\nWHERE condition = true;\n',
    shell: '#!/bin/bash\necho "Hello, World!"\n',
    markdown: '# Title\n\nA paragraph of text.\n\n## Section\n\n- Item one\n- Item two\n',
  };
  return d[lang] || '';
}

/* ══════════════════════════════════════════════
   CONSOLE PANEL — OPEN / CLOSE / TOGGLE
══════════════════════════════════════════════ */
function openConsole() {
  consoleOpen = true;
  elConsolePanel.hidden  = false;
  elResizeHandle.hidden  = false;
  applyConsoleHeight(consoleHeight);
  // scroll output to bottom
  elConsoleOutput.scrollTop = elConsoleOutput.scrollHeight;
  // relayout Monaco
  if (editor) editor.layout();
}

function closeConsole() {
  consoleOpen = false;
  elConsolePanel.hidden = true;
  elResizeHandle.hidden = true;
  if (editor) editor.layout();
}

function toggleConsole() {
  if (consoleOpen) closeConsole(); else openConsole();
}

function applyConsoleHeight(h) {
  const clamped = Math.min(Math.max(h, 80), window.innerHeight * 0.75);
  consoleHeight = clamped;
  elConsolePanel.style.height = clamped + 'px';
}

/* ══════════════════════════════════════════════
   CONSOLE PANEL — DRAG-TO-RESIZE  (VS Code style)
══════════════════════════════════════════════ */
elResizeHandle.addEventListener('mousedown', e => {
  e.preventDefault();
  isDragging  = true;
  dragStartY  = e.clientY;
  dragStartH  = consoleHeight;
  elResizeHandle.classList.add('dragging');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', e => {
  if (!isDragging) return;
  // dragging upward → make console bigger
  const delta = dragStartY - e.clientY;
  applyConsoleHeight(dragStartH + delta);
  if (editor) editor.layout();
});

document.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  elResizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  // persist console height
  storage.saveConsoleHeight(consoleHeight);
});

/* ══════════════════════════════════════════════
   CONSOLE — OUTPUT HELPERS
══════════════════════════════════════════════ */
const PREFIXES = { log:'›', info:'ℹ', warn:'⚠', error:'✖', system:'', result:'←' };

function appendLine(level, text) {
  // Remove welcome hint on first real output
  const welcome = $('console-welcome');
  if (welcome) welcome.remove();

  const line = document.createElement('div');
  line.className = `con-line ${level}`;

  const prefix = document.createElement('span');
  prefix.className = 'con-prefix';
  prefix.textContent = PREFIXES[level] || '›';

  const span = document.createElement('span');
  span.className = 'con-text';
  span.textContent = text;

  line.appendChild(prefix);
  line.appendChild(span);
  elConsoleOutput.appendChild(line);
  elConsoleOutput.scrollTop = elConsoleOutput.scrollHeight;
}

function appendDivider() {
  const d = document.createElement('div');
  d.className = 'con-divider';
  elConsoleOutput.appendChild(d);
}

function appendRunBadge(label, hasError) {
  const d = document.createElement('div');
  d.className = 'con-run-badge' + (hasError ? ' error-run' : '');
  d.innerHTML = `<span class="badge-dot"></span><span>${escapeHtml(label)}</span>`;
  elConsoleOutput.appendChild(d);
  elConsoleOutput.scrollTop = elConsoleOutput.scrollHeight;
}

function clearConsole() {
  elConsoleOutput.innerHTML = '';
  elExecTime.textContent = '';
}

/* ══════════════════════════════════════════════
   CONSOLE — JS EXECUTION via sandboxed iframe
══════════════════════════════════════════════ */
function runCode() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !RUNNABLE.has(tab.language)) return;

  // open console if closed
  if (!consoleOpen) openConsole();

  const model = models.get(activeTabId);
  if (!model) return;

  const code = model.getValue();
  const startTime = performance.now();
  let hasError = false;

  // Remove old iframe if exists
  if (execIframe) {
    execIframe.remove();
    execIframe = null;
  }

  // Add a divider between runs (if output already exists)
  if (elConsoleOutput.children.length > 0) appendDivider();

  // Message handler — receives output from sandboxed iframe
  function onMessage(e) {
    if (e.source !== execIframe?.contentWindow) return;
    const msg = e.data;
    if (!msg || !msg.__sidecode) return;

    if (msg.type === 'done') {
      const elapsed = performance.now() - startTime;
      const ms = elapsed < 1 ? '<1ms' : Math.round(elapsed) + 'ms';
      elExecTime.textContent = ms;
      appendRunBadge(
        hasError ? `Finished with errors  ${ms}` : `Finished in ${ms}`,
        hasError
      );
      window.removeEventListener('message', onMessage);
      return;
    }

    if (msg.type === 'console') {
      const level = ['log','warn','error','info'].includes(msg.level) ? msg.level : 'log';
      if (level === 'error') hasError = true;
      appendLine(level, msg.text);
    } else if (msg.type === 'error') {
      hasError = true;
      const loc  = msg.line ? ` (line ${msg.line})` : '';
      appendLine('error', msg.message + loc);
    }
  }

  window.addEventListener('message', onMessage);

  // Build the sandboxed page HTML
  const sandboxHtml = buildSandboxHtml(code);
  const blob = new Blob([sandboxHtml], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);

  execIframe = document.createElement('iframe');
  execIframe.style.cssText = 'display:none;position:absolute;width:0;height:0;border:0;';
  execIframe.setAttribute('sandbox', 'allow-scripts');
  execIframe.src = blobUrl;

  document.body.appendChild(execIframe);

  // Cleanup blob URL once loaded
  execIframe.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true });

  // Safety timeout — 10 seconds
  setTimeout(() => {
    if (execIframe) {
      appendLine('warn', '⏱ Execution timed out after 10s');
      appendRunBadge('Timed out', true);
      window.removeEventListener('message', onMessage);
      execIframe.remove();
      execIframe = null;
    }
  }, 10000);
}

/* ─── Builds the HTML that runs inside the sandboxed iframe ─── */
function buildSandboxHtml(userCode) {
  // We stringify the code to safely embed it; the iframe posts messages back
  const escapedCode = JSON.stringify(userCode);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script>
(function() {
  var _origin = '*';

  function _serialize(args) {
    return args.map(function(a) {
      if (a === null)      return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'function') return '[Function: ' + (a.name || 'anonymous') + ']';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  function _post(type, payload) {
    parent.postMessage(Object.assign({ __sidecode: true, type: type }, payload), _origin);
  }

  // Override console methods
  ['log','warn','error','info'].forEach(function(level) {
    var _orig = console[level].bind(console);
    console[level] = function() {
      var args = Array.prototype.slice.call(arguments);
      _orig.apply(console, args);
      _post('console', { level: level, text: _serialize(args) });
    };
  });

  // Catch synchronous errors
  window.onerror = function(msg, src, line, col) {
    _post('error', { message: msg, line: line, col: col });
    return true;
  };

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason instanceof Error ? reason.message : String(reason);
    _post('error', { message: 'Unhandled Promise rejection: ' + msg });
  });

  // Run user code
  try {
    var _code = ${escapedCode};
    eval(_code);
  } catch(e) {
    _post('error', { message: e.message, line: e.lineNumber });
  }

  // Signal completion (after microtask queue drains)
  Promise.resolve().then(function() {
    setTimeout(function() { _post('done', {}); }, 0);
  });
})();
<\/script>
</body>
</html>`;
}

/* ══════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════ */
function setupKeyboard() {
  window.addEventListener('keydown', e => {
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
      runCode();
      return;
    }

    // Ctrl+T — new tab
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      newTab();
      return;
    }

    // Ctrl+W — close active tab
    if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
      return;
    }

    // Ctrl+1…9 — switch tabs by index
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 9) {
      const target = tabs[num - 1];
      if (target) { e.preventDefault(); activateTab(target.id); }
    }
  });
}

/* ══════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════ */
async function init() {
  elEditorCont.classList.add('loading');

  // Static button wiring
  elBtnNewTab.addEventListener('click', () => newTab());
  elBtnClose.addEventListener('click', () => window.close());
  elBtnRun.addEventListener('click', () => runCode());
  elBtnConsoleRun.addEventListener('click', () => runCode());
  elBtnClear.addEventListener('click', clearConsole);
  elBtnConsClose.addEventListener('click', closeConsole);

  setupKeyboard();

  // Load persisted state
  const saved    = await storage.load();
  tabs           = saved.tabs        || [];
  activeTabId    = saved.activeTabId || null;
  consoleHeight  = saved.consoleHeight || 200;

  // Boot Monaco
  await initMonaco();
  elEditorCont.classList.remove('loading');

  // Restore Monaco models for all saved tabs
  for (const tab of tabs) createModel(tab);

  if (tabs.length === 0) {
    newTab('javascript');
  } else {
    const restore = (activeTabId && tabs.find(t => t.id === activeTabId))
      ? activeTabId
      : tabs[0].id;
    activateTab(restore);
    renderTabs();
  }
}

init();
