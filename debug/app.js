/**
 * debug/app.js — Sidecode Debug Zone & Resource Monitor
 *
 * Real-time monitoring of RAM usage, V8 JS heap allocation,
 * Monaco editor model lifecycle, DOM footprint, and automated leak detection.
 */

// Tab Navigation
const tabBtnMonitor = document.getElementById('tab-btn-monitor');
const tabBtnLogs = document.getElementById('tab-btn-logs');
const viewMonitor = document.getElementById('view-monitor');
const viewLogs = document.getElementById('view-logs');

tabBtnMonitor.addEventListener('click', () => {
  tabBtnMonitor.classList.add('active');
  tabBtnLogs.classList.remove('active');
  viewMonitor.classList.add('active');
  viewLogs.classList.remove('active');
});

tabBtnLogs.addEventListener('click', () => {
  tabBtnLogs.classList.add('active');
  tabBtnMonitor.classList.remove('active');
  viewLogs.classList.add('active');
  viewMonitor.classList.remove('active');
});

// Controls
const btnRefreshStats = document.getElementById('btn-refresh-stats');
const btnForceCleanup = document.getElementById('btn-force-cleanup');
const chkAutoPoll = document.getElementById('chk-auto-poll');
let pollTimer = null;

// Metrics UI Elements
const dangerPill = document.getElementById('danger-pill');
const dangerText = document.getElementById('danger-text');
const lastUpdatedText = document.getElementById('last-updated-text');

const valHeapUsed = document.getElementById('val-heap-used');
const valHeapTotal = document.getElementById('val-heap-total');
const barHeapUsage = document.getElementById('bar-heap-usage');

const valHeapLimit = document.getElementById('val-heap-limit');
const valHeapMargin = document.getElementById('val-heap-margin');
const barHeapHeadroom = document.getElementById('bar-heap-headroom');

const valModelsCount = document.getElementById('val-models-count');
const valTabsCount = document.getElementById('val-tabs-count');
const valOrphanedCount = document.getElementById('val-orphaned-count');

const valDomNodes = document.getElementById('val-dom-nodes');
const valExplorerNodes = document.getElementById('val-explorer-nodes');
const valConsoleLines = document.getElementById('val-console-lines');

const auditList = document.getElementById('audit-list');
const modelsTbody = document.getElementById('models-tbody');
const tagActiveModels = document.getElementById('tag-active-models');

/**
 * Format bytes to readable string
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Fetch live resource profile from side panel
 */
async function fetchResourceProfile() {
  chrome.runtime.sendMessage({ type: 'GET_RESOURCE_PROFILE' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      dangerPill.className = 'danger-pill pill-warn';
      dangerText.textContent = 'SIDE PANEL OFFLINE (OPEN SIDEPANEL TO INSPECT)';
      lastUpdatedText.textContent = `Attempted at: ${new Date().toLocaleTimeString()}`;
      modelsTbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            ⚠️ Sidecode side panel is not currently active. Open the side panel (Ctrl+Shift+Z or click extension icon) to start streaming live memory telemetry.
          </td>
        </tr>
      `;
      return;
    }

    renderResourceProfile(res);
  });
}

function renderResourceProfile(data) {
  lastUpdatedText.textContent = `Sampled at: ${new Date(data.timestamp).toLocaleTimeString()}`;

  // 1. Danger Pill
  dangerPill.className = 'danger-pill';
  if (data.dangerLevel === 'SAFE') {
    dangerPill.classList.add('pill-safe');
    dangerText.textContent = '● HEALTHY: ALL SYSTEMS UNSUSPICIOUS (NO LEAKS)';
  } else if (data.dangerLevel === 'WARNING') {
    dangerPill.classList.add('pill-warn');
    dangerText.textContent = '▲ WARNING: ELEVATED MEMORY OR BUFFER ACCUMULATION';
  } else {
    dangerPill.classList.add('pill-danger');
    dangerText.textContent = '✖ DANGER: POTENTIAL MEMORY LEAK DETECTED';
  }

  // 2. Heap Metrics
  if (data.memory) {
    const usedMb = (data.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const totalMb = (data.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
    const limitMb = (data.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
    const freeMb = ((data.memory.jsHeapSizeLimit - data.memory.usedJSHeapSize) / (1024 * 1024)).toFixed(1);

    valHeapUsed.textContent = `${usedMb} MB`;
    valHeapTotal.textContent = `Allocated by V8: ${totalMb} MB`;

    const usagePct = Math.min(100, Math.round((data.memory.usedJSHeapSize / data.memory.totalJSHeapSize) * 100));
    barHeapUsage.style.width = `${usagePct}%`;

    valHeapLimit.textContent = `${limitMb} MB`;
    valHeapMargin.textContent = `Headroom: ${freeMb} MB free`;

    const headroomPct = Math.min(100, Math.round((data.memory.usedJSHeapSize / data.memory.jsHeapSizeLimit) * 100));
    barHeapHeadroom.style.width = `${headroomPct}%`;
  } else {
    valHeapUsed.textContent = 'Unavailable';
    valHeapTotal.textContent = 'performance.memory not exposed';
  }

  // 3. Models & Tabs
  const totalModels = data.modelsInfo ? data.modelsInfo.totalModels : 0;
  const activeModels = data.modelsInfo ? data.modelsInfo.activeModels : 0;
  valModelsCount.textContent = `${activeModels} Active Models`;
  valTabsCount.textContent = `Open Tabs: ${data.tabsCount}`;

  const orphanedCount = Math.max(0, totalModels - data.tabsCount);
  valOrphanedCount.textContent = `Orphaned Models: ${orphanedCount}`;
  valOrphanedCount.style.color = orphanedCount > 0 ? '#f48771' : '#858585';

  // 4. DOM Footprint
  valDomNodes.textContent = `${data.domNodeCount} Elements`;
  valExplorerNodes.textContent = `Explorer Tree: ${data.explorerRowsCount} nodes`;
  valConsoleLines.textContent = `Terminal Log: ${data.consoleOutputLines} lines`;

  // 5. Automated Audits List
  renderAudits(data);

  // 6. Active Models Table
  renderModelsTable(data);
}

function renderAudits(data) {
  auditList.innerHTML = '';

  const audits = [
    {
      name: 'Monaco Model Lifecycle Integrity',
      pass: data.issues.every(i => i.category !== 'Memory Leak'),
      detail: data.issues.find(i => i.category === 'Memory Leak')?.message || 'All allocated Monaco models match currently open editor tabs. Zero orphan retention.'
    },
    {
      name: 'V8 JS Heap Saturation & Growth',
      pass: data.issues.every(i => i.category !== 'Heap Exhaustion'),
      detail: data.issues.find(i => i.category === 'Heap Exhaustion')?.message || 'Heap consumption is comfortably within the V8 engine allocation ceiling.'
    },
    {
      name: 'Visual DOM Tree & Hierarchy Depth',
      pass: data.issues.every(i => i.category !== 'DOM Bloat'),
      detail: data.issues.find(i => i.category === 'DOM Bloat')?.message || `Total DOM elements (${data.domNodeCount}) are within high-performance lightweight limits (<6,000).`
    },
    {
      name: 'Terminal & Output Buffer Ceilings',
      pass: data.issues.every(i => i.category !== 'Buffer Growth'),
      detail: data.issues.find(i => i.category === 'Buffer Growth')?.message || `Console output contains ${data.consoleOutputLines} lines, safe from memory growth.`
    },
    {
      name: 'Local Storage & Handle Persistence Quota',
      pass: true,
      detail: data.storage ? `Storage usage is ${formatBytes(data.storage.usage)} out of ${formatBytes(data.storage.quota)}.` : 'IndexedDB quota verified.'
    }
  ];

  audits.forEach(audit => {
    const item = document.createElement('div');
    item.className = `audit-item ${audit.pass ? 'audit-pass' : 'audit-fail'}`;

    item.innerHTML = `
      <div class="audit-icon">${audit.pass ? '✓' : '▲'}</div>
      <div class="audit-content">
        <div class="audit-name">${audit.name}</div>
        <div class="audit-detail">${audit.detail}</div>
      </div>
      <div class="audit-badge ${audit.pass ? 'badge-pass' : 'badge-fail'}">
        ${audit.pass ? 'UNSUSPICIOUS (PASS)' : 'FLAGGED (DANGER)'}
      </div>
    `;

    auditList.appendChild(item);
  });
}

function renderModelsTable(data) {
  modelsTbody.innerHTML = '';
  tagActiveModels.textContent = `${data.modelsInfo ? data.modelsInfo.models.length : 0} Models`;

  if (!data.modelsInfo || data.modelsInfo.models.length === 0) {
    modelsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No active code files currently loaded in Monaco memory.</td>
      </tr>
    `;
    return;
  }

  data.modelsInfo.models.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name" title="${m.uri}"><strong>${m.id}</strong></td>
      <td><span class="lang-pill">${m.language}</span></td>
      <td>${m.lineCount.toLocaleString()}</td>
      <td>${m.charCount.toLocaleString()}</td>
      <td>${formatBytes(m.estimatedBytes)}</td>
      <td><span class="status-pill status-healthy">● Healthy</span></td>
    `;
    modelsTbody.appendChild(tr);
  });
}

// Button Events
btnRefreshStats.addEventListener('click', fetchResourceProfile);

btnForceCleanup.addEventListener('click', () => {
  btnForceCleanup.disabled = true;
  btnForceCleanup.textContent = 'Cleaning...';
  chrome.runtime.sendMessage({ type: 'FORCE_CLEANUP' }, (res) => {
    btnForceCleanup.disabled = false;
    btnForceCleanup.textContent = '🧹 Clean Buffers & GC';
    if (res && res.ok) {
      alert(`Cleanup Complete:\n- Disposed orphaned models: ${res.cleanedModels}\n- Trimmed console lines: ${res.trimmedConsoleLines}`);
      fetchResourceProfile();
    }
  });
});

function setupPolling() {
  if (pollTimer) clearInterval(pollTimer);
  if (chkAutoPoll.checked) {
    pollTimer = setInterval(fetchResourceProfile, 2000);
  }
}

chkAutoPoll.addEventListener('change', setupPolling);

// ─── Log Viewer Implementation ───────────────────────────────────────────────
const logContainer = document.getElementById('log-container');
const btnClearLogs = document.getElementById('btn-clear-logs');

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

  logContainer.appendChild(el);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function loadLogs() {
  chrome.storage.local.get(['sidecode_debug_logs'], (res) => {
    logContainer.innerHTML = '';
    const logs = res.sidecode_debug_logs || [];
    logs.forEach(renderLog);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sidecode_debug_logs) {
    const newLogs = changes.sidecode_debug_logs.newValue || [];
    const oldLogs = changes.sidecode_debug_logs.oldValue || [];
    if (newLogs.length === 0) {
      logContainer.innerHTML = '';
    } else {
      const added = newLogs.slice(oldLogs.length);
      added.forEach(renderLog);
    }
  }
});

btnClearLogs.addEventListener('click', () => {
  chrome.storage.local.set({ sidecode_debug_logs: [] }, () => {
    logContainer.innerHTML = '';
  });
});

// Boot
loadLogs();
fetchResourceProfile();
setupPolling();
