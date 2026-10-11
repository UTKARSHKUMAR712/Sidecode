/**
 * cloudRunner.js — Cloud Execution Runner for Sidecode
 *
 * Provides online execution for languages that cannot run natively in-browser:
 * C, C++, Java, Python, Go, Rust, and more.
 *
 * Uses Compiler Explorer (Godbolt) API by default:
 * - Free, public, no registration or API key required
 * - Runs in secure isolated nsjail sandboxes
 * - High-speed compiler and executor for C, C++, Python, Java, Rust, Go
 *
 * Also supports custom self-hosted Piston instances if configured by the user.
 */

import {
  openConsole,
  isConsoleOpen,
  appendLine,
  appendDivider,
  appendRunBadge,
  setExecTime,
  appendAssemblyLines
} from './console.js';

import { debugLog } from './logger.js';
import { parseDiagnostics, updateProblemsView } from './analysis.js';

// Godbolt Compiler Explorer API
const GODBOLT_BASE = 'https://godbolt.org/api';

// Language to Godbolt compiler mapping
export const GODBOLT_MAP = {
  c: {
    lang: 'c',
    compiler: 'g141',
    name: 'GCC 14.1'
  },
  cpp: {
    lang: 'c++',
    compiler: 'g141',
    name: 'G++ 14.1'
  },
  python: {
    lang: 'python',
    compiler: 'python312',
    name: 'Python 3.12'
  },
  java: {
    lang: 'java',
    compiler: 'java2100',
    name: 'OpenJDK 21'
  },
  rust: {
    lang: 'rust',
    compiler: 'r1800',
    name: 'Rust 1.80'
  },
  go: {
    lang: 'go',
    compiler: 'gl12212',
    name: 'Go 1.22'
  },
  javascript: {
    lang: 'javascript',
    compiler: 'v8113',
    name: 'V8 11.3'
  }
};

/** Clean ANSI color and cursor codes from compiler diagnostic text */
function stripAnsi(str) {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : (typeof str.text === 'string' ? str.text : String(str));
  return s
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\u001b\[K/g, '')
    .replace(/\r/g, '');
}

/** Check if language is supported by cloud execution */
export function isCloudSupported(lang) {
  return lang in GODBOLT_MAP;
}

/**
 * Execute code via Godbolt Compiler Explorer
 */
async function executeViaGodbolt(code, language, stdin = '', libraries = [], tabId = null, overrideFilename = null) {
  const config = GODBOLT_MAP[language];
  if (!config) {
    appendLine('error', `✖ Language "${language}" is not supported by cloud runner.`);
    appendRunBadge('Unsupported', true);
    setExecTime('—');
    return { hasError: true };
  }

  appendLine('system', `▶ Running via Cloud (${config.name})`);

  let codeToRun = code;
  let companionFiles = [];

  // Multi-file workspace support
  try {
    const { getActiveTab } = await import('./tabs.js');
    const { prepareMultiFilePayload } = await import('./multifileCompiler.js');
    const activeTab = getActiveTab();
    const activeFilename = overrideFilename || activeTab?.filePath || activeTab?.label || (language === 'cpp' ? 'main.cpp' : 'main');
    const multi = await prepareMultiFilePayload(code, language, activeFilename);
    codeToRun = multi.source;
    companionFiles = multi.files || [];
  } catch (err) {
    console.warn('Could not prepare multi-file payload:', err);
  }

  // In Java on Godbolt, source is compiled as example.java.
  // Replace top-level 'public class <Name>' with 'class <Name>' to avoid class/file mismatch.
  if (language === 'java') {
    codeToRun = codeToRun.replace(/\bpublic\s+class\b/g, 'class');
  }

  // In Godbolt V8 (d8 shell), console.log uses native print() which formats arrays as "1,2,3" without brackets,
  // and CommonJS 'module' and 'exports' globals are not natively defined. Prepend a single-line polyfill.
  let execSource = codeToRun;
  if (language === 'javascript' || language === 'js' || language === 'typescript' || language === 'ts') {
    const v8Polyfill = `/* V8 */ try { if (typeof module === 'undefined') { var module = { exports: {} }; var exports = module.exports; } if (typeof console !== 'undefined' && console.log) { const _o = console.log.bind(console), _f = (v, d = 0) => v === null ? 'null' : v === undefined ? 'undefined' : typeof v === 'string' ? (d === 0 ? v : JSON.stringify(v)) : Array.isArray(v) ? ('[ ' + v.map(x => _f(x, d + 1)).join(', ') + ' ]') : (typeof v === 'object' ? (JSON.stringify(v) || String(v)) : String(v)); console.log = (...a) => _o(...a.map(x => (Array.isArray(x) || (typeof x === 'object' && x !== null)) ? _f(x, 0) : x)); } } catch (_) {}; `;
    execSource = v8Polyfill + codeToRun;
  }

  const execPayload = {
    source: execSource,
    compiler: config.compiler,
    options: {
      userArguments: '',
      compilerOptions: { executorRequest: true },
      filters: { execute: true },
      executeParameters: { args: [], stdin: stdin }
    },
    lang: config.lang,
    allowStoreCodeDebug: true
  };

  const asmPayload = {
    source: codeToRun,
    compiler: config.compiler,
    options: {
      userArguments: '',
      compilerOptions: { executorRequest: false },
      filters: {
        intel: true,
        demangle: true,
        labels: true,
        directives: true,
        commentOnly: true
      },
      tools: []
    },
    lang: config.lang,
    allowStoreCodeDebug: true
  };

  // Inject companion workspace files into Godbolt root-level files array
  if (companionFiles.length > 0) {
    execPayload.files = companionFiles;
    asmPayload.files = companionFiles;
  }

  // Note: Static analyzers (clang-tidy) are only invoked when user clicks "Analyze", not on every run.
  // This keeps execution fast and prevents noisy pedantic linter warnings during normal runs.

  // Inject requested third-party libraries (e.g. boost:192 or { id, version })
  if (libraries && libraries.length > 0) {
    const libsForPayload = libraries.map(libItem => {
      if (typeof libItem === 'object' && libItem !== null) {
        return { id: libItem.id, version: libItem.version };
      }
      const [id, version] = String(libItem).split(':');
      return { id, version: version || 'trunk' };
    });
    execPayload.options.libraries = libsForPayload;
    asmPayload.options.libraries = libsForPayload;

    appendLine('system', `Libraries linked: ${libsForPayload.map(l => `${l.id} (${l.version})`).join(', ')}`);
  }

  debugLog('info', `Starting Godbolt compilation for ${language}`, { execPayload });

  const startTime = performance.now();

  try {
    const fetchExec = fetch(`${GODBOLT_BASE}/compiler/${config.compiler}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(execPayload)
    });

    const fetchAsm = fetch(`${GODBOLT_BASE}/compiler/${config.compiler}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(asmPayload)
    });

    const [resExec, resAsm] = await Promise.all([fetchExec, fetchAsm]);

    if (!resExec.ok) {
      const errText = await resExec.text();
      throw new Error(`Compiler API error ${resExec.status}: ${errText}`);
    }

    const data = await resExec.json();
    let asmData = null;
    if (resAsm.ok) {
      asmData = await resAsm.json();
      data.asm = asmData.asm; // Merge assembly back into the data object
      data.tools = asmData.tools; // Merge tools back into the data object
    }
    const duration = Math.round(performance.now() - startTime);
    const timeStr = duration < 1 ? '<1ms' : `${duration}ms`;

    debugLog('info', `Godbolt compilation finished in ${timeStr}`, { data });

    let hasError = false;

    // 1. Compilation errors / warnings (buildResult.stderr)
    const buildStderr = data.buildResult?.stderr || [];
    if (buildStderr.length > 0) {
      for (const item of buildStderr) {
        const text = stripAnsi(item.text || item);
        if (text.trim()) {
          appendLine('error', text);
          hasError = true;
        }
      }
    }

    // 2. Compilation stdout (rare, but possible)
    const buildStdout = data.buildResult?.stdout || [];
    if (buildStdout.length > 0) {
      for (const item of buildStdout) {
        const text = stripAnsi(item.text || item);
        if (text.trim()) appendLine('info', text);
      }
    }

    // 3. Execution stdout (program output)
    const execStdout = data.stdout || [];
    for (const item of execStdout) {
      const text = stripAnsi(item.text || item);
      appendLine('log', text);
    }

    // 4. Execution stderr (runtime errors, exceptions, crashes)
    const execStderr = data.stderr || [];
    for (const item of execStderr) {
      const text = stripAnsi(item.text || item);
      if (text.trim()) {
        appendLine('error', text);
        hasError = true;
      }
    }

    // 4.5 Compiler diagnostics (errors and warnings from compiler buildResult.stderr)
    const diagnostics = parseDiagnostics([], language, data.buildResult?.stderr);
    updateProblemsView(diagnostics, tabId);

    // Check exit code
    if (data.code !== undefined && data.code !== 0 && data.code !== null) {
      hasError = true;
      if (data.code === 143 || data.code === 137) {
        appendLine('warn', `Process timed out / killed (Exit code ${data.code})`);
        appendLine('info', `Tip: For programs with loops reading input (like the Number Guessing Game), the loop ran out of entered inputs. Enter your guesses separated by spaces (e.g. 1 2 3 4 5 6 7 8 9 10) so the loop can test each guess until it succeeds!`);
      } else {
        appendLine('warn', `Process exited with code ${data.code}`);
      }
    }

    // If completely silent with no output
    if (execStdout.length === 0 && execStderr.length === 0 && buildStderr.length === 0) {
      appendLine('system', '(program finished with no output)');
    }

    setExecTime(timeStr);
    appendRunBadge(
      hasError ? `Finished with errors (${timeStr})` : `Finished in ${timeStr}`,
      hasError
    );

    // 5. Assembly output
    const asmArray = data.asm || [];
    if (asmArray.length > 0) {
      appendAssemblyLines(asmArray);
    }

    return { hasError, duration };

  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    const timeStr = `${duration}ms`;

    debugLog('error', `Godbolt compilation failed`, { error: err.message, stack: err.stack });

    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      appendLine('error', '✖ Network error — unable to reach execution server.');
    } else {
      appendLine('error', `✖ ${err.message}`);
    }

    appendRunBadge(`Failed (${timeStr})`, true);
    setExecTime(timeStr);
    return { hasError: true, duration };
  }
}

/**
 * Main entry point for Cloud Execution
 */
export async function executeViaCloud(code, language, customPistonUrl = null, stdin = '', libraries = [], tabId = null, overrideFilename = null) {
  if (!isConsoleOpen()) openConsole();

  setExecTime('Running…');

  // If user configured a custom Piston endpoint, use it
  if (customPistonUrl && customPistonUrl.trim()) {
    return executeViaCustomPiston(code, language, customPistonUrl.trim(), stdin);
  }

  // Otherwise default to Godbolt
  return executeViaGodbolt(code, language, stdin, libraries, tabId, overrideFilename);
}

/**
 * Optional custom Piston execution (for users hosting their own Piston container)
 */
async function executeViaCustomPiston(code, language, endpoint, stdin = '') {
  appendLine('system', `▶ Running via Custom Piston (${endpoint})`);

  const langMap = {
    c: { language: 'c', version: '*' },
    cpp: { language: 'c++', version: '*' },
    java: { language: 'java', version: '*' },
    python: { language: 'python', version: '*' },
    go: { language: 'go', version: '*' },
    rust: { language: 'rust', version: '*' }
  };

  const config = langMap[language] || { language, version: '*' };
  const payload = {
    language: config.language,
    version: config.version,
    files: [{ content: code }],
    stdin: stdin
  };

  debugLog('info', `Starting Custom Piston execution for ${language}`, { endpoint, payload });

  const startTime = performance.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Piston error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const run = data.run || {};
    const compile = data.compile || null;
    const duration = Math.round(performance.now() - startTime);
    const timeStr = `${duration}ms`;

    debugLog('info', `Custom Piston execution finished in ${timeStr}`, { data });

    let hasError = false;

    if (compile && compile.stderr) {
      hasError = true;
      compile.stderr.split('\n').forEach(l => l.trim() && appendLine('error', l));
    }
    if (run.stdout) {
      run.stdout.split('\n').forEach(l => appendLine('log', l));
    }
    if (run.stderr) {
      hasError = true;
      run.stderr.split('\n').forEach(l => l.trim() && appendLine('error', l));
    }

    setExecTime(timeStr);
    appendRunBadge(hasError ? `Finished with errors (${timeStr})` : `Finished in ${timeStr}`, hasError);
    return { hasError, duration };

  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    debugLog('error', `Custom Piston execution failed`, { error: err.message, stack: err.stack });
    appendLine('error', `✖ ${err.message}`);
    appendRunBadge('Failed', true);
    setExecTime(`${duration}ms`);
    return { hasError: true, duration };
  }
}
