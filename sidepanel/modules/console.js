/**
 * console.js — Terminal & Console Panel Manager for Sidecode
 */

import { escapeHtml } from './constants.js';

let isOpen = false;
let panelHeight = 200;
let onLayoutCallback = null;
let saveHeightCallback = null;

const PREFIXES = {
  log: '›',
  info: 'ℹ',
  warn: '⚠',
  error: '✖',
  system: '',
  result: '←'
};

const $ = (id) => document.getElementById(id);

export function initConsole(options = {}) {
  panelHeight = options.initialHeight || 200;
  onLayoutCallback = options.onLayout || null;
  saveHeightCallback = options.onSaveHeight || null;

  setupResize();
  setupTabs();
}

function setupTabs() {
  const tabConsole = $('tab-console');
  const tabProblems = $('tab-problems');
  const tabInput = $('tab-input');
  const tabAssembly = $('tab-assembly');

  const outputArea = $('console-output');
  const problemsArea = $('console-problems');
  const inputArea = $('console-input');
  const asmArea = $('console-assembly');
  const btnRules = $('btn-input-rules');

  if (!tabConsole || !tabInput) return;

  function switchTab(activeId) {
    tabConsole.classList.toggle('active', activeId === 'console');
    if (tabProblems) tabProblems.classList.toggle('active', activeId === 'problems');
    tabInput.classList.toggle('active', activeId === 'input');
    if (tabAssembly) tabAssembly.classList.toggle('active', activeId === 'assembly');

    outputArea.hidden = activeId !== 'console';
    if (problemsArea) problemsArea.hidden = activeId !== 'problems';
    inputArea.hidden = activeId !== 'input';
    if (asmArea) asmArea.hidden = activeId !== 'assembly';
    
    if (btnRules) btnRules.hidden = activeId !== 'input';

    if (activeId === 'console') {
      outputArea.scrollTop = outputArea.scrollHeight;
    } else if (activeId === 'input') {
      inputArea.focus();
    }
  }

  tabConsole.addEventListener('click', () => switchTab('console'));
  if (tabProblems) tabProblems.addEventListener('click', () => switchTab('problems'));
  tabInput.addEventListener('click', () => switchTab('input'));
  if (tabAssembly) tabAssembly.addEventListener('click', () => switchTab('assembly'));

  // Rules Modal
  const rulesModal = $('rules-modal');
  $('btn-input-rules')?.addEventListener('click', () => {
    if (rulesModal) rulesModal.hidden = false;
  });
  $('btn-close-rules')?.addEventListener('click', () => {
    if (rulesModal) rulesModal.hidden = true;
  });
  rulesModal?.addEventListener('click', (e) => {
    if (e.target === rulesModal) rulesModal.hidden = true;
  });
}

export function getStdin() {
  const input = $('console-input');
  if (!input) return { valid: true, value: '' };

  const raw = input.value;
  if (!raw.trim()) return { valid: true, value: '' };

  let parsedValue = '';
  let i = 0;
  
  while (i < raw.length) {
    // 1. Whitespace
    if (/\s/.test(raw[i])) {
      parsedValue += raw[i];
      i++;
      continue;
    }
    
    // 2. String (Double quotes)
    if (raw[i] === '"') {
      i++;
      let str = '';
      while (i < raw.length) {
        if (raw[i] === '\\' && raw[i+1] === '"') {
          str += '"';
          i += 2;
        } else if (raw[i] === '"') {
          break;
        } else {
          str += raw[i];
          i++;
        }
      }
      if (i >= raw.length || raw[i] !== '"') {
        return { valid: false, error: 'Unclosed double quote in input.' };
      }
      i++; // Skip closing quote
      parsedValue += str;
      continue;
    }

    // 2.5 Raw String (Backticks)
    if (raw[i] === '`') {
      i++;
      let str = '';
      while (i < raw.length && raw[i] !== '`') {
        str += raw[i];
        i++;
      }
      if (i >= raw.length || raw[i] !== '`') {
        return { valid: false, error: 'Unclosed backtick (`) in input.' };
      }
      i++; // Skip closing backtick
      parsedValue += str;
      continue;
    }
    
    // 3. Array
    if (raw[i] === '[') {
      let arrayStr = '';
      let brackets = 0;
      let inString = false;
      while (i < raw.length) {
        let char = raw[i];
        if (char === '"' && raw[i-1] !== '\\') {
          inString = !inString;
        }
        if (!inString) {
          if (char === '[') brackets++;
          if (char === ']') brackets--;
        }
        
        arrayStr += char;
        i++;
        
        if (brackets === 0) break;
      }
      
      if (brackets > 0) {
        return { valid: false, error: 'Unclosed array bracket "[".' };
      }
      
      try {
        let arr = JSON.parse(arrayStr);
        let flatten = arr.flat(Infinity).map(item => String(item)).join(' ');
        parsedValue += flatten;
      } catch (e) {
        return { valid: false, error: `Invalid array format: ${arrayStr}. Ensure it uses double quotes for strings.` };
      }
      continue;
    }
    
    // 4. Numbers & Booleans
    let token = '';
    while (i < raw.length && !/\s/.test(raw[i]) && raw[i] !== '"' && raw[i] !== '`' && raw[i] !== '[' && raw[i] !== ']') {
      token += raw[i];
      i++;
    }
    
    if (!token) {
      if (raw[i] === ']') return { valid: false, error: 'Unexpected closing bracket "]".' };
      i++;
      continue;
    }
    
    if (!isNaN(Number(token)) && token.trim() !== '') {
      parsedValue += token;
    } else if (token === 'true' || token === 'false' || token === 'null') {
      parsedValue += token;
    } else {
      return { valid: false, error: `Validation Error: '${token}' is not recognized. Strings must be wrapped in quotes ("").` };
    }
  }

  return { valid: true, value: parsedValue };
}

export function isConsoleOpen() {
  return isOpen;
}

export function openConsole() {
  isOpen = true;
  const panel = $('console-panel');
  const handle = $('console-resize-handle');
  if (panel) panel.hidden = false;
  if (handle) handle.hidden = false;

  applyHeight(panelHeight);

  // Auto-switch to Console tab
  const tabConsole = $('tab-console');
  const tabInput = $('tab-input');
  const outputArea = $('console-output');
  const inputArea = $('console-input');
  if (tabConsole && tabInput) {
    tabConsole.classList.add('active');
    tabInput.classList.remove('active');
    outputArea.hidden = false;
    inputArea.hidden = true;
  }

  const output = $('console-output');
  if (output) output.scrollTop = output.scrollHeight;

  if (onLayoutCallback) onLayoutCallback();
}

export function closeConsole() {
  isOpen = false;
  const panel = $('console-panel');
  const handle = $('console-resize-handle');
  if (panel) panel.hidden = true;
  if (handle) handle.hidden = true;

  if (onLayoutCallback) onLayoutCallback();
}

export function toggleConsole() {
  if (isOpen) closeConsole();
  else openConsole();
}

export function applyHeight(h) {
  const clamped = Math.min(Math.max(h, 80), window.innerHeight * 0.8);
  panelHeight = clamped;
  const panel = $('console-panel');
  if (panel) panel.style.height = `${clamped}px`;
}

function setupResize() {
  const handle = $('console-resize-handle');
  if (!handle) return;

  let isDragging = false;
  let dragStartY = 0;
  let dragStartH = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    dragStartY = e.clientY;
    dragStartH = panelHeight;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = dragStartY - e.clientY;
    applyHeight(dragStartH + delta);
    if (onLayoutCallback) onLayoutCallback();
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (saveHeightCallback) saveHeightCallback(panelHeight);
  });
}

export function appendLine(level, text) {
  const output = $('console-output');
  if (!output) return;

  const welcome = $('console-welcome');
  if (welcome) welcome.remove();

  const line = document.createElement('div');
  line.className = `con-line ${level}`;

  const prefix = document.createElement('span');
  prefix.className = 'con-prefix';
  prefix.textContent = PREFIXES[level] || '›';

  const span = document.createElement('span');
  span.className = 'con-text';
  span.textContent = text;

  line.appendChild(prefix);
  line.appendChild(span);
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

export function appendDivider() {
  const output = $('console-output');
  if (!output || output.children.length === 0) return;

  const d = document.createElement('div');
  d.className = 'con-divider';
  output.appendChild(d);
}

export function appendRunBadge(label, hasError = false) {
  const output = $('console-output');
  if (!output) return;

  const d = document.createElement('div');
  d.className = 'con-run-badge' + (hasError ? ' error-run' : '');
  d.innerHTML = `<span class="badge-dot"></span><span>${escapeHtml(label)}</span>`;
  output.appendChild(d);
  output.scrollTop = output.scrollHeight;
}

export function clearConsole() {
  const output = $('console-output');
  if (output) output.innerHTML = '';
  clearAssembly();
}

export function setExecTime(text) {
  // Exec time removed in favor of Problems tab
}

export function switchConsoleTab(activeId) {
  const tab = $(`tab-${activeId}`);
  if (tab) tab.click();
}

// ── Assembly functions ──
export function setAssemblyTabVisibility(visible) {
  const tab = $('tab-assembly');
  if (tab) {
    if (visible) {
      tab.hidden = false;
    } else {
      tab.hidden = true;
      if (tab.classList.contains('active')) {
        $('tab-console')?.click(); // Switch to console if assembly hides
      }
    }
  }
}

export function clearAssembly() {
  const asmArea = $('console-assembly');
  if (asmArea) {
    asmArea.innerHTML = '<div id="assembly-welcome"><span class="cw-dim">// Assembly output will appear here after compilation.</span></div>';
  }
}

export function appendAssemblyLines(asmArray) {
  const asmArea = $('console-assembly');
  if (!asmArea) return;
  
  const welcome = $('assembly-welcome');
  if (welcome) welcome.remove();

  const frag = document.createDocumentFragment();
  for (const item of asmArray) {
    const text = item.text || '';
    const srcLine = item.source?.line;
    
    const div = document.createElement('div');
    div.className = 'asm-line';
    
    const tSpan = document.createElement('span');
    tSpan.className = 'asm-text';
    tSpan.textContent = text;
    div.appendChild(tSpan);
    
    if (srcLine) {
      const sSpan = document.createElement('span');
      sSpan.className = 'asm-source';
      sSpan.textContent = `L${srcLine}`;
      div.appendChild(sSpan);
    }
    
    frag.appendChild(div);
  }
  
  asmArea.appendChild(frag);
}
