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
  setExecTime
} from './console.js';

import { debugLog } from './logger.js';

// Godbolt Compiler Explorer API
const GODBOLT_BASE = 'https://godbolt.org/api';

// Language to Godbolt compiler mapping
const GODBOLT_MAP = {
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
  if (!str) return '';
  return str
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
async function executeViaGodbolt(code, language, stdin = '') {
  const config = GODBOLT_MAP[language];
  if (!config) {
    appendLine('error', `✖ Language "${language}" is not supported by cloud runner.`);
    appendRunBadge('Unsupported', true);
    setExecTime('—');
    return { hasError: true };
  }

  appendLine('system', `▶ Running via Cloud (${config.name})`);

  let codeToRun = code;

  // In Java on Godbolt, source is compiled as example.java.
  // Replace top-level 'public class <Name>' with 'class <Name>' to avoid class/file mismatch.
  if (language === 'java') {
    codeToRun = codeToRun.replace(/\bpublic\s+class\b/g, 'class');
  }

  const payload = {
    source: codeToRun,
    compiler: config.compiler,
    options: {
      userArguments: '',
      compilerOptions: {
        executorRequest: true
      },
      filters: {
        execute: true
      },
      executeParameters: {
        args: [],
        stdin: stdin
      }
    },
    lang: config.lang,
    allowStoreCodeDebug: true
  };

  debugLog('info', `Starting Godbolt compilation for ${language}`, { payload });

  const startTime = performance.now();

  try {
    const res = await fetch(`${GODBOLT_BASE}/compiler/${config.compiler}/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Compiler API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
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

    // Check exit code
    if (data.code !== undefined && data.code !== 0 && data.code !== null) {
      hasError = true;
      appendLine('warn', `Process exited with code ${data.code}`);
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
export async function executeViaCloud(code, language, customPistonUrl = null, stdin = '') {
  if (!isConsoleOpen()) openConsole();

  appendDivider();
  setExecTime('Running…');

  // If user configured a custom Piston endpoint, use it
  if (customPistonUrl && customPistonUrl.trim()) {
    return executeViaCustomPiston(code, language, customPistonUrl.trim(), stdin);
  }

  // Otherwise default to Godbolt
  return executeViaGodbolt(code, language, stdin);
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
