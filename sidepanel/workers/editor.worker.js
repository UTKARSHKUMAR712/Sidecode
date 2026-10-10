const ttPolicy = globalThis.trustedTypes?.createPolicy('defaultWorkerFactory', { createScriptURL: value => value });
globalThis.workerttPolicy = ttPolicy;
const target = new URL('../vs/assets/editor.worker-_vAIFJDs.js', self.location.href).href;
importScripts(ttPolicy?.createScriptURL(target) ?? target);
globalThis.postMessage({ type: 'vscode-worker-ready' });
