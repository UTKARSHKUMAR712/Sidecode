/**
 * terminal.js — World-Class Interactive Terminal for Sidecode powered by xterm.js
 *
 * Provides a real VT100/ANSI terminal integrated directly into the side panel:
 * - Powered by xterm.js + xterm-addon-fit (the exact engine behind VS Code)
 * - 24-bit TrueColor and full ANSI color rendering for compiler outputs
 * - Interactive shell line editor: typing, Left/Right cursor, Home, End, Backspace
 * - Command history navigation (Up / Down arrows)
 * - Tab auto-completion for files and directories
 * - Ctrl+C (SIGINT cancel/abort), Ctrl+L (clear screen), Ctrl+U (delete line)
 * - Directory navigation & filesystem commands:
 *     cd <dir>, ls/dir, pwd, mkdir <dir>, touch <file>, rm [-r] <target>,
 *     rmdir <dir>, mv <src> <dest>, cat/type <file>, echo <text>, clear/cls, help
 * - Compiler execution commands:
 *     node <file.js>, bun <file.js>, python <file.py>, g++ <file.cpp>, gcc <file.c>,
 *     rustc <file.rs>, cargo run, go run <file.go>, javac <file.java>, java <file.java>, run [file]
 */

import {
  checkBridgeStatus,
  ensureBridgeRunning,
  isBridgeConnected,
  isBridgeExecuting,
  sendBridgeInput,
  killBridgeProcess,
  executeViaBridge
} from './bridgeClient.js';

let term = null;
let fitAddon = null;
let executionBridge = null;

let activeTerminalMode = 'browser'; // 'browser' (default) | 'local'

export function setTerminalMode(mode) {
  if (mode === 'local' || mode === 'browser') {
    activeTerminalMode = mode;
  }
}

export function getTerminalMode() {
  return activeTerminalMode;
}

let terminalCwd = ''; // Relative path from workspace root, e.g. '', 'src', 'dsa/arrays'
let terminalHistory = [];
let historyIndex = -1;
let currentInput = '';
let cursorPos = 0;
let isBusy = false;
let currentFontSize = 12;

const THEME = {
  background: '#181818',
  foreground: '#cccccc',
  cursor: '#aeafad',
  cursorAccent: '#181818',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff'
};

/**
 * Initialize xterm.js inside #console-output container
 */
export function initTerminal(bridge = {}) {
  executionBridge = bridge;

  if (term) return; // already initialized

  const container = document.getElementById('console-output');
  if (!container) return;

  if (typeof window.Terminal !== 'function') {
    console.warn('xterm.js is not loaded on window. Retrying in 100ms...');
    setTimeout(() => initTerminal(bridge), 100);
    return;
  }

  // Clear any existing legacy DOM elements
  container.innerHTML = '';

  term = new window.Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: currentFontSize,
    lineHeight: 1.25,
    convertEol: true,
    scrollback: 5000,
    allowProposedApi: true,
    theme: THEME
  });

  if (window.FitAddon && typeof window.FitAddon.FitAddon === 'function') {
    fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
  }

  term.open(container);

  // Resize listener
  window.addEventListener('resize', () => fitTerminal());

  setTimeout(() => {
    fitTerminal();
    writePrompt();
  }, 30);

  // Focus terminal when user clicks inside the container
  container.addEventListener('click', () => {
    if (term) term.focus();
  });

  // Handle keyboard input stream from xterm
  term.onData((data) => {
    handleTerminalInput(data);
  });
}

/**
 * Fit terminal dimensions to parent container
 */
export function fitTerminal() {
  if (fitAddon && term) {
    try {
      fitAddon.fit();
    } catch (_) {}
  }
}

/**
 * Focus terminal cursor
 */
export function focusTerminal() {
  if (term) {
    try {
      term.focus();
    } catch (_) {}
  }
}

export function getTerm() {
  return term;
}

/**
 * Update terminal font size from IDE Settings
 */
export function setTerminalFontSize(size) {
  const num = parseInt(size, 10);
  if (!isNaN(num) && num >= 9 && num <= 32) {
    currentFontSize = num;
    if (term) {
      term.options.fontSize = num;
      fitTerminal();
    }
  }
}



let localResolvedPath = '';

export function setLocalResolvedPath(p) {
  localResolvedPath = p || '';
}

export function getLocalResolvedPath() {
  return localResolvedPath;
}

/**
 * Build authentic prompt string with ANSI colors
 */
export function getPromptString() {
  const wsName = executionBridge?.getWorkspaceName ? executionBridge.getWorkspaceName() : '';
  let pathLabel = '~';

  if (activeTerminalMode === 'local' && localResolvedPath) {
    let display = localResolvedPath.replace(/\\/g, '/');
    if (terminalCwd) {
      display = `${display}/${terminalCwd}`.replace(/\/+/g, '/');
    }
    return `\x1b[1;32msidecode\x1b[0m:\x1b[1;34m${display}\x1b[0m$ `;
  }

  if (wsName) {
    pathLabel = terminalCwd ? `~/${wsName}/${terminalCwd}` : `~/${wsName}`;
  }
  return `\x1b[1;32msidecode\x1b[0m:\x1b[1;34m${pathLabel}\x1b[0m$ `;
}

/**
 * Render prompt to terminal and reset current input line
 */
export function writePrompt() {
  if (!term) return;
  currentInput = '';
  cursorPos = 0;
  term.write(getPromptString());
}

/**
 * Set full line content and reposition cursor
 */
function setLine(newLine) {
  if (!term) return;
  // Move cursor back to beginning of input line
  if (cursorPos > 0) {
    term.write(`\x1b[${cursorPos}D`);
  }
  // Clear from cursor to end of line
  term.write('\x1b[K');
  currentInput = newLine;
  cursorPos = currentInput.length;
  term.write(currentInput);
}

let activeStdinResolver = null;

/**
 * Ask the user for stdin directly in the xterm terminal
 */
export async function promptStdinFromTerminal(promptText = '? Enter input for program:') {
  if (!term) return '';
  term.write(`\r\n\x1b[1;33m⌨  This program expects input (scanf / cin / input).\x1b[0m\r\n`);
  term.write(`\x1b[90mTip: If your program asks for input multiple times in a loop, separate values with spaces (e.g. 1 2 3 4 5)\x1b[0m\r\n`);
  term.write(`\x1b[1;36m${promptText} \x1b[0m`);
  currentInput = '';
  cursorPos = 0;

  return new Promise((resolve) => {
    activeStdinResolver = resolve;
  });
}

/**
 * Main keystroke handler for interactive line editing
 */
function handleTerminalInput(data) {
  if (!term) return;

  // 1. If program is actively prompting for standard input (stdin) in terminal
  if (activeStdinResolver) {
    if (data === '\r') {
      term.write('\r\n');
      const val = currentInput;
      currentInput = '';
      cursorPos = 0;
      const resolver = activeStdinResolver;
      activeStdinResolver = null;
      resolver(val);
      return;
    }
    if (data === '\x03') {
      term.write('^C\r\n');
      currentInput = '';
      cursorPos = 0;
      const resolver = activeStdinResolver;
      activeStdinResolver = null;
      resolver('');
      return;
    }
    if (data === '\x7f' || data === '\b') {
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
        term.write('\b');
        term.write(currentInput.slice(cursorPos) + ' ');
        term.write(`\x1b[${currentInput.length - cursorPos + 1}D`);
      }
      return;
    }
    if (data >= ' ' || data === '\t') {
      currentInput += data;
      cursorPos += data.length;
      term.write(data);
      return;
    }
    return;
  }

  // If a local native bridge process is executing, stream stdin keystrokes directly!
  if (isBridgeExecuting()) {
    if (data === '\x03') {
      term.writeln('^C');
      killBridgeProcess();
      isBusy = false;
      writePrompt();
      return;
    }
    if (data === '\r') {
      term.write('\r\n');
      sendBridgeInput('\n');
      return;
    }
    if (data === '\x7f' || data === '\b') {
      term.write('\b \b');
      sendBridgeInput('\b');
      return;
    }
    term.write(data);
    sendBridgeInput(data);
    return;
  }

  if (isBusy) {
    // If a standard cloud process is running and user presses Ctrl+C, send abort
    if (data === '\x03') {
      term.writeln('^C');
      term.writeln('\x1b[33m[Execution interrupted]\x1b[0m');
      isBusy = false;
      writePrompt();
    }
    return;
  }

  switch (data) {
    case '\r': { // Enter
      term.write('\r\n');
      const cmd = currentInput;
      currentInput = '';
      cursorPos = 0;

      if (cmd.trim()) {
        terminalHistory.push(cmd.trim());
        if (terminalHistory.length > 200) terminalHistory.shift();
        historyIndex = terminalHistory.length;

        isBusy = true;
        executeCommandLine(cmd.trim())
          .catch((err) => {
            writeLineToTerminal('error', err.message || String(err));
          })
          .finally(() => {
            isBusy = false;
            writePrompt();
          });
      } else {
        writePrompt();
      }
      break;
    }

    case '\x7f': // Backspace (DEL)
    case '\b': { // Backspace (BS)
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
        term.write('\b');
        term.write(currentInput.slice(cursorPos) + ' ');
        term.write(`\x1b[${currentInput.length - cursorPos + 1}D`);
      }
      break;
    }

    case '\x1b[A': { // Up arrow (previous history)
      if (terminalHistory.length > 0) {
        if (historyIndex > 0) {
          historyIndex--;
          setLine(terminalHistory[historyIndex] || '');
        } else if (historyIndex === -1 || historyIndex === terminalHistory.length) {
          historyIndex = terminalHistory.length - 1;
          setLine(terminalHistory[historyIndex] || '');
        }
      }
      break;
    }

    case '\x1b[B': { // Down arrow (next history)
      if (historyIndex < terminalHistory.length - 1) {
        historyIndex++;
        setLine(terminalHistory[historyIndex] || '');
      } else {
        historyIndex = terminalHistory.length;
        setLine('');
      }
      break;
    }

    case '\x1b[D': { // Left arrow
      if (cursorPos > 0) {
        cursorPos--;
        term.write('\x1b[D');
      }
      break;
    }

    case '\x1b[C': { // Right arrow
      if (cursorPos < currentInput.length) {
        cursorPos++;
        term.write('\x1b[C');
      }
      break;
    }

    case '\x01': { // Ctrl+A / Home
      if (cursorPos > 0) {
        term.write(`\x1b[${cursorPos}D`);
        cursorPos = 0;
      }
      break;
    }

    case '\x05': { // Ctrl+E / End
      if (cursorPos < currentInput.length) {
        term.write(`\x1b[${currentInput.length - cursorPos}C`);
        cursorPos = currentInput.length;
      }
      break;
    }

    case '\x03': { // Ctrl+C
      term.write('^C\r\n');
      currentInput = '';
      cursorPos = 0;
      writePrompt();
      break;
    }

    case '\x0c': { // Ctrl+L (Clear screen)
      term.clear();
      term.write(getPromptString() + currentInput);
      if (currentInput.length - cursorPos > 0) {
        term.write(`\x1b[${currentInput.length - cursorPos}D`);
      }
      break;
    }

    case '\x15': { // Ctrl+U (Clear whole line before cursor)
      if (cursorPos > 0) {
        currentInput = currentInput.slice(cursorPos);
        term.write(`\x1b[${cursorPos}D\x1b[K${currentInput}`);
        if (currentInput.length > 0) {
          term.write(`\x1b[${currentInput.length}D`);
        }
        cursorPos = 0;
      }
      break;
    }

    case '\t': { // Tab auto-completion
      handleTabCompletion();
      break;
    }

    default: {
      // Normal typed characters (ASCII printable or UTF-8)
      if (data >= ' ' || data === '\t') {
        if (cursorPos === currentInput.length) {
          currentInput += data;
          cursorPos += data.length;
          term.write(data);
        } else {
          currentInput = currentInput.slice(0, cursorPos) + data + currentInput.slice(cursorPos);
          cursorPos += data.length;
          term.write(data + currentInput.slice(cursorPos));
          term.write(`\x1b[${currentInput.length - cursorPos}D`);
        }
      }
      break;
    }
  }
}

/**
 * Handle Tab auto-completion for filenames and commands
 */
function handleTabCompletion() {
  if (!term) return;

  const parts = currentInput.split(' ');
  const lastToken = parts[parts.length - 1];
  if (!lastToken) return;

  const availableFiles = getAvailableFilenames();
  const lowerPrefix = lastToken.toLowerCase();
  const matches = availableFiles.filter(f => f.toLowerCase().startsWith(lowerPrefix));

  if (matches.length === 1) {
    const completion = matches[0];
    const added = completion.slice(lastToken.length) + (completion.endsWith('/') ? '' : ' ');
    currentInput += added;
    cursorPos += added.length;
    term.write(added);
  } else if (matches.length > 1) {
    term.writeln('');
    const styled = matches.map(m => m.endsWith('/') ? `\x1b[1;34m${m}\x1b[0m` : `\x1b[32m${m}\x1b[0m`);
    term.writeln('  ' + styled.join('   '));
    term.write(getPromptString() + currentInput);
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

/**
 * Write a formatted line to xterm
 */
export function writeLineToTerminal(level, text) {
  if (!term) return;

  const str = String(text ?? '');
  const lines = str.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === lines.length - 1 && line === '' && lines.length > 1) {
      continue;
    }

    // Preserve existing ANSI colors from compilers (GCC, Clang, Rustc, etc.)
    const hasAnsi = /\x1b\[[0-9;]*m/.test(line);
    if (hasAnsi) {
      term.writeln(line);
      continue;
    }

    switch (level) {
      case 'error':
        term.writeln(`\x1b[31m✖ ${line}\x1b[0m`);
        break;
      case 'warn':
        term.writeln(`\x1b[33m⚠ ${line}\x1b[0m`);
        break;
      case 'info':
        term.writeln(`\x1b[36mℹ ${line}\x1b[0m`);
        break;
      case 'system':
        term.writeln(`\x1b[90m${line}\x1b[0m`);
        break;
      case 'result':
        term.writeln(`\x1b[32m${line}\x1b[0m`);
        break;
      case 'log':
      default:
        term.writeln(line);
        break;
    }
  }
}

/**
 * Write an execution badge to xterm
 */
export function writeBadgeToTerminal(label, hasError = false) {
  if (!term) return;
  if (hasError) {
    term.writeln(`\x1b[1;31m✖ ${label}\x1b[0m`);
  } else {
    term.writeln(`\x1b[1;32m✔ ${label}\x1b[0m`);
  }
}

/**
 * Clear the terminal screen and reprint welcome banner + prompt
 */
export function clearTerminal() {
  if (!term) return;
  term.clear();
  writePrompt();
}

/**
 * Echo a command line to xterm when run via Run button or shortcut
 */
export function appendCommandLineEcho(cmdText) {
  if (!term) return;
  term.writeln(`\r\n${getPromptString()}\x1b[1;37m${cmdText}\x1b[0m`);
}

/**
 * Reset terminal working directory to root
 */
export function resetTerminalCwd() {
  terminalCwd = '';
  if (term) writePrompt();
}

/**
 * Get current terminal working directory
 */
export function getTerminalCwd() {
  return terminalCwd;
}

/**
 * Update prompt when workspace folder changes
 */
export function updateTerminalPrompt() {
  // Prompt is updated on next writePrompt()
}

/**
 * Generate a realistic command line for a tab
 */
export function getRunCommandForTab(tab) {
  if (!tab) return 'run';
  let fileTarget = tab.filePath || tab.label || 'script';
  if (terminalCwd && tab.filePath) {
    const cwdPrefix = terminalCwd.endsWith('/') ? terminalCwd : `${terminalCwd}/`;
    if (tab.filePath.startsWith(cwdPrefix)) {
      fileTarget = tab.filePath.slice(cwdPrefix.length);
    }
  }
  switch (tab.language) {
    case 'javascript':
    case 'js':
      return `node ${fileTarget}`;
    case 'typescript':
    case 'ts':
      return `ts-node ${fileTarget}`;
    case 'python':
    case 'py':
      return `python ${fileTarget}`;
    case 'cpp':
      return `g++ ${fileTarget}`;
    case 'c':
      return `gcc ${fileTarget}`;
    case 'rust':
      return `rustc ${fileTarget}`;
    case 'go':
      return `go run ${fileTarget}`;
    case 'java':
      return `java ${fileTarget}`;
    default:
      return `run ${fileTarget}`;
  }
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
 * Find directory node in workspace tree by relative path from root
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
  if (!trimmed) return;

  const tokens = parseCommandLineArgs(trimmed);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const argLine = args.join(' ');

  switch (cmd) {
    case 'help': {
      writeLineToTerminal('system', '╔════════════════════════════════════════════════════════════════╗');
      writeLineToTerminal('system', '║                  Sidecode Interactive Terminal                 ║');
      writeLineToTerminal('system', '╚════════════════════════════════════════════════════════════════╝');
      writeLineToTerminal('info', '  cd <path>             Change directory (cd .., cd ~, cd folder)');
      writeLineToTerminal('info', '  mkdir <folder>        Create a new folder in current directory');
      writeLineToTerminal('info', '  touch <file>          Create a new file in current directory');
      writeLineToTerminal('info', '  rm [-r] <name>        Delete a file or folder');
      writeLineToTerminal('info', '  rmdir <folder>        Delete a directory');
      writeLineToTerminal('info', '  mv <src> <dest>       Rename or move a file or folder');
      writeLineToTerminal('info', '  ls / dir              List files & folders in current directory');
      writeLineToTerminal('info', '  pwd                   Print current working directory path');
      writeLineToTerminal('info', '  cat <file>            Print file contents');
      writeLineToTerminal('info', '  node <file.js>        Run JS/TS in sandbox (resolves relative modules)');
      writeLineToTerminal('info', '  python <file.py>      Run Python file via cloud compiler');
      writeLineToTerminal('info', '  g++ <file.cpp>        Compile & run C++ file (GCC 14.1 / Clang)');
      writeLineToTerminal('info', '  gcc <file.c>          Compile & run C file (GCC 14.1)');
      writeLineToTerminal('info', '  rustc <file.rs>       Compile & run Rust file (Rust 1.80)');
      writeLineToTerminal('info', '  go run <file.go>      Compile & run Go file (Go 1.22)');
      writeLineToTerminal('info', '  java <file.java>      Compile & run Java file (OpenJDK 21)');
      writeLineToTerminal('info', '  run [file]            Run specified file or currently active tab');
      writeLineToTerminal('info', '  bridge                Check Local Native Bridge status (real PC terminal)');
      writeLineToTerminal('info', '  clear / cls           Clear terminal screen');
      writeLineToTerminal('info', '  echo <text>           Print text');
      writeLineToTerminal('system', 'Tip: Type JS expressions directly (e.g. 5*10 or [1,2,3].filter(x => x>1))');
      return;
    }

    case 'bridge': {
      const bStatus = await checkBridgeStatus();
      if (bStatus.ok) {
        writeLineToTerminal('log', '\x1b[1;32m✔ Local Native Bridge is ACTIVE\x1b[0m (http://127.0.0.1:3888)');
        writeLineToTerminal('log', `  Working directory: ${bStatus.cwd || 'Current workspace'}`);
        const comps = Object.entries(bStatus.compilers || {})
          .map(([k, v]) => v ? `\x1b[32m${k}\x1b[0m` : `\x1b[90m${k}\x1b[0m`)
          .join(', ');
        writeLineToTerminal('log', `  Compilers available: ${comps}`);
        writeLineToTerminal('info', '  Programs run directly on your PC with real live interactive terminal (step-by-step scanf / cin).');
      } else {
        writeLineToTerminal('warn', '○ Local Native Bridge is NOT running.');
        writeLineToTerminal('log', '  To enable real interactive terminal execution (live step-by-step scanf/cin):');
        writeLineToTerminal('system', '  1. Open a terminal in the Sidecode folder');
        writeLineToTerminal('system', '  2. Run: node bridge.js');
        writeLineToTerminal('log', '  Sidecode automatically connects when bridge is started!');
      }
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
      if (term) term.clear();
      return;
    }

    case 'pwd': {
      const wsName = executionBridge && executionBridge.getWorkspaceName ? executionBridge.getWorkspaceName() : 'workspace';
      const fullPath = terminalCwd ? `/${wsName}/${terminalCwd}` : `/${wsName}`;
      writeLineToTerminal('system', fullPath);
      return;
    }

    case 'echo': {
      writeLineToTerminal('log', argLine);
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
        writeLineToTerminal('warn', 'Usage: cat <filename>');
        return;
      }
      await handleCatFile(args[0]);
      return;
    }

    case 'node':
    case 'nodejs':
    case 'bun':
    case 'ts-node': {
      if (!args[0]) {
        writeLineToTerminal('warn', 'Usage: node <filename.js> (e.g. node main.js)');
        return;
      }
      await handleRunFileByCommand(args[0], 'javascript', ['js', 'mjs', 'cjs', 'ts']);
      return;
    }

    case 'python':
    case 'python3':
    case 'py': {
      if (!args[0]) {
        writeLineToTerminal('warn', 'Usage: python <filename.py> (e.g. python main.py)');
        return;
      }
      await handleRunFileByCommand(args[0], 'python', ['py']);
      return;
    }

    case 'g++':
    case 'clang++': {
      if (!args[0]) {
        writeLineToTerminal('warn', 'Usage: g++ <filename.cpp> (e.g. g++ main.cpp)');
        return;
      }
      await handleRunFileByCommand(args[0], 'cpp', ['cpp', 'cc', 'cxx']);
      return;
    }

    case 'gcc':
    case 'clang': {
      if (!args[0]) {
        writeLineToTerminal('warn', 'Usage: gcc <filename.c> (e.g. gcc main.c)');
        return;
      }
      await handleRunFileByCommand(args[0], 'c', ['c']);
      return;
    }

    case 'rustc':
    case 'cargo': {
      if (!args[0]) {
        writeLineToTerminal('warn', 'Usage: rustc <filename.rs>');
        return;
      }
      await handleRunFileByCommand(args[0], 'rust', ['rs']);
      return;
    }

    case 'go': {
      const targetFile = args[0] === 'run' ? args[1] : args[0];
      if (!targetFile) {
        writeLineToTerminal('warn', 'Usage: go run <filename.go>');
        return;
      }
      await handleRunFileByCommand(targetFile, 'go', ['go']);
      return;
    }

    case 'javac':
    case 'java': {
      if (!args[0]) {
        writeLineToTerminal('warn', 'Usage: java <Main.java>');
        return;
      }
      await handleRunFileByCommand(args[0], 'java', ['java']);
      return;
    }

    case 'run': {
      if (args[0]) {
        await handleRunFileByCommand(args[0]);
      } else {
        if (executionBridge && typeof executionBridge.runActiveTab === 'function') {
          await executionBridge.runActiveTab();
        } else {
          writeLineToTerminal('warn', 'No active file to run.');
        }
      }
      return;
    }

    default: {
      if (isLikelyJavaScript(trimmed)) {
        if (executionBridge && typeof executionBridge.executeRawJs === 'function') {
          await executionBridge.executeRawJs(trimmed);
          return;
        }
      }

      writeLineToTerminal('error', `${cmd}: command not found. Type "help" for a list of commands.`);
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
  if (!executionBridge || !executionBridge.getWorkspaceTree()) {
    writeLineToTerminal('error', 'cd: no workspace open. Open a folder first.');
    return;
  }

  if (!targetPath || targetPath === '~' || targetPath === '/') {
    terminalCwd = '';
    return;
  }

  const resolved = resolveTargetPath(targetPath);
  if (resolved === '') {
    terminalCwd = '';
    return;
  }

  const targetNode = findDirectoryNode(resolved);
  if (!targetNode) {
    const fileNode = executionBridge.findWorkspaceFile ? executionBridge.findWorkspaceFile(resolved) : null;
    if (fileNode && fileNode.kind === 'file') {
      writeLineToTerminal('error', `cd: not a directory: ${targetPath}`);
    } else {
      writeLineToTerminal('error', `cd: no such file or directory: ${targetPath}`);
    }
    return;
  }

  terminalCwd = resolved;
}

/**
 * Handle mkdir <folder>
 */
async function handleMkdir(dirname) {
  if (!dirname) {
    writeLineToTerminal('warn', 'Usage: mkdir <directory_name>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    writeLineToTerminal('error', 'mkdir: no workspace open. Open a folder first.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    if (executionBridge.createFolder) {
      await executionBridge.createFolder(parentHandle, dirname);
      writeLineToTerminal('info', `Created directory "${dirname}"`);
    } else {
      writeLineToTerminal('error', 'mkdir: filesystem operation not supported in this environment.');
    }
  } catch (err) {
    writeLineToTerminal('error', `mkdir: ${err.message}`);
  }
}

/**
 * Handle touch <file>
 */
async function handleTouch(filename) {
  if (!filename) {
    writeLineToTerminal('warn', 'Usage: touch <filename>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    if (executionBridge.createTab) {
      executionBridge.createTab(filename);
      writeLineToTerminal('info', `Created tab "${filename}"`);
    } else {
      writeLineToTerminal('error', 'touch: no workspace open.');
    }
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    if (executionBridge.createFile) {
      await executionBridge.createFile(parentHandle, filename, '');
      writeLineToTerminal('info', `Created file "${filename}"`);
    } else {
      writeLineToTerminal('error', 'touch: filesystem operation not supported.');
    }
  } catch (err) {
    writeLineToTerminal('error', `touch: ${err.message}`);
  }
}

/**
 * Handle rm [-r] <target>
 */
async function handleRm(args) {
  if (args.length === 0) {
    writeLineToTerminal('warn', 'Usage: rm [-r] <filename|directory>');
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
    writeLineToTerminal('warn', 'Usage: rm [-r] <filename|directory>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    writeLineToTerminal('error', 'rm: no workspace open.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    const children = currDirNode && Array.isArray(currDirNode.children) ? currDirNode.children : [];
    const child = children.find(c => c.name.toLowerCase() === targetName.toLowerCase());

    const isDir = child ? child.kind === 'directory' : isRecursive;

    if (isDir && !isRecursive) {
      writeLineToTerminal('error', `rm: cannot remove '${targetName}': Is a directory (use rm -r or rmdir)`);
      return;
    }

    if (executionBridge.deleteEntry) {
      await executionBridge.deleteEntry(parentHandle, child ? child.name : targetName, isDir);
      writeLineToTerminal('info', `Removed ${isDir ? 'directory' : 'file'} "${targetName}"`);
    } else {
      writeLineToTerminal('error', 'rm: filesystem deletion not supported.');
    }
  } catch (err) {
    writeLineToTerminal('error', `rm: ${err.message}`);
  }
}

/**
 * Handle rmdir <folder>
 */
async function handleRmdir(dirname) {
  if (!dirname) {
    writeLineToTerminal('warn', 'Usage: rmdir <directory>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    writeLineToTerminal('error', 'rmdir: no workspace open.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    if (executionBridge.deleteEntry) {
      await executionBridge.deleteEntry(parentHandle, dirname, true);
      writeLineToTerminal('info', `Removed directory "${dirname}"`);
    } else {
      writeLineToTerminal('error', 'rmdir: filesystem deletion not supported.');
    }
  } catch (err) {
    writeLineToTerminal('error', `rmdir: ${err.message}`);
  }
}

/**
 * Handle mv <source> <target>
 */
async function handleMv(src, dest) {
  if (!src || !dest) {
    writeLineToTerminal('warn', 'Usage: mv <source> <target>');
    return;
  }

  if (!executionBridge || !executionBridge.getWorkspaceRootHandle()) {
    writeLineToTerminal('error', 'mv: no workspace open.');
    return;
  }

  try {
    const currDirNode = findDirectoryNode(terminalCwd);
    const parentHandle = currDirNode && currDirNode.handle ? currDirNode.handle : executionBridge.getWorkspaceRootHandle();

    const children = currDirNode && Array.isArray(currDirNode.children) ? currDirNode.children : [];
    const child = children.find(c => c.name.toLowerCase() === src.toLowerCase());

    if (!child || !child.handle) {
      writeLineToTerminal('error', `mv: cannot stat '${src}': No such file or directory`);
      return;
    }

    if (executionBridge.renameEntry) {
      await executionBridge.renameEntry(parentHandle, child.handle, dest);
      writeLineToTerminal('info', `Renamed '${src}' -> '${dest}'`);
    } else {
      writeLineToTerminal('error', 'mv: rename not supported.');
    }
  } catch (err) {
    writeLineToTerminal('error', `mv: ${err.message}`);
  }
}

/**
 * List files in active directory with ANSI colors
 */
async function handleListDirectory() {
  if (!executionBridge) {
    writeLineToTerminal('system', 'No workspace active.');
    return;
  }

  const currDirNode = findDirectoryNode(terminalCwd);
  if (!currDirNode || !Array.isArray(currDirNode.children) || currDirNode.children.length === 0) {
    if (!currDirNode && !executionBridge.getWorkspaceTree()) {
      const tabs = executionBridge.getTabs ? executionBridge.getTabs() : [];
      if (tabs.length === 0) {
        writeLineToTerminal('system', '(empty directory)');
        return;
      }
      const tabList = tabs.map(t => `\x1b[32m📄 ${t.label}\x1b[0m`).join('   ');
      writeLineToTerminal('log', '  ' + tabList);
      return;
    }
    writeLineToTerminal('system', '(empty directory)');
    return;
  }

  const items = currDirNode.children.map(entry => {
    return entry.kind === 'directory' ? `\x1b[1;34m📁 ${entry.name}/\x1b[0m` : `\x1b[37m📄 ${entry.name}\x1b[0m`;
  });

  writeLineToTerminal('log', '  ' + items.join('   '));
}

/**
 * Print contents of a file
 */
async function handleCatFile(filename) {
  const fileData = await resolveFileContent(filename);

  if (!fileData) {
    writeLineToTerminal('error', `cat: ${filename}: No such file or directory`);
    return;
  }

  writeLineToTerminal('log', fileData.content);
}

/**
 * Resolve file content from tabs or workspace (resolving relative to terminalCwd first)
 */
async function resolveFileContent(filename) {
  if (!executionBridge) return null;

  const targetPath = terminalCwd ? `${terminalCwd}/${filename}` : filename;
  const lowerTargetPath = targetPath.toLowerCase().replace(/^\.?\/+/, '');
  const lowerName = filename.toLowerCase().replace(/^\.?\/+/, '');

  // 1. Check open tabs first
  if (typeof executionBridge.getTabs === 'function') {
    const tabs = executionBridge.getTabs();
    const foundTab = tabs.find(t => {
      const tabPath = (t.filePath || '').toLowerCase().replace(/^\.?\/+/, '');
      const tabLabel = (t.label || '').toLowerCase();
      return tabPath === lowerTargetPath ||
             tabPath === lowerName ||
             tabPath.endsWith(`/${lowerTargetPath}`) ||
             tabPath.endsWith(`/${lowerName}`) ||
             (!tabPath && tabLabel === lowerName);
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
 * Execute a file by CLI command (e.g. node main.js, python main.py, g++ main.cpp)
 */
async function handleRunFileByCommand(filename, forcedLanguage = null, candidateExtensions = []) {
  let fileData = await resolveFileContent(filename);

  if (!fileData && candidateExtensions.length > 0) {
    for (const ext of candidateExtensions) {
      fileData = await resolveFileContent(`${filename}.${ext}`);
      if (fileData) break;
    }
  }

  if (!fileData) {
    const cmdName = forcedLanguage === 'python' ? 'python' : (forcedLanguage === 'cpp' ? 'g++' : (forcedLanguage === 'rust' ? 'rustc' : (forcedLanguage === 'go' ? 'go' : 'node')));
    writeLineToTerminal('error', `${cmdName}: cannot open '${filename}': No such file in workspace`);
    writeBadgeToTerminal('Failed', true);
    return;
  }

  const lang = forcedLanguage || fileData.language || 'plaintext';

  // 1. If user explicitly selected "Local PC Terminal", execute via Local Native Bridge
  if (activeTerminalMode === 'local') {
    const folderName = executionBridge?.getWorkspaceName ? executionBridge.getWorkspaceName() : 'workspace';
    const bridgeStatus = await ensureBridgeRunning(folderName);
    if (!bridgeStatus.ok) {
      writeLineToTerminal('warn', '⚡ Local PC Bridge is not running on your computer.');
      writeLineToTerminal('log', '  To start the bridge, run in your Sidecode folder:');
      writeLineToTerminal('system', '    node bridge.js   (or double-click start-bridge.cmd)');
      writeLineToTerminal('log', '  Or run \x1b[1;36minstall-bridge.cmd\x1b[0m once for 100% auto-start in Chrome/Brave!');
      writeLineToTerminal('log', '  Or switch the dropdown to "🌐 Browser Terminal" for instant cloud execution.');
      return;
    }
    if (bridgeStatus.resolvedPath) {
      setLocalResolvedPath(bridgeStatus.resolvedPath);
    }

    const isWin = bridgeStatus.data?.platform === 'win32';
    const exeName = isWin ? 'a.exe' : './a.out';
    const targetFile = fileData.name; // Target file name inside the synced workspace folder
    let localCmd = '';

    if (lang === 'c') {
      localCmd = `gcc "${targetFile}" -o ${isWin ? 'a.exe' : 'a.out'} && ${exeName}`;
    } else if (lang === 'cpp') {
      localCmd = `g++ "${targetFile}" -o ${isWin ? 'a.exe' : 'a.out'} && ${exeName}`;
    } else if (lang === 'python') {
      localCmd = `python "${targetFile}"`;
    } else if (lang === 'javascript' || lang === 'js') {
      localCmd = `node "${targetFile}"`;
    } else if (lang === 'rust') {
      localCmd = `rustc "${targetFile}" && ${exeName}`;
    } else if (lang === 'go') {
      localCmd = `go run "${targetFile}"`;
    } else if (lang === 'java') {
      localCmd = `java "${targetFile}"`;
    }

    if (localCmd) {
      writeLineToTerminal('system', `▶ Running via Local Native Bridge (${fileData.name})...`);

      // Gather files to sync into bridge workspace directory
      const filesToSync = [{ path: fileData.name, content: fileData.content }];
      if (fileData.path && fileData.path !== fileData.name) {
        filesToSync.push({ path: fileData.path, content: fileData.content });
      }
      if (executionBridge && typeof executionBridge.getTabs === 'function') {
        for (const t of executionBridge.getTabs()) {
          if (t.filePath && t.filePath !== fileData.path && t.filePath !== fileData.name) {
            let text = t.content || '';
            if (typeof executionBridge.getModelContent === 'function') {
              const live = executionBridge.getModelContent(t.id);
              if (live !== null && live !== undefined) text = live;
            }
            filesToSync.push({ path: t.filePath, content: text });
          }
        }
      }

      const folderName = executionBridge?.getWorkspaceName ? executionBridge.getWorkspaceName() : 'workspace';

      try {
        await executeViaBridge(localCmd, {
          folder: folderName,
          files: filesToSync,
          onData: (chunk) => {
            if (term) term.write(chunk);
          }
        });
        return;
      } catch (err) {
        writeLineToTerminal('warn', `Local bridge error: ${err.message}. Falling back to Cloud...`);
      }
    }
  }

  // 2. Default: In-Browser Sandbox or Cloud Runner (Browser Terminal)
  writeLineToTerminal('system', `▶ Executing ${fileData.name} (${lang})...`);

  if (executionBridge && typeof executionBridge.executeCode === 'function') {
    await executionBridge.executeCode(fileData.content, lang, fileData.path || fileData.name);
  } else {
    writeLineToTerminal('warn', 'Execution bridge not available.');
  }
}
