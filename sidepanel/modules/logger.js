/**
 * logger.js — Sends logs to the Debug Zone
 */
export function debugLog(level, message, data = null) {
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
