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
    const serializable = (tabs || []).map((t) => ({
      id: t.id,
      label: t.label,
      language: t.language,
      content: t.content,
      filePath: t.filePath || null,
      isDirty: !!t.isDirty
    }));
    _cache = { ..._cache, tabs: serializable };
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

  /** Persist default language for newly created tabs */
  saveDefaultLanguage(language) {
    _cache = { ..._cache, defaultLanguage: language };
    this._flush();
  },

  /** Persist JS runner preference: 'sandbox' (in-browser) or 'cloud' */
  saveJsRunner(runner) {
    _cache = { ..._cache, jsRunner: runner };
    this._flush();
  },

  /** Persist optional custom Piston URL for self-hosted instances */
  saveCustomPistonUrl(url) {
    _cache = { ..._cache, customPistonUrl: url };
    this._flush();
  },

  /** Persist IDE settings */
  saveIdeSettings(settings) {
    _cache = { ..._cache, ideSettings: settings };
    this._flush();
  },

  /** Persist Auto Save preference */
  saveAutoSave(enabled) {
    _cache = { ..._cache, autoSave: enabled };
    this._flush();
  },

  /** Persist open workspace file paths and active file path */
  saveWorkspaceSession(session) {
    _cache = { ..._cache, workspaceSession: session };
    this._flush();
  },

  /** Get persisted open workspace session */
  getWorkspaceSession() {
    return _cache?.workspaceSession || { openPaths: [], activePath: null };
  },

  /** Persist active workspace folder name */
  saveWorkspaceName(name) {
    _cache = { ..._cache, activeWorkspaceName: name };
    this._flush();
  },

  getWorkspaceName() {
    return _cache?.activeWorkspaceName || null;
  },

  /** Persist execution environment: 'cloud' (default), 'local', or 'sandbox' */
  saveEnv(env) {
    _cache = { ..._cache, activeEnv: env };
    this._flush();
  },

  getEnv() {
    return _cache?.activeEnv || 'cloud';
  },

  /** Persist terminal mode: 'browser' (default) or 'local' */
  saveTerminalMode(mode) {
    _cache = { ..._cache, terminalMode: mode };
    this._flush();
  },

  /** Get persisted terminal mode */
  getTerminalMode() {
    return _cache?.terminalMode || 'browser';
  },

  /** Persist whether user has seen the first-time bridge intro banner */
  saveBridgeIntroSeen(seen) {
    _cache = { ..._cache, bridgeIntroSeen: !!seen };
    this._flush();
  },

  hasSeenBridgeIntro() {
    return !!_cache?.bridgeIntroSeen;
  }
};
