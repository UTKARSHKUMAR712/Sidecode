/**
 * storage.js — Thin async wrapper around chrome.storage.local for Sidecode
 *
 * All data lives under the 'sidecode_v1' key.
 * An in-memory cache avoids async read-before-write on every save.
 */

const KEY = 'sidecode_v1';

let _cache = null;

export const storage = {

  /** Load all data once at startup */
  async load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEY, (res) => {
        _cache = res[KEY] || {};
        resolve(_cache);
      });
    });
  },

  /** Flush the in-memory cache to storage */
  _flush() {
    chrome.storage.local.set({ [KEY]: _cache });
  },

  saveTabs(tabs) {
    _cache = { ..._cache, tabs };
    this._flush();
  },

  saveActiveTab(id) {
    _cache = { ..._cache, activeTabId: id };
    this._flush();
  },

  /** Save content for a single tab without rewriting all tabs */
  saveTabContent(id, content) {
    if (!_cache.tabs) return;
    const tabs = _cache.tabs.map(t => t.id === id ? { ...t, content } : t);
    _cache = { ..._cache, tabs };
    this._flush();
  },

  /** Save language for a single tab */
  saveTabLanguage(id, language) {
    if (!_cache.tabs) return;
    const tabs = _cache.tabs.map(t => t.id === id ? { ...t, language } : t);
    _cache = { ..._cache, tabs };
    this._flush();
  },

  /** Persist the console panel height */
  saveConsoleHeight(height) {
    _cache = { ..._cache, consoleHeight: height };
    this._flush();
  },
};
