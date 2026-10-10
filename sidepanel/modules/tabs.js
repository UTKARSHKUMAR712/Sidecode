/**
 * tabs.js — Tab manager for Sidecode
 */

import { uid, escapeHtml, LANG_BADGE, getDefaultContent, RUNNABLE_LANGUAGES } from './constants.js';

let tabs = [];
let activeTabId = null;
let defaultLang = 'javascript';

let onTabActivate = null;
let onTabCreate = null;
let onTabClose = null;
let onTabsChange = null;

const $ = (id) => document.getElementById(id);

export function initTabs(savedTabs = [], savedActiveId = null, listeners = {}, initialDefaultLang = 'javascript') {
  tabs = savedTabs || [];
  activeTabId = savedActiveId || (tabs.length > 0 ? tabs[0].id : null);
  defaultLang = initialDefaultLang || 'javascript';

  onTabActivate = listeners.onTabActivate || null;
  onTabCreate = listeners.onTabCreate || null;
  onTabClose = listeners.onTabClose || null;
  onTabsChange = listeners.onTabsChange || null;
}

export function setDefaultLanguage(lang) {
  if (lang) defaultLang = lang;
}

export function getDefaultLanguage() {
  return defaultLang;
}

export function getTabs() {
  return tabs;
}

export function getActiveTabId() {
  return activeTabId;
}

export function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

export function createTab(language = null) {
  const chosenLang = language || defaultLang;
  const id = uid();
  const tab = {
    id,
    label: `Tab ${tabs.length + 1}`,
    language: chosenLang,
    content: getDefaultContent(chosenLang)
  };

  tabs.push(tab);

  if (onTabCreate) onTabCreate(tab);
  if (onTabsChange) onTabsChange(tabs);

  activateTab(id);
  return tab;
}

export function activateTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  activeTabId = id;
  renderTabs();

  const langSelect = $('lang-select');
  if (langSelect) langSelect.value = tab.language;

  syncRunButton();

  if (onTabActivate) onTabActivate(tab);
}

export function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const closingActive = activeTabId === id;
  tabs.splice(idx, 1);

  if (onTabClose) onTabClose(id);
  if (onTabsChange) onTabsChange(tabs);

  if (closingActive) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    if (next) {
      activateTab(next.id);
    } else {
      activeTabId = null;
      renderTabs();
      syncRunButton();
      if (onTabActivate) onTabActivate(null);
    }
  } else {
    renderTabs();
  }
}

export function setTabLanguage(id, language) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  tab.language = language;
  renderTabs();
  syncRunButton();

  if (onTabsChange) onTabsChange(tabs);
}

export function updateTabContent(id, content) {
  const tab = tabs.find((t) => t.id === id);
  if (tab) {
    tab.content = content;
  }
}

export function renderTabs() {
  const elTabs = $('tabs');
  if (!elTabs) return;

  elTabs.innerHTML = '';
  tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.id = tab.id;
    el.setAttribute('role', 'tab');
    el.title = tab.label;

    const badge = LANG_BADGE[tab.language] || tab.language.toUpperCase().slice(0, 4);
    el.innerHTML = `
      <span class="tab-label">${escapeHtml(tab.label)}</span>
      <span class="tab-lang-badge">${badge}</span>
      <button class="tab-close" title="Close (Ctrl+W)" aria-label="Close tab">&#10005;</button>
    `;

    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        activateTab(tab.id);
      }
    });

    const closeBtn = el.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
    }

    elTabs.appendChild(el);
  });

  const activeEl = elTabs.querySelector('.tab.active');
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  updateNoTabsMsg();
  syncRunButton();
}

function updateNoTabsMsg() {
  const editorCont = $('editor-container');
  let el = $('no-tabs-msg');
  if (tabs.length > 0) {
    if (el) el.remove();
    return;
  }
  if (!el && editorCont) {
    el = document.createElement('div');
    el.id = 'no-tabs-msg';
    el.innerHTML = `<span>No editor tabs open</span><button id="btn-first-tab">+ New Tab</button>`;
    editorCont.appendChild(el);
    const firstTabBtn = $('btn-first-tab');
    if (firstTabBtn) {
      firstTabBtn.addEventListener('click', () => createTab());
    }
  }
}

export function syncRunButton() {
  const runBtn = $('btn-run');
  if (!runBtn) return;
  const tab = getActiveTab();
  const isRunnable = tab && RUNNABLE_LANGUAGES.has(tab.language);
  runBtn.hidden = !isRunnable;
}
