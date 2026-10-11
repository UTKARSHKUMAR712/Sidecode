/**
 * analysis.js — Cloud Static Analysis & Problems Panel for Sidecode
 *
 * Provides VS Code-style Problems panel with structured diagnostics,
 * clickable navigation, and Monaco warning/error underlines.
 *
 * Automatically discovers compatible analyzers from Godbolt (Clang-Tidy for C/C++, Clippy for Rust),
 * configures sensible non-noisy checks, and isolates diagnostics from the Console.
 */

import { debugLog } from './logger.js';
import { setDiagnostics, revealLocation, getEditorValue } from './editor.js';

// Cache discovered tools per language to avoid redundant network calls
const toolCache = new Map();

/**
 * Clean ANSI color codes and carriage returns
 */
function stripAnsi(str) {
  if (!str) return '';
  return str
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\u001b\[K/g, '')
    .replace(/\r/g, '');
}

/**
 * Discover and verify compatible static analyzer from Godbolt API
 */
export async function getAnalyzerForLanguage(lang) {
  if (toolCache.has(lang)) {
    return toolCache.get(lang);
  }

  const godboltLang = lang === 'cpp' ? 'c++' : lang;

  try {
    const res = await fetch(`https://godbolt.org/api/tools/${encodeURIComponent(godboltLang)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      toolCache.set(lang, null);
      return null;
    }

    const tools = await res.json();
    if (!Array.isArray(tools)) {
      toolCache.set(lang, null);
      return null;
    }

    // 1. C++ Analyzer: Clang-Tidy with curated student-friendly checks
    if (lang === 'cpp') {
      const tidy = tools.find(t => t.id === 'clangtidytrunk' || t.name?.toLowerCase().includes('clang-tidy'));
      if (tidy) {
        // Exclude noisy internal LLVM libc checks and trailing return type enforcement
        const checks = '-checks=-*,bugprone-*,clang-analyzer-*,readability-*,performance-*,misc-*,-llvmlibc-*,-llvm-header-guard,-modernize-use-trailing-return-type';
        const config = { id: tidy.id, name: 'Clang-Tidy', args: checks };
        toolCache.set(lang, config);
        return config;
      }
    }

    // 2. C Analyzer: Clang-Tidy with C-specific checks (NO C++ specific checks)
    if (lang === 'c') {
      const tidy = tools.find(t => t.id === 'clangtidytrunk' || t.name?.toLowerCase().includes('clang-tidy'));
      if (tidy) {
        // Exclude C++ checks like modernize or cppcoreguidelines
        const checks = '-checks=-*,bugprone-*,clang-analyzer-*,misc-*,-llvmlibc-*,-llvm-header-guard';
        const config = { id: tidy.id, name: 'Clang-Tidy (C)', args: checks };
        toolCache.set(lang, config);
        return config;
      }
    }

    // 3. Rust Analyzer: Clippy
    if (lang === 'rust') {
      const clippy = tools.find(t => t.id === 'clippy' || t.name?.toLowerCase().includes('clippy'));
      if (clippy) {
        const config = { id: clippy.id, name: 'Clippy', args: '' };
        toolCache.set(lang, config);
        return config;
      }
    }
  } catch (err) {
    debugLog('warn', `Failed to discover tools for ${lang}`, { error: err.message });
  }

  toolCache.set(lang, null);
  return null;
}

/**
 * Parse Godbolt tools output and buildStderr into structured diagnostics
 */
export function parseDiagnostics(tools = [], language = '', buildStderr = []) {
  const diagnostics = [];
  const seen = new Set();

  // 1. Parse static analyzer tools output
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      const toolName = tool.name || tool.id;
      // Examine both stdout (Clang-Tidy) and stderr (Clippy)
      const streamItems = [...(tool.stdout || []), ...(tool.stderr || [])];

      for (const item of streamItems) {
        if (!item) continue;
        let rawText = '';
        const tag = item.tag || null;

        if (tag && tag.text) rawText = tag.text;
        else if (item.text) rawText = item.text;

        rawText = stripAnsi(rawText).trim();
        if (!rawText) continue;

        // Skip command-line usage dumps, pointer lines, or statistics summaries
        if (
          rawText.startsWith('USAGE:') ||
          rawText.startsWith('OPTIONS:') ||
          rawText.startsWith('-->') ||
          rawText.startsWith(':::') ||
          rawText.includes('warnings generated.') ||
          rawText.includes('warning emitted') ||
          rawText.includes('Suppressed ') ||
          rawText.includes('checks enabled.')
        ) {
          continue;
        }

        // Suppress noisy internal libc implementation checks
        if (rawText.includes('llvmlibc-') || rawText.includes('llvm-header-guard')) {
          continue;
        }

        let line = tag?.line || 0;
        let column = tag?.column || 0;
        let file = tag?.file || '';
        let severity = 'warning';
        let message = rawText;
        let ruleId = '';

        // Match standard format: <source>:line:col: severity: message [rule-id]
        const locMatch = rawText.match(/^(?:<source>|[^:]+):(\d+):(\d+):\s*(error|warning|info|note):\s*(.+)$/i);
        if (locMatch) {
          line = parseInt(locMatch[1], 10);
          column = parseInt(locMatch[2], 10);
          const sevStr = locMatch[3].toLowerCase();
          message = locMatch[4];
          if (sevStr === 'error') severity = 'error';
          else if (sevStr === 'warning') severity = 'warning';
          else severity = 'info';
        } else if (tag) {
          if (tag.severity === 3) severity = 'error';
          else if (tag.severity === 2) severity = 'warning';
          else severity = 'info';

          const prefixMatch = message.match(/^(error|warning|info|note):\s*(.+)$/i);
          if (prefixMatch) {
            const sevStr = prefixMatch[1].toLowerCase();
            if (sevStr === 'error') severity = 'error';
            else if (sevStr === 'warning') severity = 'warning';
            else severity = 'info';
            message = prefixMatch[2];
          }
        } else {
          continue;
        }

        // Extract ruleId [rule-id] from end of message if present
        const ruleMatch = message.match(/\s*\[([^\]]+)\]$/);
        if (ruleMatch) {
          ruleId = ruleMatch[1];
          message = message.substring(0, ruleMatch.index).trim();
        }

        // Rust Clippy lint rule extraction from note
        if (!ruleId && message.includes('#[warn(')) {
          const clippyMatch = message.match(/#\[warn\(([^)]+)\)\]/);
          if (clippyMatch) ruleId = clippyMatch[1];
        }

        if (!line || line <= 0) continue;

        // Skip non-actionable sub-notes that simply repeat the parent warning
        if (severity === 'info' && seen.has(`${line}:${column}`)) {
          continue;
        }

        const key = `${line}:${column}:${message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        seen.add(`${line}:${column}`);

        diagnostics.push({
          severity,
          ruleId,
          file: file || `${language}_code`,
          line,
          column,
          message,
          source: toolName
        });
      }
    }
  }

  // 2. Parse compiler errors from buildStderr if compilation failed
  if (Array.isArray(buildStderr)) {
    for (const item of buildStderr) {
      const text = stripAnsi(item.text || item).trim();
      if (!text) continue;

      const compMatch = text.match(/^(?:<source>|[^:]+):(\d+):(\d+):\s*(error|warning):\s*(.+)$/i);
      if (compMatch) {
        const line = parseInt(compMatch[1], 10);
        const column = parseInt(compMatch[2], 10);
        const severity = compMatch[3].toLowerCase() === 'error' ? 'error' : 'warning';
        let message = compMatch[4];
        let ruleId = '';

        const ruleMatch = message.match(/\s*\[([^\]]+)\]$/);
        if (ruleMatch) {
          ruleId = ruleMatch[1];
          message = message.substring(0, ruleMatch.index).trim();
        }

        const key = `${line}:${column}:${message}`;
        if (!seen.has(key)) {
          seen.add(key);
          diagnostics.push({
            severity,
            ruleId,
            file: `${language}_compiler`,
            line,
            column,
            message,
            source: 'compiler'
          });
        }
      }
    }
  }

  // Sort by line number, then column, errors first
  diagnostics.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    if (a.severity === 'error' && b.severity !== 'error') return -1;
    if (b.severity === 'error' && a.severity !== 'error') return 1;
    return 0;
  });

  return diagnostics;
}

// Store diagnostics per tab ID
const tabDiagnosticsMap = new Map();

/**
 * Restore diagnostics for a specific tab
 */
export function restoreProblemsForTab(tabId) {
  const diags = tabDiagnosticsMap.get(tabId) || [];
  updateProblemsView(diags, tabId);
}

/**
 * Update the Problems panel and Monaco model markers with parsed diagnostics
 */
export function updateProblemsView(diagnostics = [], tabId = null) {
  if (tabId) {
    tabDiagnosticsMap.set(tabId, diagnostics);
  }

  const listEl = document.getElementById('problems-list');
  const emptyEl = document.getElementById('problems-empty');
  const summaryEl = document.getElementById('problems-summary-text');
  const badgeEl = document.getElementById('problems-badge');

  // 1. Update Monaco Editor squiggly markers
  if (tabId) {
    setDiagnostics(tabId, diagnostics);
  }

  // 2. Update Problems badge
  if (badgeEl) {
    if (diagnostics.length > 0) {
      badgeEl.textContent = diagnostics.length;
      badgeEl.hidden = false;
      const hasErrors = diagnostics.some(d => d.severity === 'error');
      badgeEl.className = `problems-badge ${hasErrors ? 'has-error' : 'has-warning'}`;
    } else {
      badgeEl.hidden = true;
      badgeEl.className = 'problems-badge';
    }
  }

  // 3. Update summary text
  if (summaryEl) {
    if (diagnostics.length === 0) {
      summaryEl.textContent = 'No problems detected';
    } else {
      const errCount = diagnostics.filter(d => d.severity === 'error').length;
      const warnCount = diagnostics.filter(d => d.severity === 'warning').length;
      const infoCount = diagnostics.filter(d => d.severity === 'info').length;
      const parts = [];
      if (errCount > 0) parts.push(`${errCount} Error${errCount > 1 ? 's' : ''}`);
      if (warnCount > 0) parts.push(`${warnCount} Warning${warnCount > 1 ? 's' : ''}`);
      if (infoCount > 0) parts.push(`${infoCount} Note${infoCount > 1 ? 's' : ''}`);
      summaryEl.textContent = parts.join(', ');
    }
  }

  // 4. Render list items
  if (!listEl || !emptyEl) return;

  if (diagnostics.length === 0) {
    emptyEl.hidden = false;
    listEl.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';

  for (const diag of diagnostics) {
    const item = document.createElement('div');
    item.className = `problem-item severity-${diag.severity}`;
    item.title = `Click to navigate to line ${diag.line}, column ${diag.column}`;

    const iconChar = diag.severity === 'error' ? '⨂' : (diag.severity === 'warning' ? '⚠' : 'ℹ');
    const ruleHtml = diag.ruleId ? `<span class="problem-rule">[${escapeHtml(diag.ruleId)}]</span>` : '';

    item.innerHTML = `
      <span class="problem-icon">${iconChar}</span>
      <div class="problem-content">
        <div class="problem-msg-row">
          <span class="problem-msg">${escapeHtml(diag.message)}</span>
          ${ruleHtml}
        </div>
        <div class="problem-meta">
          <span class="problem-loc">Line ${diag.line}, Col ${diag.column}</span>
          <span class="problem-source">${escapeHtml(diag.source)}</span>
        </div>
      </div>
    `;

    // Click to navigate to Monaco line and column
    item.addEventListener('click', () => {
      revealLocation(diag.line, diag.column);
    });

    listEl.appendChild(item);
  }
}

/**
 * Run standalone static analysis on active code without executing the program
 */
export async function runStandaloneAnalysis(tab) {
  if (!tab) return;
  const analyzer = await getAnalyzerForLanguage(tab.language);
  if (!analyzer) {
    updateProblemsView([], tab.id);
    return;
  }

  const { openConsole } = await import('./console.js');
  openConsole();
  switchConsoleTab('problems');

  const summaryEl = document.getElementById('problems-summary-text');
  if (summaryEl) summaryEl.textContent = `Analyzing with ${analyzer.name}...`;

  const { GODBOLT_MAP } = await import('./cloudRunner.js');
  const { getSelectedLibrariesForLanguage } = await import('./libraries.js');
  const config = GODBOLT_MAP[tab.language];
  if (!config) return;

  const code = getEditorValue();
  const libraries = getSelectedLibrariesForLanguage(tab.language);
  const payload = {
    source: code,
    compiler: config.compiler,
    options: {
      userArguments: '',
      compilerOptions: { executorRequest: false },
      filters: { intel: true, demangle: true, labels: true, directives: true, commentOnly: true },
      tools: [
        { id: analyzer.id, args: analyzer.args }
      ]
    },
    lang: config.lang,
    allowStoreCodeDebug: true
  };

  if (libraries && libraries.length > 0) {
    const libsForPayload = libraries.map(libItem => {
      if (typeof libItem === 'object' && libItem !== null) {
        return { id: libItem.id, version: libItem.version };
      }
      const [id, version] = String(libItem).split(':');
      return { id, version: version || 'trunk' };
    });
    payload.options.libraries = libsForPayload;
  }

  // Inject companion workspace files for static analysis
  try {
    const { prepareMultiFilePayload } = await import('./multifileCompiler.js');
    const multi = await prepareMultiFilePayload(code, tab.language, tab.label || 'main');
    payload.source = multi.source;
    if (multi.files && multi.files.length > 0) {
      payload.files = multi.files;
    }
  } catch (_) {}

  try {
    const res = await fetch(`https://godbolt.org/api/compiler/${config.compiler}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      debugLog('info', `Static analysis completed for ${tab.language}`, { data });
      const diagnostics = parseDiagnostics(data.tools, tab.language, data.buildResult?.stderr);
      updateProblemsView(diagnostics, tab.id);
    } else {
      const errText = await res.text();
      debugLog('error', `Static analysis API error: ${errText}`);
    }
  } catch (err) {
    debugLog('error', `Static analysis failed: ${err.message}`);
  }
}

function switchConsoleTab(tabId) {
  const tabBtn = document.getElementById(`tab-${tabId}`);
  if (tabBtn) tabBtn.click();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
