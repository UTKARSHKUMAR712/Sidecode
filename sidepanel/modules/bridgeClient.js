/**
 * bridgeClient.js — Client connector for Sidecode Local Native Bridge
 *
 * Connects the browser side panel directly to the user's local PC runner (http://127.0.0.1:3888).
 * Enables 100% authentic interactive terminal execution with real-time bidirectional stdin/stdout.
 */

const BRIDGE_URL = 'http://127.0.0.1:3888';

let lastStatus = null;
let isExecuting = false;
let abortController = null;

/**
 * Check if the local native bridge is running on the user's PC
 * @returns {Promise<{ ok: boolean, compilers?: object, cwd?: string }>}
 */
export async function checkBridgeStatus(folder = '') {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1200);
    const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
    const res = await fetch(`${BRIDGE_URL}/status${qs}`, {
      method: 'GET',
      signal: ctrl.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastStatus = data;
    return { ok: true, compilers: data.compilers, cwd: data.cwd, resolvedPath: data.resolvedPath, data };
  } catch (_) {
    lastStatus = null;
    return { ok: false };
  }
}

/**
 * Ensure the local native bridge is running.
 * First checks if already responding on HTTP port 3888.
 * If not, attempts to auto-launch via Chrome Native Messaging if configured.
 * @param {string} [folder] - Active workspace folder name to resolve
 * @returns {Promise<{ ok: boolean, source?: string, compilers?: object, resolvedPath?: string }>}
 */
export async function ensureBridgeRunning(folder = '') {
  const current = await checkBridgeStatus(folder);
  if (current.ok) {
    return { ok: true, source: 'active', ...current };
  }

  // Try auto-starting via Chrome Native Messaging host (if registered)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage) {
    try {
      const nativePromise = new Promise((resolve) => {
        chrome.runtime.sendNativeMessage('com.sidecode.bridge', { action: 'start' }, (res) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(res);
          }
        });
      });

      const nativeTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
      const res = await Promise.race([nativePromise, nativeTimeout]);

      if (res && res.ok) {
        // Poll for HTTP server to become ready
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((r) => setTimeout(r, 250));
          const check = await checkBridgeStatus(folder);
          if (check.ok) {
            return { ok: true, source: 'native_messaging', ...check };
          }
        }
      }
    } catch (_) {}
  }

  return { ok: false };
}

let heartbeatTimer = null;

export function startBridgeHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    try {
      await fetch(`${BRIDGE_URL}/heartbeat`, { method: 'GET' });
    } catch (_) {}
  }, 8000);
}

export function stopBridgeHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function sendBridgeShutdown() {
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${BRIDGE_URL}/shutdown`);
    } else {
      fetch(`${BRIDGE_URL}/shutdown`, { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch (_) {}
}

export function isBridgeConnected() {
  return !!lastStatus && lastStatus.ok;
}

export function isBridgeExecuting() {
  return isExecuting;
}

/**
 * Send standard input (keystroke or string) to currently running process
 */
export async function sendBridgeInput(text) {
  if (!isExecuting) return false;
  try {
    const res = await fetch(`${BRIDGE_URL}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: text })
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to send input to bridge:', err);
    return false;
  }
}

/**
 * Terminate running bridge process
 */
export async function killBridgeProcess() {
  if (abortController) {
    try { abortController.abort(); } catch (_) {}
    abortController = null;
  }
  isExecuting = false;
  try {
    await fetch(`${BRIDGE_URL}/kill`, { method: 'POST' });
  } catch (_) {}
}

/**
 * Run command via streaming chunked HTTP connection
 * @param {string} command
 * @param {object} opts
 * @param {string} [opts.cwd]
 * @param {function} opts.onData - Callback receiving stream chunks (ANSI strings)
 * @returns {Promise<number>} exit code
 */
export async function executeViaBridge(command, { cwd = '', folder = 'workspace', files = [], onData = () => {} } = {}) {
  const status = await checkBridgeStatus();
  if (!status.ok) {
    throw new Error('Local bridge is not running. Start it with: node bridge.js');
  }

  isExecuting = true;
  abortController = new AbortController();

  try {
    const res = await fetch(`${BRIDGE_URL}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd, folder, files }),
      signal: abortController.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Bridge returned HTTP ${res.status}: ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const text = decoder.decode(value, { stream: true });
        onData(text);
      }
    }

    return 0;
  } catch (err) {
    if (err.name === 'AbortError') {
      onData('\r\n\x1b[33m[Execution aborted by user]\x1b[0m\r\n');
      return 130;
    }
    throw err;
  } finally {
    isExecuting = false;
    abortController = null;
  }
}
