/**
 * piston.js — Piston API execution runner for Sidecode
 *
 * Sends source code to the public Piston execution API (https://emkc.org/api/v2/piston)
 * which compiles and runs code inside isolated Docker sandboxes.
 * Supports: C, C++, Java, Python, Go, Rust, Kotlin, PHP, Ruby, TypeScript, and 40+ others.
 * No API key required. 100% free and open-source.
 */

import {
  openConsole,
  isConsoleOpen,
  appendLine,
  appendDivider,
  appendRunBadge,
  setExecTime
} from './console.js';

const PISTON_ENDPOINT = 'https://emkc.org/api/v2/piston/execute';

/** Map of Monaco language IDs → Piston language + pinned version */
const PISTON_LANG_MAP = {
  c:          { language: 'c',          version: '10.2.0' },
  cpp:        { language: 'c++',        version: '10.2.0' },
  java:       { language: 'java',       version: '15.0.2' },
  python:     { language: 'python',     version: '3.10.0' },
  go:         { language: 'go',         version: '1.16.2'  },
  rust:       { language: 'rust',       version: '1.50.0' },
  kotlin:     { language: 'kotlin',     version: '1.4.31' },
  ruby:       { language: 'ruby',       version: '3.0.1'  },
  php:        { language: 'php',        version: '8.0.1'  },
  swift:      { language: 'swift',      version: '5.3.3'  },
  typescript: { language: 'typescript', version: '4.2.3'  },
  javascript: { language: 'javascript', version: '16.3.0' },
  shell:      { language: 'bash',       version: '5.1.0'  },
};

/**
 * Returns true when a Monaco language has a Piston runner configured.
 * @param {string} lang - Monaco language ID
 */
export function isPistonSupported(lang) {
  return lang in PISTON_LANG_MAP;
}

/**
 * Execute code via the Piston API and stream output to the console panel.
 * @param {string} code     - Source code to execute
 * @param {string} language - Monaco language ID (e.g. 'python', 'cpp', 'java')
 * @returns {Promise<{hasError: boolean, stdout: string, stderr: string}>}
 */
export async function executeViaPiston(code, language) {
  if (!isConsoleOpen()) openConsole();

  appendDivider();
  setExecTime('Running…');
  appendLine('system', `▶ Running via Piston (${language})`);

  const config = PISTON_LANG_MAP[language];
  if (!config) {
    appendLine('error', `✖ Language "${language}" is not supported by Piston.`);
    appendRunBadge('Unsupported language', true);
    setExecTime('—');
    return { hasError: true, stdout: '', stderr: '' };
  }

  const startTime = performance.now();

  try {
    const response = await fetch(PISTON_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: config.language,
        version:  config.version,
        files:    [{ content: code }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Piston API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const run = data.run || {};
    const compile = data.compile || null;

    const duration = Math.round(performance.now() - startTime);
    const timeStr = duration < 1 ? '<1ms' : `${duration}ms`;
    let hasError = false;

    // ── Compilation output (C, C++, Java, Kotlin, etc.)
    if (compile) {
      if (compile.stderr && compile.stderr.trim()) {
        hasError = true;
        compile.stderr.split('\n').forEach(line => {
          if (line.trim()) appendLine('error', line);
        });
      }
      if (compile.stdout && compile.stdout.trim()) {
        compile.stdout.split('\n').forEach(line => {
          if (line.trim()) appendLine('info', line);
        });
      }
    }

    // ── Runtime stdout
    if (run.stdout && run.stdout.trim()) {
      run.stdout.split('\n').forEach(line => appendLine('log', line));
    }

    // ── Runtime stderr / exceptions
    if (run.stderr && run.stderr.trim()) {
      hasError = true;
      run.stderr.split('\n').forEach(line => {
        if (line.trim()) appendLine('error', line);
      });
    }

    // ── Exit code
    if (run.code !== undefined && run.code !== 0) {
      hasError = true;
      appendLine('warn', `Process exited with code ${run.code}`);
    }

    // ── No output at all
    if (
      !run.stdout?.trim() &&
      !run.stderr?.trim() &&
      !compile?.stderr?.trim()
    ) {
      appendLine('system', '(no output)');
    }

    setExecTime(timeStr);
    appendRunBadge(
      hasError ? `Finished with errors (${timeStr})` : `Finished in ${timeStr}`,
      hasError
    );

    return { hasError, stdout: run.stdout || '', stderr: run.stderr || '' };

  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    const timeStr = `${duration}ms`;

    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      appendLine('error', '✖ Network error — check your internet connection.');
    } else {
      appendLine('error', `✖ ${err.message}`);
    }

    appendRunBadge(`Failed (${timeStr})`, true);
    setExecTime(timeStr);
    return { hasError: true, stdout: '', stderr: err.message };
  }
}
