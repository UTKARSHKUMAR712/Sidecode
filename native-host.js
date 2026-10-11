#!/usr/bin/env node
/**
 * native-host.js — Chrome / Brave Native Messaging host for Sidecode
 *
 * Automatically launches and verifies `bridge.js` in the background
 * when the user selects "Local PC Terminal" in the Sidecode dropdown.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sendNativeMessage(msg) {
  const jsonBuf = Buffer.from(JSON.stringify(msg), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(jsonBuf.length, 0);
  process.stdout.write(lenBuf);
  process.stdout.write(jsonBuf);
}

function checkBridgeRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3888/status', { timeout: 600 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function startBridge() {
  const running = await checkBridgeRunning();
  if (!running) {
    const bridgeScript = path.join(__dirname, 'bridge.js');
    const child = spawn(process.execPath, [bridgeScript], {
      detached: true,
      stdio: 'ignore',
      cwd: __dirname,
      windowsHide: true
    });
    child.unref();

    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await checkBridgeRunning()) break;
    }
  }
  return true;
}

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', async (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + msgLen) break;

    const msgData = inputBuffer.subarray(4, 4 + msgLen);
    inputBuffer = inputBuffer.subarray(4 + msgLen);

    try {
      const msg = JSON.parse(msgData.toString('utf8'));
      if (msg.action === 'start' || msg.action === 'ping') {
        await startBridge();
        sendNativeMessage({ ok: true, started: true, port: 3888 });
      } else {
        sendNativeMessage({ ok: true });
      }
    } catch (err) {
      sendNativeMessage({ ok: false, error: err.message });
    }
  }
});
