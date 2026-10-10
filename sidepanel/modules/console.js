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
  const tabInput = $('tab-input');
  const outputArea = $('console-output');
  const inputArea = $('console-input');

  if (!tabConsole || !tabInput) return;

  tabConsole.addEventListener('click', () => {
    tabConsole.classList.add('active');
    tabInput.classList.remove('active');
    outputArea.hidden = false;
    inputArea.hidden = true;
    outputArea.scrollTop = outputArea.scrollHeight;
  });

  tabInput.addEventListener('click', () => {
    tabInput.classList.add('active');
    tabConsole.classList.remove('active');
    inputArea.hidden = false;
    outputArea.hidden = true;
    inputArea.focus();
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
    if (/\s/.test(raw[i])) {
      parsedValue += raw[i];
      i++;
      continue;
    }
    
    if (raw[i] === '"') {
      i++;
      let str = '';
      while (i < raw.length && raw[i] !== '"') {
        str += raw[i];
        i++;
      }
      if (i >= raw.length) {
        return { valid: false, error: 'Unclosed double quote in input.' };
      }
      i++; // Skip closing quote
      parsedValue += str;
      continue;
    }
    
    let token = '';
    while (i < raw.length && !/\s/.test(raw[i]) && raw[i] !== '"') {
      token += raw[i];
      i++;
    }
    
    // Check if the token is a valid number
    if (!isNaN(Number(token)) && token.trim() !== '') {
      parsedValue += token;
    } else {
      return { valid: false, error: `Validation Error: '${token}' is not a valid number. All text strings must be wrapped in double quotes ("").` };
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
  const time = $('console-exec-time');
  if (time) time.textContent = '';
}

export function setExecTime(text) {
  const time = $('console-exec-time');
  if (time) time.textContent = text;
}
