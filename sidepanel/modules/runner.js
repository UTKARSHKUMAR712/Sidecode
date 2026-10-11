/**
 * runner.js — Sandboxed execution runner for Sidecode
 *
 * Runs JavaScript and TypeScript safely inside an isolated sandbox.html iframe
 * without violating Chrome Extension MV3 Content Security Policy.
 */

import { openConsole, isConsoleOpen, appendLine, appendDivider, appendRunBadge, setExecTime } from './console.js';

let sandboxIframe = null;
let currentRunId = 0;
let runTimeoutTimer = null;
let isSandboxReady = false;

export function initRunner() {
  if (sandboxIframe) return;

  sandboxIframe = document.createElement('iframe');
  sandboxIframe.id = 'sidecode-sandbox-frame';
  sandboxIframe.style.cssText = 'display:none;position:absolute;width:0;height:0;border:0;';
  sandboxIframe.src = 'sandbox.html';

  window.addEventListener('message', (e) => {
    if (e.source !== sandboxIframe?.contentWindow) return;
    if (e.data && e.data.__sidecode && e.data.type === 'sandbox-ready') {
      isSandboxReady = true;
    }
  });

  document.body.appendChild(sandboxIframe);
}

/**
 * Execute code inside the sandbox
 * @param {string} rawCode - Source code to execute
 * @param {string} language - 'javascript' or 'typescript'
 * @param {any} monacoModel - Current Monaco text model (optional, for TS emit)
 */
export async function executeCode(rawCode, language = 'javascript', monacoModel = null) {
  if (!isConsoleOpen()) {
    openConsole();
  }

  setExecTime('Running...');

  let codeToRun = rawCode;

  // If TypeScript, transpile to JavaScript using Monaco's TypeScript language service worker
  if (language === 'typescript' && window.monaco?.languages?.typescript && monacoModel) {
    try {
      const getWorker = await window.monaco.languages.typescript.getTypeScriptWorker();
      const client = await getWorker(monacoModel.uri);
      const emitResult = await client.getEmitOutput(monacoModel.uri.toString());
      if (emitResult.outputFiles && emitResult.outputFiles.length > 0) {
        codeToRun = emitResult.outputFiles[0].text;
      }
    } catch (transpileErr) {
      appendLine('warn', 'TypeScript compilation note: ' + (transpileErr.message || transpileErr));
    }
  }

  initRunner();

  const runId = ++currentRunId;
  const startTime = performance.now();
  let hasError = false;

  if (runTimeoutTimer) {
    clearTimeout(runTimeoutTimer);
    runTimeoutTimer = null;
  }

  return new Promise((resolve) => {
    function onMessage(e) {
      if (e.source !== sandboxIframe?.contentWindow) return;
      const msg = e.data;
      if (!msg || !msg.__sidecode || msg.runId !== runId) return;

      if (msg.type === 'output') {
        const level = msg.level || 'log';
        if (level === 'error') hasError = true;
        appendLine(level, msg.text);
      } else if (msg.type === 'clear') {
        // Handled by sandbox
      } else if (msg.type === 'done') {
        cleanup();
        const duration = Math.round(performance.now() - startTime);
        const timeStr = duration < 1 ? '<1ms' : `${duration}ms`;
        setExecTime(timeStr);

        const errorOccurred = hasError || msg.hasError;
        appendRunBadge(
          errorOccurred ? `Finished with errors (${timeStr})` : `Finished in ${timeStr}`,
          errorOccurred
        );
        resolve({ hasError: errorOccurred, duration });
      }
    }

    function cleanup() {
      if (runTimeoutTimer) {
        clearTimeout(runTimeoutTimer);
        runTimeoutTimer = null;
      }
      window.removeEventListener('message', onMessage);
    }

    window.addEventListener('message', onMessage);

    // 10s Safety Timeout for infinite loops
    runTimeoutTimer = setTimeout(() => {
      cleanup();
      appendLine('warn', '⏱ Execution timed out after 10s');
      appendRunBadge('Timed out', true);
      setExecTime('Timed out');

      // Recreate sandbox to terminate running code
      if (sandboxIframe) {
        sandboxIframe.remove();
        sandboxIframe = null;
        isSandboxReady = false;
        initRunner();
      }

      resolve({ hasError: true, timedOut: true });
    }, 10000);

    // Gather companion workspace files for require() resolution
    import('./workspace.js').then(async ({ collectAllWorkspaceFiles, isWorkspaceOpen }) => {
      let filesMap = {};
      try {
        if (isWorkspaceOpen()) {
          const allFiles = await collectAllWorkspaceFiles();
          for (const item of allFiles) {
            filesMap[item.filename] = item.contents;
          }
        }
      } catch (_) {}

      function post() {
        sandboxIframe.contentWindow.postMessage({
          action: 'execute',
          code: codeToRun,
          runId,
          files: filesMap
        }, '*');
      }

      if (isSandboxReady || sandboxIframe.contentWindow) {
        post();
      } else {
        sandboxIframe.addEventListener('load', post, { once: true });
      }
    }).catch(() => {
      sandboxIframe.contentWindow.postMessage({ action: 'execute', code: codeToRun, runId }, '*');
    });
  });
}
