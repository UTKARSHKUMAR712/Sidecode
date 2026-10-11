#!/usr/bin/env node
/**
 * Sidecode Local Native Bridge
 *
 * Provides a lightweight local runner that bridges Sidecode's browser side-panel
 * directly to your local computer's toolchains (MSYS2 GCC, Clang, Python, Node.js, Rust, Go).
 *
 * Features:
 * - 100% authentic interactive terminal (real-time stdin/stdout with true step-by-step scanf/cin)
 * - Zero npm dependencies (pure built-in Node.js stdlib)
 * - Auto-detects local compilers
 * - Streaming HTTP chunked execution with real-time bidirectional pipe
 *
 * Usage:
 *   node bridge.js
 */

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const PORT = parseInt(process.env.SIDECODE_PORT || '3888', 10);
const HOST = '127.0.0.1';

let activeChild = null;

function checkTool(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

function detectCompilers() {
  return {
    gcc: checkTool('gcc'),
    gpp: checkTool('g++'),
    clang: checkTool('clang'),
    python: checkTool('python') || checkTool('python3'),
    node: true,
    rustc: checkTool('rustc'),
    go: checkTool('go')
  };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function killProcess(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGINT');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 500);
    }
  } catch (_) {
    try { proc.kill('SIGKILL'); } catch (_) {}
  }
}

let hasEverConnected = false;
let lastHeartbeat = Date.now();
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5-minute failsafe idle watchdog AFTER first connection

function touchHeartbeat() {
  hasEverConnected = true;
  lastHeartbeat = Date.now();
}

const watchdog = setInterval(() => {
  if (hasEverConnected) {
    const elapsed = Date.now() - lastHeartbeat;
    if (elapsed > IDLE_TIMEOUT_MS) {
      if (activeChild) killProcess(activeChild);
      process.exit(0);
    }
  }
}, 10000);
watchdog.unref();

const folderPathCache = new Map();

function findWorkspaceOnDisk(folderName) {
  if (!folderName || folderName === 'workspace') return null;
  const lowerTarget = folderName.toLowerCase();

  if (folderPathCache.has(lowerTarget)) {
    const cached = folderPathCache.get(lowerTarget);
    if (fs.existsSync(cached)) return cached;
  }

  const userHome = os.homedir();
  const searchRoots = [
    path.join(userHome, 'OneDrive', 'Desktop'),
    path.join(userHome, 'Desktop'),
    path.join(userHome, 'OneDrive', 'Documents'),
    path.join(userHome, 'Documents'),
    path.join(userHome, 'projects'),
    process.cwd(),
    userHome
  ].filter(p => fs.existsSync(p));

  for (const root of searchRoots) {
    const queue = [{ dir: root, depth: 0 }];
    while (queue.length > 0) {
      const { dir, depth } = queue.shift();
      if (depth > 4) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.toLowerCase() === lowerTarget) {
              const matched = path.join(dir, entry.name);
              folderPathCache.set(lowerTarget, matched);
              return matched;
            }
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'AppData') {
              queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
            }
          }
        }
      } catch (_) {}
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  touchHeartbeat();

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // 1. Health & Tool status (with optional workspace location resolution)
  if (url.pathname === '/status' || url.pathname === '/health') {
    const compilers = detectCompilers();
    const reqFolder = url.searchParams.get('folder');
    let resolvedPath = null;
    if (reqFolder) {
      resolvedPath = findWorkspaceOnDisk(reqFolder);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      bridge: 'sidecode-local-bridge',
      version: '1.0.0',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cwd: resolvedPath || process.cwd(),
      resolvedPath: resolvedPath || null,
      compilers
    }, null, 2));
    return;
  }

  // 2. Heartbeat to keep service alive while extension is open
  if (url.pathname === '/heartbeat' || url.pathname === '/ping') {
    touchHeartbeat();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }

  // 3. Graceful shutdown when extension side panel closes
  if (url.pathname === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Bridge shutting down' }));
    setTimeout(() => {
      if (activeChild) killProcess(activeChild);
      process.exit(0);
    }, 50);
    return;
  }

  // 2. Kill currently running process
  if (url.pathname === '/kill' && req.method === 'POST') {
    if (activeChild) {
      killProcess(activeChild);
      activeChild = null;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, killed: true }));
    return;
  }

  // 3. Send standard input to active process
  if (url.pathname === '/input' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      let text = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.data === 'string') text = parsed.data;
      } catch (_) {}

      if (activeChild && activeChild.stdin && activeChild.stdin.writable) {
        activeChild.stdin.write(text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, written: text.length }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'No active process awaiting stdin' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 4. Execute command or code with streaming chunked output
  if (url.pathname === '/exec' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);
      const command = payload.command;

      if (!command) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing "command" in request payload' }));
        return;
      }

      // 1. Resolve workspace directory (use real PC folder if found, else isolated temp)
      let workspaceDir = null;
      if (payload.folder && payload.folder !== 'workspace') {
        workspaceDir = findWorkspaceOnDisk(payload.folder);
      }
      if (!workspaceDir) {
        const safeFolder = (payload.folder || 'workspace').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        workspaceDir = path.join(os.tmpdir(), 'sidecode_bridge', safeFolder);
      }
      fs.mkdirSync(workspaceDir, { recursive: true });

      // 2. Synchronize all incoming files directly into the workspace directory
      if (Array.isArray(payload.files)) {
        for (const file of payload.files) {
          if (file && file.path && typeof file.content === 'string') {
            const relClean = file.path.replace(/^[\\\/]+/, '');
            const targetFilePath = path.join(workspaceDir, relClean);
            fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
            fs.writeFileSync(targetFilePath, file.content, 'utf8');

            // Also guarantee that the base filename is available at root of workspaceDir
            // so `gcc main.c` works whether the path was `slot/main.c` or `main.c`
            const baseName = path.basename(relClean);
            const rootFilePath = path.join(workspaceDir, baseName);
            if (!fs.existsSync(rootFilePath)) {
              fs.writeFileSync(rootFilePath, file.content, 'utf8');
            }
          }
        }
      }

      let targetCwd = workspaceDir;
      // Only use payload.cwd if no files were sent to sync
      if ((!payload.files || payload.files.length === 0) && payload.cwd && fs.existsSync(payload.cwd)) {
        targetCwd = payload.cwd;
      }

      // If a process is already running, terminate it before starting a new one
      if (activeChild) {
        killProcess(activeChild);
        activeChild = null;
      }

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff'
      });

      const proc = spawn(command, {
        shell: true,
        cwd: targetCwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      activeChild = proc;

      proc.stdout.on('data', (chunk) => {
        try { res.write(chunk); } catch (_) {}
      });

      proc.stderr.on('data', (chunk) => {
        try { res.write(chunk); } catch (_) {}
      });

      proc.on('error', (err) => {
        try {
          res.write(`\r\n\x1b[1;31m[Bridge Process Error: ${err.message}]\x1b[0m\r\n`);
        } catch (_) {}
      });

      proc.on('close', (code) => {
        if (activeChild === proc) activeChild = null;
        try {
          res.end();
        } catch (_) {}
      });

      req.on('close', () => {
        if (activeChild === proc) {
          killProcess(proc);
          activeChild = null;
        }
      });
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
});

server.listen(PORT, HOST, () => {
  const compilers = detectCompilers();
  console.log('\x1b[1;36m=====================================================\x1b[0m');
  console.log('\x1b[1;32m  Sidecode Local Native Bridge v1.0.0\x1b[0m');
  console.log('\x1b[1;36m=====================================================\x1b[0m');
  console.log(`\x1b[32m✔ Active at:\x1b[0m \x1b[1mhttp://${HOST}:${PORT}\x1b[0m`);
  console.log(`\x1b[90mWorking directory:\x1b[0m ${process.cwd()}`);
  console.log('\x1b[33m\nDetected Local Compilers:\x1b[0m');
  console.log(`  • GCC (C):      ${compilers.gcc ? '\x1b[32m✔ Available\x1b[0m' : '\x1b[90m○ Not found\x1b[0m'}`);
  console.log(`  • G++ (C++):    ${compilers.gpp ? '\x1b[32m✔ Available\x1b[0m' : '\x1b[90m○ Not found\x1b[0m'}`);
  console.log(`  • Python:       ${compilers.python ? '\x1b[32m✔ Available\x1b[0m' : '\x1b[90m○ Not found\x1b[0m'}`);
  console.log(`  • Node.js (JS): \x1b[32m✔ Available (${process.version})\x1b[0m`);
  console.log(`  • Rust (rustc): ${compilers.rustc ? '\x1b[32m✔ Available\x1b[0m' : '\x1b[90m○ Not found\x1b[0m'}`);
  console.log(`  • Go:           ${compilers.go ? '\x1b[32m✔ Available\x1b[0m' : '\x1b[90m○ Not found\x1b[0m'}`);
  console.log('\n\x1b[90mSidecode side-panel will now route commands to your PC with full interactive terminal support.\x1b[0m');
  console.log('\x1b[90mPress Ctrl+C to stop the bridge.\x1b[0m\n');
});
