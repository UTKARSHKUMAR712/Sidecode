/**
 * terminal.js — Interactive Terminal CLI for Sidecode
 *
 * Provides a clickable, interactive terminal inside the bottom console panel.
 * Supports full directory navigation and filesystem manipulation:
 *   cd <dir>              Change working directory (supports .., ~, /)
 *   mkdir <name>          Create folder in current directory
 *   touch <name>          Create file in current directory
 *   rm [-r] <name>        Delete file or directory
 *   rmdir <name>          Delete directory
 *   mv <src> <dest>       Rename/move file or directory
 *   ls / dir              List files & directories in current working directory
 *   pwd                   Print full working directory path
 *   cat / type <file>     Print file contents
 *   node <file.js>        Execute JS/TS in sandbox (resolves in CWD first)
 *   python <file.py>      Execute Python via cloud runner
 *   g++ <file.cpp>        Compile & execute C++ file
 *   gcc <file.c>          Compile & execute C file
 *   rustc <file.rs>       Compile & execute Rust file
 *   go run <file.go>      Compile & execute Go file
 *   run [file]            Run file or active tab
 *   echo <text>           Print text
 *   clear / cls           Clear console output
 *   help                  Show available commands
 */

import { escapeHtml } from './constants.js';

let terminalHistory = [];
let historyIndex = -1;
let historyDraft = '';

let executionBridge = null;
let terminalCwd = ''; // Relative path from workspace root, e.g. '', 'DSA(JS)/Arry'

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
 * Reset terminal working directory to root
 */
export function resetTerminalCwd() {
  terminalCwd = '';
  updateTerminalPrompt();
}

/**
 * Get current terminal working directory
 */
export function getTerminalCwd() {
  return terminalCwd;
}

/**
 * Update the terminal prompt string with active workspace folder and CWD
 */
export function updateTerminalPrompt() {
  const cliPath = $('cli-path');
  if (!cliPath) return;

  if (executionBridge && typeof executionBridge.getWorkspaceName === 'function') {
    const wsName = executionBridge.getWorkspaceName();
    if (!wsName) {
      cliPath.textContent = '~';
    } else {
      cliPath.textContent = terminalCwd ? `~/${wsName}/${terminalCwd}` : `~/${wsName}`;
    }
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
  let pathLabel = '~';
  if (wsName) {
    pathLabel = terminalCwd ? `~/${wsName}/${terminalCwd}` : `~/${wsName}`;
  }

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
 * Parse command line args respecting quotes
 */
function parseCommandLineArgs(str) {
  const tokens = [];
  let current = '';
  let inQuote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * Resolve target relative or absolute path against terminalCwd
 */
function resolveTargetPath(target) {
  if (!target || target === '~' || target === '/' || target === '~/' || target === './') {
    return '';
  }

  let cleaned = target.trim();
  if (cleaned.startsWith('~/')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('~')) {
    cleaned = cleaned.slice(1);
  }

  const isFromRoot = cleaned.startsWith('/');
  const baseSegments = isFromRoot ? [] : (terminalCwd ? terminalCwd.split('/').filter(Boolean) : []);
  const targetSegments = cleaned.split('/').filter(Boolean);

  const finalSegments = [...baseSegments];
  for (const seg of targetSegments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (finalSegments.length > 0) finalSegments.pop();
    } else {
      finalSegments.push(seg);
    }
  }

  return finalSegments.join('/');
}

/**
 * Find directory node in tree by relative path from root
 */
function findDirectoryNode(relPath) {
  if (!executionBridge) return null;
  const tree = executionBridge.getWorkspaceTree ? executionBridge.getWorkspaceTree() : null;
  if (!tree) return null;
  if (!relPath || relPath === '.' || relPath === '/') return tree;

  const parts = relPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let curr = tree;
  for (const part of parts) {
    if (!curr || !Array.isArray(curr.children)) return null;
    const next = curr.children.find(c => c.kind === 'directory' && c.name.toLowerCase() === part.toLowerCase());
    if (!next) return null;
    curr = next;
  }
  return curr;
}

/**
 * Main command line execution dispatcher
 */
async function executeCommandLine(raw) {
  const trimmed = raw.trim();
  appendCommandLineEcho(raw);

  if (!trimmed) return;

  const tokens = parseCommandLineArgs(trimmed);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const argLine = args.join(' ');

  const { appendLine, clearConsole } = await import('./console.js');

  switch (cmd) {
    case 'help': {
      appendLine('system', '╔════════════════════════════════════════════════════════════════╗');
      appendLine('system', '║                  Sidecode Interactive Terminal                 ║');
      appendLine('system', '╚════════════════════════════════════════════════════════════════╝');
      appendLine('info', '  cd <path>             Change directory (cd .., cd ~, cd folder)');
      appendLine('info', '  mkdir <folder>        Create a new folder in current directory');
      appendLine('info', '  touch <file>          Create a new file in current directory');
      appendLine('info', '  rm [-r] <name>        Delete a file or folder');
      appendLine('info', '  rmdir <folder>        Delete an empty or existing folder');
      appendLine('info', '  mv <src> <dest>       Rename or move a file or folder');
      appendLine('info', '  ls / dir              List files & folders in current directory');
      appendLine('info', '  pwd                   Print current working directory path');
      appendLine('info', '  cat <file>            Print file contents');
      appendLine('info', '  node <file.js>        Run JS/TS in sandbox (searches in CWD first)');
      appendLine('info', '  python <file.py>      Run Python file via cloud runner');
      appendLine('info', '  g++ <file.cpp>        Compile & run C++ file');
      appendLine('info', '  gcc <file.c>          Compile & run C file');
      appendLine('info', '  run [file]            Run specified file or currently active tab');
      appendLine('info', '  clear / cls           Clear terminal screen');
      appendLine('info', '  echo <text>           Print text');
      appendLine('system', 'Tip: Type JS expressions directly (e.g. 5*10 or [1,2,3].filter(x => x>1))');
      return;
    }

    case 'cd': {
      await handleCd(args[0]);
      return;
    }

    case 'mkdir': {
      await handleMkdir(args[0]);
      return;
    }

    case 'touch': {
      await handleTouch(args[0]);
      return;
    }

    case 'rm': {
      await handleRm(args);
      return;
    }

    case 'rmdir': {
      await handleRmdir(args[0]);
      return;
    }

    case 'mv': {
      await handleMv(args[0], args[1]);
      return;
    }

    case 'clear':
    case 'cls': {
      clearConsole();
      return;
    }

    case 'pwd': {
      const wsName = executionBridge && executionBridge.getWorkspaceName ? executionBridge.getWorkspaceName() : 'workspace';
      const fullPath = terminalCwd ? `/${wsName}/${terminalCwd}` : `/${wsName}`;
      appendLine('system', fullPath);
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
         /^[\d\s+\-*/%()Math.\[\]{}'"]+$/.test(code);
}

/**
 * Handle cd <path>
 */
async function handleCd(targetPath) {
  const { appendLine } = await import('./console.js');

  if (!executionBridge || !executionBridge.getWorkspaceTree()) {
    appendLine('error', 'cd: no workspace open. Open a folder first.');
    return;
  }

  if (!targetPath || targetPath === '~' || targetPath === '/') {
    terminalCwd = '';
    updateTerminalPrompt();
    return;
  }

  const resolved = resolveTargetPath(targetPath);
  if (resolved === '') {
    terminalCwd = '';
    updateTerminalPrompt();
    return;
  }

  const targetNode = findDirectoryNode(resolved);
  if (!targetNode) {
    // Check if it was a file
    const fileNode = executionBridge.findWorkspaceFile ? executionBridge.findWorkspaceFile(resolved) : null;
    if (fileNode && fileNode.kind === 'file') {
      appendLine('error', `cd: not a directory: ${targetPath}`);
    } else {
      appendLine('error', `cd: no such file or directory: ${targetPath}`);
    }
    return;
  }

  terminalCwd = resolved;
  updateTerminalPrompt();
}

/**
 * Handle mkdir <folder>
 */
async function handleMkdir(dirname) {
  const { appendLine } = await import('./console.js');

  if (!dirname) {
    appendLine('warn', 'Usage: mkdir <directory_name>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    appendLine('error', 'mkdir: no workspace open. Open a folder first.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    if (executionBridge.createFolder) {
      await executionBridge.createFolder(parentHandle, dirname);
      appendLine('info', `Created directory "${dirname}"`);
    } else {
      appendLine('error', 'mkdir: filesystem operation not supported in this environment.');
    }
  } catch (err) {
    appendLine('error', `mkdir: ${err.message}`);
  }
}

/**
 * Handle touch <file>
 */
async function handleTouch(filename) {
  const { appendLine } = await import('./console.js');

  if (!filename) {
    appendLine('warn', 'Usage: touch <filename>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    if (executionBridge.createTab) {
      executionBridge.createTab(filename);
      appendLine('info', `Created tab "${filename}"`);
    } else {
      appendLine('error', 'touch: no workspace open.');
    }
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    if (executionBridge.createFile) {
      await executionBridge.createFile(parentHandle, filename, '');
      appendLine('info', `Created file "${filename}"`);
    } else {
      appendLine('error', 'touch: filesystem operation not supported.');
    }
  } catch (err) {
    appendLine('error', `touch: ${err.message}`);
  }
}

/**
 * Handle rm [-r] <target>
 */
async function handleRm(args) {
  const { appendLine } = await import('./console.js');

  if (args.length === 0) {
    appendLine('warn', 'Usage: rm [-r] <filename|directory>');
    return;
  }

  let isRecursive = false;
  let targetName = null;

  for (const arg of args) {
    if (arg === '-r' || arg === '-rf' || arg === '-f' || arg === '-R') {
      isRecursive = true;
    } else if (!targetName) {
      targetName = arg;
    }
  }

  if (!targetName) {
    appendLine('warn', 'Usage: rm [-r] <filename|directory>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    appendLine('error', 'rm: no workspace open.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    const children = currDirNode && Array.isArray(currDirNode.children) ? currDirNode.children : [];
    const child = children.find(c => c.name.toLowerCase() === targetName.toLowerCase());

    const isDir = child ? child.kind === 'directory' : isRecursive;

    if (isDir && !isRecursive) {
      appendLine('error', `rm: cannot remove '${targetName}': Is a directory (use rm -r or rmdir)`);
      return;
    }

    if (executionBridge.deleteEntry) {
      await executionBridge.deleteEntry(parentHandle, child ? child.name : targetName, isDir);
      appendLine('info', `Removed ${isDir ? 'directory' : 'file'} "${targetName}"`);
    } else {
      appendLine('error', 'rm: filesystem deletion not supported.');
    }
  } catch (err) {
    appendLine('error', `rm: ${err.message}`);
  }
}

/**
 * Handle rmdir <folder>
 */
async function handleRmdir(dirname) {
  const { appendLine } = await import('./console.js');

  if (!dirname) {
    appendLine('warn', 'Usage: rmdir <directory>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    appendLine('error', 'rmdir: no workspace open.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    if (executionBridge.deleteEntry) {
      await executionBridge.deleteEntry(parentHandle, dirname, true);
      appendLine('info', `Removed directory "${dirname}"`);
    } else {
      appendLine('error', 'rmdir: filesystem deletion not supported.');
    }
  } catch (err) {
    appendLine('error', `rmdir: ${err.message}`);
  }
}

/**
 * Handle mv <source> <target>
 */
async function handleMv(src, dest) {
  const { appendLine } = await import('./console.js');

  if (!src || !dest) {
    appendLine('warn', 'Usage: mv <source> <target>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    appendLine('error', 'mv: no workspace open.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    const children = currDirNode && Array.isArray(currDirNode.children) ? currDirNode.children : [];
    const child = children.find(c => c.name.toLowerCase() === src.toLowerCase());

    if (!child || !child.handle) {
      appendLine('error', `mv: cannot stat '${src}': No such file or directory`);
      return;
    }

    if (executionBridge.renameEntry) {
      await executionBridge.renameEntry(parentHandle, child.handle, dest);
      appendLine('info', `Renamed '${src}' -> '${dest}'`);
    } else {
      appendLine('error', 'mv: rename not supported.');
    }
  } catch (err) {
    appendLine('error', `mv: ${err.message}`);
  }
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

  const currDirNode = findDirectoryNode(terminalCwd);
  if (!currDirNode || !Array.isArray(currDirNode.children) || currDirNode.children.length === 0) {
    if (!currDirNode && !executionBridge.getWorkspaceTree()) {
      const tabs = executionBridge.getTabs ? executionBridge.getTabs() : [];
      if (tabs.length === 0) {
        appendLine('system', '(empty directory)');
        return;
      }
      const tabList = tabs.map(t => `📄 ${t.label}`).join('   ');
      appendLine('system', tabList);
      return;
    }
    appendLine('system', '(empty directory)');
    return;
  }

  const items = currDirNode.children.map(entry => {
    return entry.kind === 'directory' ? `📁 ${entry.name}/` : `📄 ${entry.name}`;
  });

  appendLine('system', items.join('   '));
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

  appendLine('system', fileData.content);
}

/**
 * Resolve file content from tabs or workspace (resolving relative to terminalCwd first)
 */
async function resolveFileContent(filename) {
  if (!executionBridge) return null;

  const targetPath = terminalCwd ? `${terminalCwd}/${filename}` : filename;
  const lowerTargetPath = targetPath.toLowerCase();
  const lowerName = filename.toLowerCase();

  // 1. Check open tabs first
  if (typeof executionBridge.getTabs === 'function') {
    const tabs = executionBridge.getTabs();
    const foundTab = tabs.find(t => {
      const tabPath = (t.filePath || '').toLowerCase();
      const tabLabel = (t.label || '').toLowerCase();
      return tabPath === lowerTargetPath || tabPath.endsWith(`/${lowerTargetPath}`) ||
             (terminalCwd ? tabPath === lowerTargetPath : tabLabel === lowerName);
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

  // 2. Check workspace tree on physical disk (CWD-relative first, then root)
  if (typeof executionBridge.findWorkspaceFile === 'function') {
    let diskNode = await executionBridge.findWorkspaceFile(targetPath);
    if (!diskNode && targetPath !== filename) {
      diskNode = await executionBridge.findWorkspaceFile(filename);
    }

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
    inputEl.value = parts.join(' ') + (matches[0].endsWith('/') ? '' : ' ');
  }
}

function getAvailableFilenames() {
  const names = new Set();

  const currDir = findDirectoryNode(terminalCwd);
  if (currDir && Array.isArray(currDir.children)) {
    currDir.children.forEach(c => {
      names.add(c.kind === 'directory' ? `${c.name}/` : c.name);
    });
  }

  if (executionBridge && typeof executionBridge.getTabs === 'function') {
    executionBridge.getTabs().forEach(t => {
      if (t.label) names.add(t.label);
    });
  }

  return Array.from(names);
}
