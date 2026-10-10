/**
 * libraries.js — Instant Third-Party Libraries for Sidecode
 *
 * Dynamically fetches ALL libraries directly from Godbolt Compiler Explorer
 * across every single language Godbolt supports (630+ libraries).
 */

import { storage } from '../storage.js';

export const GODBOLT_LIB_LANGS = {
  cpp: 'c++',
  'c++': 'c++',
  c: 'c',
  rust: 'rust',
  go: 'go',
  d: 'd',
  fortran: 'fortran',
  zig: 'zig',
  objc: 'objc',
  'objc++': 'objc++',
  cuda: 'cuda',
  circle: 'circle',
  kotlin: 'kotlin',
  'android-kotlin': 'android-kotlin',
  'android-java': 'android-java',
  gimple: 'gimple'
};

const LANG_DISPLAY_NAMES = {
  'c++': 'C++',
  rust: 'Rust',
  c: 'C',
  go: 'Go',
  'objc++': 'Objective-C++',
  objc: 'Objective-C',
  circle: 'Circle',
  cuda: 'CUDA',
  d: 'D',
  fortran: 'Fortran',
  zig: 'Zig',
  kotlin: 'Kotlin',
  'android-kotlin': 'Android Kotlin',
  'android-java': 'Android Java',
  gimple: 'Gimple'
};

const POPULAR_LIBS = {
  'c++': ['boost', 'fmt', 'nlohmann_json', 'catch2', 'eigen', 'gtest', 'range-v3', 'spdlog', 'raylib', 'opencv', 'abseil'],
  rust: ['serde', 'rand', 'tokio', 'syn', 'regex', 'anyhow', 'itertools', 'chrono', 'clap', 'futures'],
  c: ['cs50', 'raylib', 'unity'],
  go: ['errors']
};

function getPopularityScore(lang, id) {
  const list = POPULAR_LIBS[lang] || [];
  const idx = list.indexOf(id.toLowerCase());
  return idx !== -1 ? 100 - idx : 0;
}

function normalizeVersions(lib) {
  if (!lib.versions) return [{ id: 'trunk', version: 'trunk' }];
  if (Array.isArray(lib.versions)) {
    return lib.versions.map(v => ({
      id: v.id || v.version || 'trunk',
      version: v.version || v.id || 'trunk'
    }));
  }
  if (typeof lib.versions === 'object') {
    const list = Object.entries(lib.versions).map(([key, v]) => ({
      id: (v && v.id) || key,
      version: (v && v.version) || (v && v.id) || key
    }));
    return list.length > 0 ? list : [{ id: 'trunk', version: 'trunk' }];
  }
  return [{ id: 'trunk', version: 'trunk' }];
}

const libCache = new Map();
let supportedLanguages = []; // Array of language keys from Godbolt
let selectedLibraries = {}; // { [langKey]: [ { id, version, name } ] }
let activeModalLang = 'c++';
let onLibrariesChangedCallback = null;
let isFetchingAll = false;

export function initLibraries(savedSettings, onLibrariesChanged) {
  onLibrariesChangedCallback = onLibrariesChanged;

  if (savedSettings && savedSettings.selectedLibraries) {
    selectedLibraries = savedSettings.selectedLibraries;
  } else if (savedSettings && Array.isArray(savedSettings.libraries)) {
    selectedLibraries = { 'c++': [], rust: [], c: [], go: [] };
    savedSettings.libraries.forEach(libStr => {
      const [id, version] = libStr.split(':');
      if (['serde', 'rand', 'tokio'].includes(id)) {
        selectedLibraries.rust.push({ id, version, name: id });
      } else {
        selectedLibraries['c++'].push({ id, version, name: id });
      }
    });
  } else {
    selectedLibraries = { 'c++': [], rust: [], c: [], go: [] };
  }

  setupEventListeners();

  // Pre-fetch all supported libraries from Godbolt in background
  fetchAllGodboltLibraries().catch(err => console.warn('Background lib fetch failed:', err));
}

export function getGodboltLanguageKey(lang) {
  return GODBOLT_LIB_LANGS[lang] || lang;
}

export function isLibrariesSupportedForLanguage(lang) {
  const key = getGodboltLanguageKey(lang);
  return supportedLanguages.includes(key) || key in GODBOLT_LIB_LANGS;
}

export function getSelectedLibrariesForLanguage(lang) {
  const key = getGodboltLanguageKey(lang);
  return selectedLibraries[key] || [];
}

export function getAllSelectedLibraries() {
  return selectedLibraries;
}

/**
 * Fetch ALL libraries for ALL languages directly from Godbolt in one call
 */
export async function fetchAllGodboltLibraries() {
  if (libCache.size > 0 && supportedLanguages.length > 0) {
    return libCache;
  }

  if (isFetchingAll) {
    // Wait for ongoing fetch
    while (isFetchingAll) {
      await new Promise(r => setTimeout(r, 100));
    }
    return libCache;
  }

  isFetchingAll = true;
  try {
    const res = await fetch('https://godbolt.org/api/libraries', {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const langs = Object.keys(data);
    supportedLanguages = langs;

    for (const [lang, map] of Object.entries(data)) {
      const list = Object.entries(map).map(([id, lib]) => ({
        id: id,
        name: lib.name || id,
        url: lib.url || '',
        description: lib.description || '',
        versions: normalizeVersions(lib)
      }));

      // Sort popular libraries to the top
      list.sort((a, b) => {
        const aScore = getPopularityScore(lang, a.id);
        const bScore = getPopularityScore(lang, b.id);
        if (aScore !== bScore) return bScore - aScore;
        return a.name.localeCompare(b.name);
      });

      libCache.set(lang, list);
    }
  } catch (err) {
    console.warn('Failed to fetch full /api/libraries list from Godbolt:', err);
  } finally {
    isFetchingAll = false;
  }

  return libCache;
}

/**
 * Fetch libraries for a specific language (using cache or API)
 */
export async function fetchLibrariesForLanguage(langKey) {
  const godboltLang = getGodboltLanguageKey(langKey);
  if (libCache.has(godboltLang)) {
    return libCache.get(godboltLang);
  }

  // If cache is empty, fetch all first
  await fetchAllGodboltLibraries();
  if (libCache.has(godboltLang)) {
    return libCache.get(godboltLang);
  }

  // Fallback: fetch individual language endpoint
  try {
    const res = await fetch(`https://godbolt.org/api/libraries/${encodeURIComponent(godboltLang)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      const normalized = data.map(lib => ({
        id: lib.id,
        name: lib.name || lib.id,
        url: lib.url || '',
        description: lib.description || '',
        versions: normalizeVersions(lib)
      }));

      normalized.sort((a, b) => {
        const aScore = getPopularityScore(godboltLang, a.id);
        const bScore = getPopularityScore(godboltLang, b.id);
        if (aScore !== bScore) return bScore - aScore;
        return a.name.localeCompare(b.name);
      });

      libCache.set(godboltLang, normalized);
      if (!supportedLanguages.includes(godboltLang)) supportedLanguages.push(godboltLang);
      return normalized;
    }
  } catch (err) {
    console.warn(`Failed to fetch libraries for ${godboltLang}:`, err);
  }

  return [];
}

export function updateDependenciesBadge(activeLang) {
  const badge = document.getElementById('dep-badge');
  const btn = document.getElementById('btn-dependencies');
  const key = getGodboltLanguageKey(activeLang);
  const libs = selectedLibraries[key] || [];

  if (badge) {
    if (libs.length > 0) {
      badge.textContent = libs.length;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
  if (btn) {
    btn.title = libs.length > 0
      ? `Libraries: ${libs.map(l => l.name || l.id).join(', ')}`
      : 'Manage Third-Party Libraries';
  }
}

export async function openDependenciesModal(lang) {
  const modal = document.getElementById('dependencies-modal');
  if (!modal) return;

  // Make sure we have the full library catalog
  if (libCache.size === 0) {
    await fetchAllGodboltLibraries();
  }

  populateLanguageSelector();

  const mapped = getGodboltLanguageKey(lang);
  activeModalLang = libCache.has(mapped) ? mapped : 'c++';

  const select = document.getElementById('dep-lang-select');
  if (select) select.value = activeModalLang;

  const search = document.getElementById('dep-search-input');
  if (search) search.value = '';

  modal.hidden = false;
  await renderModalContent();
}

export function closeDependenciesModal() {
  const modal = document.getElementById('dependencies-modal');
  if (modal) modal.hidden = true;
}

function populateLanguageSelector() {
  const select = document.getElementById('dep-lang-select');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '';

  // Order priority: c++, rust, c, go, then all others alphabetically
  const priority = ['c++', 'rust', 'c', 'go'];
  const allLangs = Array.from(libCache.keys());

  allLangs.sort((a, b) => {
    const aP = priority.indexOf(a);
    const bP = priority.indexOf(b);
    if (aP !== -1 && bP !== -1) return aP - bP;
    if (aP !== -1) return -1;
    if (bP !== -1) return 1;
    return a.localeCompare(b);
  });

  allLangs.forEach(langKey => {
    const count = libCache.get(langKey)?.length || 0;
    const name = LANG_DISPLAY_NAMES[langKey] || langKey;
    const opt = document.createElement('option');
    opt.value = langKey;
    opt.textContent = `${name} (${count} libs)`;
    select.appendChild(opt);
  });

  if (currentVal && allLangs.includes(currentVal)) {
    select.value = currentVal;
  }
}

async function renderModalContent() {
  renderActiveChips();

  const container = document.getElementById('dep-list-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding: 24px; color: var(--muted); gap: 8px;">
      <span class="spinner"></span> Loading libraries from Compiler Explorer...
    </div>
  `;

  const libs = await fetchLibrariesForLanguage(activeModalLang);
  filterAndRenderList(libs);
}

function renderActiveChips() {
  const container = document.getElementById('dep-active-container');
  if (!container) return;

  const active = selectedLibraries[activeModalLang] || [];
  if (active.length === 0) {
    container.innerHTML = '<span style="font-size:11px; color:var(--muted); font-style:italic;">No libraries included for this language. Click "+ Add" below to include one.</span>';
    return;
  }

  container.innerHTML = '';
  active.forEach(lib => {
    const chip = document.createElement('div');
    chip.className = 'dep-chip';
    chip.innerHTML = `
      <span><strong>${escapeHtml(lib.name || lib.id)}</strong> <span style="font-size:10px; opacity:0.8;">(${escapeHtml(lib.version)})</span></span>
      <span class="dep-chip-remove" title="Remove">&times;</span>
    `;
    chip.querySelector('.dep-chip-remove').addEventListener('click', () => {
      removeLibrary(activeModalLang, lib.id);
    });
    container.appendChild(chip);
  });
}

function filterAndRenderList(allLibs = null) {
  const container = document.getElementById('dep-list-container');
  if (!container) return;

  const searchVal = (document.getElementById('dep-search-input')?.value || '').trim().toLowerCase();
  const libs = allLibs || libCache.get(activeModalLang) || [];

  const filtered = libs.filter(l => {
    if (!searchVal) return true;
    return l.name.toLowerCase().includes(searchVal) || l.id.toLowerCase().includes(searchVal);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--muted); font-size: 12px;">
        No libraries matching "${escapeHtml(searchVal)}" found for ${activeModalLang}.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  const currentSelected = selectedLibraries[activeModalLang] || [];

  filtered.forEach(lib => {
    const isSelected = currentSelected.some(item => item.id === lib.id);
    const selectedItem = currentSelected.find(item => item.id === lib.id);

    const card = document.createElement('div');
    card.className = `dep-card ${isSelected ? 'active' : ''}`;

    let versionOptions = '';
    const versions = lib.versions.length > 0 ? lib.versions : [{ id: 'trunk', version: 'trunk' }];

    versions.forEach(v => {
      const isVerSelected = isSelected && selectedItem?.version === v.id;
      versionOptions += `<option value="${escapeHtml(v.id)}" ${isVerSelected ? 'selected' : ''}>${escapeHtml(v.version)}</option>`;
    });

    const urlHtml = lib.url ? `<a href="${escapeHtml(lib.url)}" target="_blank" rel="noopener" class="dep-link" title="Open documentation">↗ docs</a>` : '';

    card.innerHTML = `
      <div class="dep-info">
        <div class="dep-name-row">
          <span class="dep-name">${escapeHtml(lib.name)}</span>
          ${urlHtml}
        </div>
        <span style="font-size:10.5px; color:var(--muted); font-family:monospace;">ID: ${escapeHtml(lib.id)}</span>
      </div>
      <div class="dep-controls">
        <select class="dep-version-select" aria-label="Version">
          ${versionOptions}
        </select>
        <button class="dep-toggle-btn ${isSelected ? 'added' : ''}" type="button">
          ${isSelected ? '✓ Added' : '+ Add'}
        </button>
      </div>
    `;

    const selectEl = card.querySelector('.dep-version-select');
    const btnEl = card.querySelector('.dep-toggle-btn');

    btnEl.addEventListener('click', () => {
      const ver = selectEl.value;
      if (isSelected) {
        removeLibrary(activeModalLang, lib.id);
      } else {
        addLibrary(activeModalLang, lib.id, ver, lib.name);
      }
    });

    selectEl.addEventListener('change', () => {
      if (isSelected) {
        addLibrary(activeModalLang, lib.id, selectEl.value, lib.name);
      }
    });

    container.appendChild(card);
  });
}

function addLibrary(lang, id, version, name) {
  if (!selectedLibraries[lang]) selectedLibraries[lang] = [];
  const existingIdx = selectedLibraries[lang].findIndex(item => item.id === id);

  if (existingIdx !== -1) {
    selectedLibraries[lang][existingIdx].version = version;
  } else {
    selectedLibraries[lang].push({ id, version, name: name || id });
  }

  saveAndNotify();
}

function removeLibrary(lang, id) {
  if (!selectedLibraries[lang]) return;
  selectedLibraries[lang] = selectedLibraries[lang].filter(item => item.id !== id);
  saveAndNotify();
}

function clearAllForLanguage(lang) {
  selectedLibraries[lang] = [];
  saveAndNotify();
}

function saveAndNotify() {
  storage.load().then(saved => {
    const ideSettings = saved.ideSettings || {};
    ideSettings.selectedLibraries = selectedLibraries;

    const flat = [];
    Object.values(selectedLibraries).forEach(list => {
      list.forEach(item => flat.push(`${item.id}:${item.version}`));
    });
    ideSettings.libraries = flat;

    storage.saveIdeSettings(ideSettings);
  });

  renderActiveChips();
  filterAndRenderList();

  const activeTabLang = document.getElementById('lang-select')?.value || 'cpp';
  updateDependenciesBadge(activeTabLang);

  if (onLibrariesChangedCallback) {
    onLibrariesChangedCallback(activeModalLang, selectedLibraries);
  }
}

function setupEventListeners() {
  document.getElementById('btn-close-dependencies')?.addEventListener('click', closeDependenciesModal);

  const modal = document.getElementById('dependencies-modal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeDependenciesModal();
  });

  document.getElementById('dep-lang-select')?.addEventListener('change', async (e) => {
    activeModalLang = e.target.value;
    await renderModalContent();
  });

  document.getElementById('dep-search-input')?.addEventListener('input', () => {
    filterAndRenderList();
  });

  document.getElementById('btn-clear-deps')?.addEventListener('click', () => {
    clearAllForLanguage(activeModalLang);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
