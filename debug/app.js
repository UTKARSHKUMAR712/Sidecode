const container = document.getElementById('log-container');
const btnClear = document.getElementById('btn-clear');

function renderLog(log) {
  const el = document.createElement('div');
  el.className = 'log-entry';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = new Date(log.timestamp).toLocaleTimeString();

  const msgSpan = document.createElement('span');
  msgSpan.className = `log-message log-level-${log.level}`;
  msgSpan.textContent = `[${log.level.toUpperCase()}] ${log.message}`;

  el.appendChild(timeSpan);
  el.appendChild(msgSpan);

  if (log.data) {
    const dataDiv = document.createElement('div');
    dataDiv.className = 'log-data';
    let content = typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2);
    dataDiv.textContent = content;
    el.appendChild(dataDiv);
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function loadLogs() {
  chrome.storage.local.get(['sidecode_debug_logs'], (res) => {
    container.innerHTML = '';
    const logs = res.sidecode_debug_logs || [];
    logs.forEach(renderLog);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sidecode_debug_logs) {
    const newLogs = changes.sidecode_debug_logs.newValue || [];
    const oldLogs = changes.sidecode_debug_logs.oldValue || [];
    // Only render the new ones
    if (newLogs.length === 0) {
      container.innerHTML = '';
    } else {
      const added = newLogs.slice(oldLogs.length);
      added.forEach(renderLog);
    }
  }
});

btnClear.addEventListener('click', () => {
  chrome.storage.local.set({ sidecode_debug_logs: [] }, () => {
    container.innerHTML = '';
  });
});

loadLogs();
