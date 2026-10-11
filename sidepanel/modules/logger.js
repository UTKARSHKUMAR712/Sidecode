/**
 * logger.js — Sends logs to the Debug Zone
 *
 * Strict Zero-Resource Gate:
 * When the Debug Zone tab is NOT open, logging is completely bypassed.
 * Zero storage reads/writes, zero allocations, zero CPU cycles.
 */

let isDebugZoneActive = false;

export function setDebugZoneActive(active) {
  isDebugZoneActive = !!active;
}

export function isDebugZoneActiveState() {
  return isDebugZoneActive;
}

export function debugLog(level, message, data = null) {
  // If Debug Zone is not open, do NOTHING. Zero overhead.
  if (!isDebugZoneActive) return;

  chrome.storage.local.get(['sidecode_debug_logs'], (res) => {
    const logs = res.sidecode_debug_logs || [];
    logs.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });
    
    // Keep max 100 logs
    if (logs.length > 100) logs.shift();
    
    chrome.storage.local.set({ sidecode_debug_logs: logs });
  });
}
