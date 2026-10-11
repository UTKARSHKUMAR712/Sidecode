/**
 * terminal.js — Interactive Terminal CLI for Sidecode
 *
 * Provides a clickable, interactive terminal inside the bottom console panel.
 * Users can execute commands like:
 *   node index.js
 *   python main.py
 *   g++ main.cpp
 *   run
 *   ls / dir
 *   cat <file>
 *   clear / cls
 *   pwd
 *   echo <text>
 *   help
 */

import { escapeHtml } from './constants.js';

let terminalHistory = [];
let historyIndex = -1;
let historyDraft = '';

let executionBridge = null;

const $ = (id) => document.getElementById(id);

export function initTerminal(bridge = {}) {
  executionBridge = bridge;

  const cliRow = $('terminal-cli-row');
  const cliInput = $('terminal-cli-input');
  const outputArea = $('console-output');

  if (!cliInput || !outputArea) return;

  // 1. Click anywhere in console output area to focus terminal input
  outputArea.addEventListener('click', (e) => {
    // If text was selected by user, don't hijack focus
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    // Do not interfere if clicked on an interactive link/button
    if (e.target.closest('button') || e.target.closest('a')) return;

    cliInput.focus();
  });

  // 2. Handle keyboard interactions (Enter, History navigation, Tab completion)
  cliInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rawCmd = cliInput.value;
      cliInput.value = '';
      historyIndex = -1;
      historyDraft = '';

      if (rawCmd.trim()) {
        terminalHistory.push(rawCmd.trim());
        if (terminalHistory.length > 100) terminalHistory.shift();
      }

      await executeCommandLine(rawCmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (terminalHistory.length === 0) return;

      if (historyIndex === -1) {
        historyDraft = cliInput.value;
        historyIndex = terminalHistory.length - 1;
      } else if (historyIndex > 0) {
        historyIndex--;
      }

      cliInput.value = terminalHistory[historyIndex] || '';
      // Move cursor to end
      setTimeout(() => { cliInput.selectionStart = cliInput.selectionEnd = cliInput.value.length; }, 0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;

      if (historyIndex < terminalHistory.length - 1) {
        historyIndex++;
        cliInput.value = terminalHistory[historyIndex] || '';
      } else {
        historyIndex = -1;
        cliInput.value = historyDraft;
      }
      setTimeout(() => { cliInput.selectionStart = cliInput.selectionEnd = cliInput.value.length; }, 0);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTabCompletion(cliInput);
    }
  });

  updateTerminalPrompt();
}

/**
 * Update the terminal prompt string with active workspace folder
 */
export function updateTerminalPrompt() {
  const cliPath = $('cli-path');
  if (!cliPath) return;

  if (executionBridge && typeof executionBridge.getWorkspaceName === 'function') {
    const wsName = executionBridge.getWorkspaceName();
    cliPath.textContent = wsName ? `~/${wsName}` : '~';
  } else {
    cliPath.textContent = '~';
  }
}

/**
 * Append an echoed command line to the output stream
 */
function appendCommandLineEcho(cmdText) {
  const output = $('console-output');
  const cliRow = $('terminal-cli-row');
  if (!output) return;

  const welcome = $('console-welcome');
  if (welcome) welcome.remove();

  const line = document.createElement('div');
  line.className = 'con-line terminal-cmd-line';

  const wsName = executionBridge && executionBridge.getWorkspaceName ? executionBridge.getWorkspaceName() : '';
  const pathLabel = wsName ? `~/${wsName}` : '~';

  line.innerHTML = `
    <span class="cli-prompt"><span class="cli-user">sidecode</span><span class="cli-colon">:</span><span class="cli-path">${escapeHtml(pathLabel)}</span><span class="cli-dollar">$</span></span>
    <span class="cmd-text">${escapeHtml(cmdText)}</span>
  `;

  if (cliRow) {
    output.insertBefore(line, cliRow);
  } else {
    output.appendChild(line);
  }

  output.scrollTop = output.scrollHeight;
}

/**
 * Main command line execution dispatcher
 */
async function executeCommandLine(raw) {
  const trimmed = raw.trim();
  appendCommandLineEcho(raw);

  if (!trimmed) return;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const argLine = args.join(' ');

  const { appendLine, clearConsole } = await import('./console.js');

  switch (cmd) {
    case 'help': {
      appendLine('system', '╔════════════════════════════════════════════════════════════════╗');
      appendLine('system', '║                  Sidecode Interactive Terminal                 ║');
      appendLine('system', '╚════════════════════════════════════════════════════════════════╝');
      appendLine('info', '  node <file.js>        Execute JavaScript / TypeScript file in sandbox');
      appendLine('info', '  python <file.py>      Execute Python file via compiler runner');
      appendLine('info', '  g++ <file.cpp>        Compile and execute C++ file');
      appendLine('info', '  gcc <file.c>          Compile and execute C file');
      appendLine('info', '  run [file]            Run specified file or currently active tab');
      appendLine('info', '  ls / dir              List all files & folders in current workspace');
      appendLine('info', '  cat <file>            Print contents of a file');
      appendLine('info', '  pwd                   Print current working directory');
      appendLine('info', '  echo <text>           Print text');
      appendLine('info', '  clear / cls           Clear terminal screen');
      appendLine('system', 'Tip: You can also type JS expressions directly (e.g. 5*10 or console.log("hi"))');
      return;
    }

    case 'clear':
    case 'cls': {
      clearConsole();
      return;
    }

    case 'pwd': {
      const wsName = executionBridge && executionBridge.getWorkspaceName ? executionBridge.getWorkspaceName() : 'workspace';
      appendLine('system', `/${wsName}`);
      return;
    }

    case 'echo': {
      appendLine('log', argLine);
      return;
    }

    case 'ls':
    case 'dir': {
      await handleListDirectory();
      return;
    }

    case 'cat':
    case 'type': {
      if (!args[0]) {
        appendLine('warn', 'Usage: cat <filename>');
        return;
      }
      await handleCatFile(args[0]);
      return;
    }

    case 'node':
    case 'nodejs':
    case 'ts-node': {
      if (!args[0]) {
        appendLine('warn', 'Usage: node <filename.js> (e.g. node main.js)');
        return;
      }
      await handleRunFileByCommand(args[0], 'javascript', ['js', 'mjs', 'cjs', 'ts']);
      return;
    }

    case 'python':
    case 'python3':
    case 'py': {
      if (!args[0]) {
        appendLine('warn', 'Usage: python <filename.py> (e.g. python main.py)');
        return;
      }
      await handleRunFileByCommand(args[0], 'python', ['py']);
      return;
    }

    case 'g++':
    case 'clang++': {
      if (!args[0]) {
        appendLine('warn', 'Usage: g++ <filename.cpp> (e.g. g++ main.cpp)');
        return;
      }
      await handleRunFileByCommand(args[0], 'cpp', ['cpp', 'cc', 'cxx']);
      return;
    }

    case 'gcc':
    case 'clang': {
      if (!args[0]) {
        appendLine('warn', 'Usage: gcc <filename.c> (e.g. gcc main.c)');
        return;
      }
      await handleRunFileByCommand(args[0], 'c', ['c']);
      return;
    }

    case 'rustc':
    case 'cargo': {
      if (!args[0]) {
        appendLine('warn', 'Usage: rustc <filename.rs>');
        return;
      }
      await handleRunFileByCommand(args[0], 'rust', ['rs']);
      return;
    }

    case 'go': {
      const targetFile = args[0] === 'run' ? args[1] : args[0];
      if (!targetFile) {
        appendLine('warn', 'Usage: go run <filename.go>');
        return;
      }
      await handleRunFileByCommand(targetFile, 'go', ['go']);
      return;
    }

    case 'run': {
      if (args[0]) {
        await handleRunFileByCommand(args[0]);
      } else {
        if (executionBridge && typeof executionBridge.runActiveTab === 'function') {
          await executionBridge.runActiveTab();
        } else {
          appendLine('warn', 'No active file to run.');
        }
      }
      return;
    }

    default: {
      // Check if command looks like direct JS code (e.g. console.log, math, expressions)
      if (isLikelyJavaScript(trimmed)) {
        if (executionBridge && typeof executionBridge.executeRawJs === 'function') {
          await executionBridge.executeRawJs(trimmed);
          return;
        }
      }

      appendLine('error', `${cmd}: command not found. Type "help" for a list of commands.`);
      return;
    }
  }
}

function isLikelyJavaScript(code) {
  return code.startsWith('console.') ||
         code.startsWith('alert(') ||
         code.includes('=>') ||
         code.startsWith('let ') ||
         code.startsWith('const ') ||
         code.startsWith('var ') ||
         code.startsWith('function') ||
         /^[\d\s+\-*/%()Math.]+$/.test(code);
}

/**
 * List files in active directory
 */
async function handleListDirectory() {
  const { appendLine } = await import('./console.js');

  if (!executionBridge) {
    appendLine('system', 'No workspace active.');
    return;
  }

  const tree = executionBridge.getWorkspaceTree ? executionBridge.getWorkspaceTree() : null;
  if (!tree || !Array.isArray(tree.children) || tree.children.length === 0) {
    // List open tabs if no tree
    const tabs = executionBridge.getTabs ? executionBridge.getTabs() : [];
    if (tabs.length === 0) {
      appendLine('system', '(empty directory)');
      return;
    }
    const tabList = tabs.map(t => `📄 ${t.label}`).join('   ');
    appendLine('system', tabList);
    return;
  }

  const formatted = tree.children.map(entry => {
    return entry.kind === 'directory' ? `📁 \x1b[36m${entry.name}/\x1b[0m` : `📄 ${entry.name}`;
  }).join('   ');

  appendLine('system', formatted);
}

/**
 * Print contents of a file
 */
async function handleCatFile(filename) {
  const { appendLine } = await import('./console.js');
  const fileData = await resolveFileContent(filename);

  if (!fileData) {
    appendLine('error', `cat: ${filename}: No such file or directory`);
    return;
  }

  const lines = fileData.content.split('\n');
  lines.forEach(l => appendLine('system', l));
}

/**
 * Resolve file content from tabs or workspace
 */
async function resolveFileContent(filename) {
  if (!executionBridge) return null;

  const lowerName = filename.toLowerCase();

  // 1. Check open tabs first
  if (typeof executionBridge.getTabs === 'function') {
    const tabs = executionBridge.getTabs();
    const foundTab = tabs.find(t => {
      const tabLabel = (t.label || '').toLowerCase();
      const tabPath = (t.filePath || '').toLowerCase();
      return tabLabel === lowerName || tabPath === lowerName || tabPath.endsWith(`/${lowerName}`);
    });

    if (foundTab) {
      let code = foundTab.content || '';
      if (typeof executionBridge.getModelContent === 'function') {
        const liveCode = executionBridge.getModelContent(foundTab.id);
        if (liveCode !== null && liveCode !== undefined) code = liveCode;
      }
      return {
        name: foundTab.label,
        path: foundTab.filePath || foundTab.label,
        content: code,
        language: foundTab.language
      };
    }
  }

  // 2. Check workspace tree on physical disk
  if (typeof executionBridge.findWorkspaceFile === 'function') {
    const diskNode = await executionBridge.findWorkspaceFile(filename);
    if (diskNode && diskNode.handle) {
      const text = await executionBridge.readFileFromDisk(diskNode.handle);
      return {
        name: diskNode.name,
        path: diskNode.path,
        content: text,
        language: null
      };
    }
  }

  return null;
}

/**
 * Execute a file by CLI command (e.g. node main.js, python main.py)
 */
async function handleRunFileByCommand(filename, forcedLanguage = null, candidateExtensions = []) {
  const { appendLine, appendRunBadge } = await import('./console.js');

  let fileData = await resolveFileContent(filename);

  // Fallback: try candidate extensions if not found
  if (!fileData && candidateExtensions.length > 0) {
    for (const ext of candidateExtensions) {
      fileData = await resolveFileContent(`${filename}.${ext}`);
      if (fileData) break;
    }
  }

  if (!fileData) {
    const cmdName = forcedLanguage === 'python' ? 'python' : (forcedLanguage === 'cpp' ? 'g++' : 'node');
    appendLine('error', `${cmdName}: cannot open '${filename}': No such file in workspace`);
    appendRunBadge('Failed', true);
    return;
  }

  const lang = forcedLanguage || fileData.language || 'plaintext';
  appendLine('system', `▶ Executing ${fileData.name} (${lang})...`);

  if (executionBridge && typeof executionBridge.executeCode === 'function') {
    await executionBridge.executeCode(fileData.content, lang, fileData.name);
  } else {
    appendLine('warn', 'Execution bridge not available.');
  }
}

/**
 * Handle Tab auto-completion for filenames
 */
function handleTabCompletion(inputEl) {
  const val = inputEl.value;
  const parts = val.split(' ');
  const lastToken = parts[parts.length - 1];
  if (!lastToken) return;

  const lowerPrefix = lastToken.toLowerCase();
  const availableFiles = getAvailableFilenames();

  const matches = availableFiles.filter(f => f.toLowerCase().startsWith(lowerPrefix));
  if (matches.length === 1) {
    parts[parts.length - 1] = matches[0];
    inputEl.value = parts.join(' ') + ' ';
  }
}

function getAvailableFilenames() {
  const names = new Set();

  if (executionBridge && typeof executionBridge.getTabs === 'function') {
    executionBridge.getTabs().forEach(t => {
      if (t.label) names.add(t.label);
    });
  }

  if (executionBridge && typeof executionBridge.getWorkspaceTree === 'function') {
    const tree = executionBridge.getWorkspaceTree();
    function walk(node) {
      if (!node) return;
      if (node.kind === 'file') names.add(node.name);
      if (Array.isArray(node.children)) node.children.forEach(walk);
    }
    walk(tree);
  }

  return Array.from(names);
}
