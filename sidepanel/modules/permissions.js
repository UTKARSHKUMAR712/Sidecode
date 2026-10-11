/**
 * permissions.js — File system permissions and Brave flag helper for Sidecode
 */

const BRAVE_FLAG_URL = 'brave://flags/#file-system-access-api';

/**
 * Check if the File System Access API is available in this environment
 */
export async function checkFsaSupport() {
  const isAvailable = typeof window.showDirectoryPicker === 'function';
  let isBrave = false;

  if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
    try {
      isBrave = await navigator.brave.isBrave();
    } catch (_) {
      isBrave = false;
    }
  }

  return {
    isAvailable,
    isBrave,
    isBlockedInBrave: isBrave && !isAvailable
  };
}

/**
 * Query current readwrite permission status for a handle
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<'granted'|'prompt'|'denied'>}
 */
export async function queryDirectoryPermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch (err) {
    console.warn('Failed to query handle permission:', err);
    return 'denied';
  }
}

/**
 * Request readwrite permission from a user gesture
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<'granted'|'prompt'|'denied'>}
 */
export async function requestDirectoryPermission(handle) {
  if (!handle || typeof handle.requestPermission !== 'function') return 'denied';
  try {
    return await handle.requestPermission({ mode: 'readwrite' });
  } catch (err) {
    console.warn('Failed to request handle permission:', err);
    return 'denied';
  }
}

/**
 * Redirect user to Brave Flags page to enable the File System Access API.
 * Copies the flag URL to clipboard as a safety net in case browser security restricts chrome.tabs.create.
 */
export async function redirectToBraveFlag() {
  // Always copy URL to clipboard as an instant fallback
  try {
    await navigator.clipboard.writeText(BRAVE_FLAG_URL);
  } catch (_) {}

  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url: BRAVE_FLAG_URL }, () => {
      if (chrome.runtime.lastError) {
        // Chromium security restrictions on navigating to internal schemes
        alert(
          'Brave restricts extensions from toggling internal browser flags automatically.\n\n' +
          'The flag URL has been copied to your clipboard:\n' +
          'brave://flags/#file-system-access-api\n\n' +
          'Please paste it into Brave\'s address bar (Ctrl+V), change "File System Access API" to "Enabled", and click Relaunch.'
        );
      }
    });
  } else {
    alert(
      'The flag URL has been copied to your clipboard:\n' +
      'brave://flags/#file-system-access-api\n\n' +
      'Please paste it into Brave\'s address bar (Ctrl+V), set to "Enabled", and click Relaunch.'
    );
  }
}
