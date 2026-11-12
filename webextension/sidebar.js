// Sidebar UI script for Zen Agentic AI Extension
'use strict';

// ============================================================
// STATE
// ============================================================

const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const btnSnapshot = document.getElementById('btnSnapshot');
const btnScreenCapture = document.getElementById('btnScreenCapture');
const btnAnalyze = document.getElementById('btnAnalyze');
const btnNetwork = document.getElementById('btnNetwork');
const btnClick = document.getElementById('btnClick');
const btnType = document.getElementById('btnType');
const btnGo = document.getElementById('btnGo');

// Confirmation state
let isConnected = false;
let messageId = 0;
let confirmationPending = null;

// Phase 2: User consent preferences
let globalAllowlist = new Set();  // method types user has "never ask again" for
const consentExpiryDays = 365;   // 1 year expiry
const consentExpiryMs = consentExpiryDays * 24 * 60 * 60 * 1000;

// ============================================================
// CONFIRMATION FLOW — Phase 1: Core System (already implemented)
// ============================================================

/**
 * Show a confirmation modal dialog for potentially destructive operations.
 * @param {Object} options
 *   - title: Dialog title string
 *   - text: Dialog message text string
 *   - confirmText: Confirm button label (default: "Confirm")
 *   - cancelText: Cancel button label (default: "Cancel")
 *   - onConfirm: Callback when user confirms
 *   - onCancel: Callback when user cancels
 *   - timeoutMs: Auto-cancel after ms (default: 30000)
 */
function showConfirmation({
  title,
  text,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  timeoutMs = 30000,
} = {}) {
  // Remove existing modal if any
  if (confirmationPending && confirmationPending.modal) {
    document.body.removeChild(confirmationPending.modal);
  }

  // Check global allowlist - if user has "never ask again" for this method type, skip
  const methodKey = Object.keys(arguments[0] || {}).find(k => k !== 'title' && k !== 'text') || 'unknown';
  // We'll determine the method type from the caller context

  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  // Create modal panel
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #fff;
    border-radius: 12px;
    padding: 24px 32px;
    max-width: 480px;
    width: 92%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    text-align: center;
  `;

  // Determine if we should skip confirmation based on allowlist
  // (This is a simplified check - full implementation would need method type)
  const shouldSkip = globalAllowlist.has('*'); // Global skip-all

  panel.innerHTML = `
    <h3 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">${shouldSkip ? 'Operation Skipped' : escapeHtml(title)}</p>
    <p style="margin: 0 0 24px; color: #555; font-size: 14px; line-height: 1.5;">${shouldSkip ? 'This operation is configured to skip confirmation.' : escapeHtml(text)}</p>
    <div style="display: flex; gap: 16px; justify-content: center; margin-top: 8px;">
      <button class="confirm-cancel" style="flex: 1; padding: 10px 20px; background: #f0f0f0; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">${shouldSkip ? 'OK' : 'Cancel'}</button>
      ${shouldSkip ? '' : `<button class="confirm-confirm" style="flex: 1; padding: 10px 20px; background: #e60909; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">Confirm</button>`}
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);
  confirmationPending = { modal, onConfirm: shouldSkip ? () => {} : onConfirm, onCancel };

  // Auto-cancel timeout
  if (timeoutMs && !shouldSkip) {
    setTimeout(() => {
      if (confirmationPending === modal) {
        hideConfirmation(false);
      }
    }, timeoutMs);
  }

  // Cancel button
  const btnCancel = panel.querySelector('.confirm-cancel');
  btnCancel.addEventListener('click', () => {
    hideConfirmation(false);
    if (typeof onCancel === 'function') onCancel();
  });

  // Confirm button
  if (!shouldSkip) {
    const btnConfirm = panel.querySelector('.confirm-confirm');
    btnConfirm.addEventListener('click', () => {
      hideConfirmation(true);
      if (typeof onConfirm === 'function') onConfirm();
    });
  }
}

/**
 * Hide the confirmation modal.
 * @param {boolean} accepted - true if user confirmed, false if cancelled/hidden
 */
function hideConfirmation(accepted) {
  if (confirmationPending && confirmationPending.modal) {
    document.body.removeChild(confirmationPending.modal);
  }
  confirmationPending = null;
}

/**
 * Escape HTML to prevent injection.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Mark a method type as globally consented (never ask again).
 * @param {string} methodType - The method category (e.g., "click", "type", "navigate")
 */
function markConsentGiven(methodType) {
  globalAllowlist.add(methodType);
  const expiry = Date.now() + consentExpiryMs;
  localStorage.setItem(`consent_${methodType}_expiry`, expiry);
  addMessage(`✅ Confirmation disabled for "${methodType}" actions (1 year)`, 'system');
}

/**
 * Check if we have global consent for a method type.
 * @param {string} methodType - The method category
 * @returns {Promise<boolean>} - True if consented and not expired
 */
function hasGlobalConsent(methodType) {
  const expiry = localStorage.getItem(`consent_${methodType}_expiry`);
  if (!expiry) return false;
  // Check if not expired
  if (Date.now() > parseInt(expiry)) {
    localStorage.removeItem(`consent_${methodType}_expiry`);
    return false;
  }
  globalAllowlist.add(methodType);
  return true;
}

// ============================================================
// Connection State
// ============================================================

let connected = false;

function updateConnectionStatus(connectedStatus) {
  const changed = connected !== connectedStatus;
  connected = connectedStatus;
  if (connectionStatus) connectionStatus.classList.toggle('connected', connected);
  if (statusText) statusText.textContent = connected ? 'Connected' : 'Disconnected';
  setToolsEnabled(connected);
  if (changed) {
    addMessage(connected ? 'Connected to native host.' : 'Disconnected from native host.',
               connected ? 'system' : 'error');
  }
}

// ============================================================
// Tool Handlers — with Confirmation Flows (Phases 1+2)
// ============================================================

/** Snapshot handler */
btnSnapshot.addEventListener('click', async () => {
  addMessage('Taking page snapshot...', 'system');
  try {
    const snap = await sendToBackground('get_dom_snapshot');
    if (snap && snap.error) throw new Error(snap.error);
    const interactive = Array.isArray(snap.interactiveElements)
      ? snap.interactiveElements.length
      : (snap.interactiveElements || 0);
    addMessage([
      `URL: ${snap.url}`,
      `Title: ${snap.title}`,
      `Elements: ${snap.elementCount}`,
      `Interactive: ${interactive}`,
    ].join('\n'), 'assistant');
  } catch (err) {
    addMessage(`Snapshot failed: ${err.message}`, 'error');
  }
});

/** Network requests handler */
btnNetwork.addEventListener('click', async () => {
  addMessage('Fetching network requests...', 'system');
  try {
    const reqs = await sendToBackground('get_network_requests', { limit: 20 });
    if (!reqs || !reqs.length) {
      addMessage('No recent network requests found.', 'assistant');
      return;
    }
    const lines = reqs.slice(-5).map((r) =>
      `${r.method || '?'} ${r.status || r.error || '?'} ${String(r.url).slice(0, 60)}`);
    addMessage(`Found ${reqs.length} requests:\n${lines.join('\n')}`, 'assistant');
  } catch (err) {
    addMessage(`Network query failed: ${err.message}`, 'error');
  }
});

/** Analyze page handler */
async function getActivePageText() {
  const content = await sendToBackground('get_page_text');
  if (content && content.error) throw new Error(content.error);
  return (content && content.text) || '';
}

btnAnalyze.addEventListener('click', async () => {
  addMessage('Analyzing page content...', 'system');
  try {
    const text = await getActivePageText();
    if (!text) {
      addMessage('No page text available on this tab (browser-internal pages are not accessible).', 'error');
      return;
    }
    const res = await callMcpTool('extract_page_content', {
      include_nlp: true,
      max_length: 4000,
      text,
    });
    addMessage(formatAnalysis(res) || 'Analysis complete.', 'assistant');
  } catch (err) {
    addMessage(`Analysis failed: ${err.message}`, 'error');
  }
});

/** Screen capture handler */
btnScreenCapture.addEventListener('click', async () => {
  addMessage('Requesting screen capture...', 'system');
  try {
    const perm = await sendToNative('check_screen_capture_permission');
    if (perm && perm.has_permission === false) {
      addMessage('Screen Recording permission not granted.\nSystem Settings → Privacy & Security → Screen & System Audio Recording, enable zen-agentic-native, then restart Zen.', 'error');
      return;
    }
    const frame = await sendToNative('capture_frame_jpeg');
    if (frame && (frame.data || frame.size)) {
      addMessage(`Screen capture received (${frame.size || 0} bytes).`, 'assistant');
    } else {
      addMessage('No frame captured. Check Screen Recording permission.', 'error');
    }
  } catch (err) {
    addMessage(`Screen capture failed: ${err.message}`, 'error');
  }
});

/** Chat submission */
async function handleSubmit() {
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  chatInput.value = '';
  const loading = addMessage('Processing...', 'loading');

  try {
    let pageText = '';
    try {
      pageText = await getActivePageText();
    } catch (_) {
      // Internal pages have no content script; answer with query only.
    }

    const args = { include_nlp: true, max_length: 4000, query: text };
    if (pageText) args.text = pageText;

    const res = await callMcpTool('extract_page_content', args);
    loading.remove();
    addMessage(formatAnalysis(res) || 'Done.', 'assistant');
  } catch (err) {
    loading.remove();
    addMessage(`Error: ${err.message}`, 'error');
  }
}

sendBtn.addEventListener('click', handleSubmit);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
});

// ============================================================
// Phase 2: Configuration UI — Confirmation Settings
// ============================================================

/** Phase 2: Toggle confirmation for an operation type */
function toggleConfirmation(methodType) {
  if (globalAllowlist.has(methodType)) {
    // User has "never ask again" — show remove option
    if (confirm(`Disable "never ask again" for "${methodType}" actions?\nThis will re-enable confirmations.`)) {
      globalAllowlist.delete(methodType);
      localStorage.removeItem(`consent_${methodType}_expiry`);
      addMessage(`✅ Confirmations re-enabled for "${methodType}" actions`, 'system');
    }
  } else {
    // User doesn't have allowlist entry — show add option
    if (confirm(`Enable "never ask again" for "${methodType}" actions?\nYou'll be asked once more, then confirmations will be skipped.`)) {
      markConsentGiven(methodType);
    }
  }
  updateAllowlistUI();
}

/** Phase 2: Update the allowlist UI */
function updateAllowlistUI() {
  // Show/hide allowlist items based on global state
  const allowlistInfo = document.getElementById('allowlistInfo');
  if (globalAllowlist.size > 0) {
    allowlistInfo.innerHTML = `
      <div style="margin: 16px 0; padding: 12px; background: #e6f7ff; border-radius: 8px; border-left: 4px solid #096dd9;">
        <strong>Allowlist (${globalAllowlist.size} method types):</strong>
        ${Array.from(globalAllowlist).map(m => `<span style="margin-right: 8px;">${m}</span>`).join(' ')}
        <button class="small-btn" onclick="toggleConfirmation('*')">Remove all</button>
      </div>`;
  } else if (connectionStatus) {
    allowlistInfo.innerHTML = `
      <div style="margin: 16px 0; padding: 12px; background: #f0f0f0; border-radius: 8px;">
        <small>No confirmations disabled. Click operation buttons to enable/disable per-type.</small>
      </div>`;
  }
}

/** Phase 2: Initial allowlist UI update */
function initAllowlistUI() {
  // Render initial state after connection
  const allowlistContainer = document.createElement('div');
  allowlistContainer.id = 'allowlistInfo';
  allowlistContainer.style.marginTop = '16px';
  allowlistContainer.style.padding = '12px';
  allowlistStyle.background = globalAllowlist.size > 0 ? '#e6f7ff' : '#f0f0f0';
  
  // Insert after connection status
  if (statusText) {
    statusText.parentNode.insertBefore(allowlistInfo, statusText.nextSibling);
  }
}

// ============================================================
// Tool Handlers — with Confirmation Flows (Phases 1+2)
// ============================================================

/** Snapshot handler */
btnSnapshot.addEventListener('click', async () => {
  addMessage('Taking page snapshot...', 'system');
  try {
    const snap = await sendToBackground('get_dom_snapshot');
    if (snap && snap.error) throw new Error(snap.error);
    const interactive = Array.isArray(snap.interactiveElements)
      ? snap.interactiveElements.length
      : (snap.interactiveElements || 0);
    addMessage([
      `URL: ${snap.url}`,
      `Title: ${snap.title}`,
      `Elements: ${snap.elementCount}`,
      `Interactive: ${interactive}`,
    ].join('\n'), 'assistant');
  } catch (err) {
    addMessage(`Snapshot failed: ${err.message}`, 'error');
  }
});

/** Network requests handler */
btnNetwork.addEventListener('click', async () => {
  addMessage('Fetching network requests...', 'system');
  try {
    const reqs = await sendToBackground('get_network_requests', { limit: 20 });
    if (!reqs || !reqs.length) {
      addMessage('No recent network requests found.', 'assistant');
      return;
    }
    const lines = reqs.slice(-5).map((r) =>
      `${r.method || '?'} ${r.status || r.error || '?'} ${String(r.url).slice(0, 60)}`);
    addMessage(`Found ${reqs.length} requests:\n${lines.join('\n')}`, 'assistant');
  } catch (err) {
    addMessage(`Network query failed: ${err.message}`, 'error');
  }
});

/** Analyze page handler */
async function getActivePageText() {
  const content = await sendToBackground('get_page_text');
  if (content && content.error) throw new Error(content.error);
  return (content && content.text) || '';
}

btnAnalyze.addEventListener('click', async () => {
  addMessage('Analyzing page content...', 'system');
  try {
    const text = await getActivePageText();
    if (!text) {
      addMessage('No page text available on this tab (browser-internal pages are not accessible).', 'error');
      return;
    }
    const res = await callMcpTool('extract_page_content', {
      include_nlp: true,
      max_length: 4000,
      text,
    });
    addMessage(formatAnalysis(res) || 'Analysis complete.', 'assistant');
  } catch (err) {
    addMessage(`Analysis failed: ${err.message}`, 'error');
  }
});

/** Screen capture handler */
btnScreenCapture.addEventListener('click', async () => {
  addMessage('Requesting screen capture...', 'system');
  try {
    const perm = await sendToNative('check_screen_capture_permission');
    if (perm && perm.has_permission === false) {
      addMessage('Screen Recording permission not granted.\nSystem Settings → Privacy & Security → Screen & System Audio Recording, enable zen-agentic-native, then restart Zen.', 'error');
      return;
    }
    const frame = await sendToNative('capture_frame_jpeg');
    if (frame && (frame.data || frame.size)) {
      addMessage(`Screen capture received (${frame.size || 0} bytes).`, 'assistant');
    } else {
      addMessage('No frame captured. Check Screen Recording permission.', 'error');
    }
  } catch (err) {
    addMessage(`Screen capture failed: ${err.message}`, 'error');
  }
});

/** Chat submission */
async function handleSubmit() {
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  chatInput.value = '';
  const loading = addMessage('Processing...', 'loading');

  try {
    let pageText = '';
    try {
      pageText = await getActivePageText();
    } catch (_) {
      // Internal pages have no content script; answer with query only.
    }

    const args = { include_nlp: true, max_length: 4000, query: text };
    if (pageText) args.text = pageText;

    const res = await callMcpTool('extract_page_content', args);
    loading.remove();
    addMessage(formatAnalysis(res) || 'Done.', 'assistant');
  } catch (err) {
    loading.remove();
    addMessage(`Error: ${err.message}`, 'error');
  }
}

sendBtn.addEventListener('click', handleSubmit);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
});

// ============================================================
// Phase 2 UI Event Listeners
// ============================================================

// Add allowlist UI after connection
let allowlistInitialized = false;

function ensureAllowlistUI() {
  if (!allowlistInitialized && connectionStatus) {
    initAllowlistUI();
    allowlistInitialized = true;
  }
}

// Override updateConnectionStatus to also init allowlist UI
const originalUpdateConnectionStatus = updateConnectionStatus;
updateConnectionStatus = function(connectedStatus) {
  originalUpdateConnectionStatus(connectedStatus);
  ensureAllowlistUI();
}

/** Click element — with confirmation and allowlist toggle */
btnClick.addEventListener('click', async () => {
  // Phase 2: Check allowlist before showing confirmation
  if (globalAllowlist.has('click')) {
    addMessage('Click action suppressed by allowlist.', 'system');
    return;
  }

  addMessage('Click element — confirmation required.', 'system');

  try {
    const confirmed = await showConfirmation({
      title: 'Confirm Element Click',
      text: 'This will simulate a click on a DOM element. Proceed?',
      confirmText: 'Click',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Click cancelled by user.', 'system');
      return;
    }

    // Prompt for selector
    const selector = prompt('Enter CSS selector for the element to click:\n(e.g., "button.submit", "#submit-btn", ".menu-item"):');
    if (!selector) {
      addMessage('No selector provided. Click cancelled.', 'system');
      return;
    }

    addMessage('Preparing to click: ' + selector, 'system');
    const res = await sendToNativeWithConfirmation('click_by_uid', {
      uid: selector,
    });
    addMessage(`Click result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Click failed: ${err.message}`, 'error');
  }
};

/** Type text — with confirmation and allowlist toggle */
btnType.addEventListener('click', async () => {
  // Phase 2: Check allowlist before showing confirmation
  if (globalAllowlist.has('type')) {
    addMessage('Type action suppressed by allowlist.', 'system');
    return;
  }

  addMessage('Type text — confirmation required.', 'system');

  try {
    const confirmed = await showConfirmation({
      title: 'Confirm Text Input',
      text: 'This will type text into a focused DOM element. Proceed?',
      confirmText: 'Type',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Text input cancelled by user.', 'system');
      return;
    }

    const text = prompt('Enter the text to type:\n(e.g., "Hello World", "submit_form", "username_field"):');
    if (!text) {
      addMessage('No text provided. Typing cancelled.', 'system');
      return;
    }

    addMessage('Preparing to type: ' + text, 'system');
    const res = await sendToNativeWithConfirmation('type_text', {
      text,
    });
    addMessage(`Type result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Typing failed: ${err.message}`, 'error');
  }
});

/** Go to URL — with confirmation and allowlist toggle */
btnGo.addEventListener('click', async () => {
  // Phase 2: Check allowlist before showing confirmation
  if (globalAllowlist.has('navigate') || globalAllowlist.has('*')) {
    addMessage('Navigation action suppressed by allowlist.', 'system');
    return;
  }

  addMessage('Navigate — confirmation required.', 'system');

  try {
    const confirmed = await showConfirmation({
      title: 'Confirm Navigation',
      text: 'This will navigate the browser to a new URL. Proceed?',
      confirmText: 'Go',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Navigation cancelled by user.', 'system');
      return;
    }

    const url = prompt('Enter the URL to navigate to:\n(e.g., "https://example.com", "https://github.com"):');
    if (!url) {
      addMessage('No URL provided. Navigation cancelled.', 'system');
      return;
    }

    addMessage('Preparing navigation to: ' + url, 'system');
    const res = await sendToNativeWithConfirmation('go_to_url', {
      url,
    });
    addMessage(`Navigation result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Navigation failed: ${err.message}`, 'error');
  }
});

// ============================================================
// Boot
// ============================================================

// Initialize allowlist UI after connection check
setTimeout(ensureAllowlistUI, 500);

setToolsEnabled(false);
initConnection();