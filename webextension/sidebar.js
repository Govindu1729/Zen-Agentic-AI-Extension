// Sidebar UI script for Zen Agentic AI Extension
'use strict';

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

let isConnected = false;
let messageId = 0;
let confirmationPending = null;

// ============================================================
// CONFIRMATION FLOW — Phase 1: Core System
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

  panel.innerHTML = `
    <h3 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">${escapeHtml(title)}</h3>
    <p style="margin: 0 0 24px; color: #555; font-size: 14px; line-height: 1.5;">${escapeHtml(text)}</p>
    <div style="display: flex; gap: 16px; justify-content: center; margin-top: 8px;">
      <button class="confirm-cancel" style="flex: 1; padding: 10px 20px; background: #f0f0f0; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">${escapeHtml(cancelText)}</button>
      <button class="confirm-confirm" style="flex: 1; padding: 10px 20px; background: #e60909; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">${escapeHtml(confirmText)}</button>
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);

  confirmationPending = { modal, onConfirm, onCancel };

  // Auto-cancel timeout
  if (timeoutMs) {
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
  const btnConfirm = panel.querySelector('.confirm-confirm');
  btnConfirm.addEventListener('click', () => {
    hideConfirmation(true);
    if (typeof onConfirm === 'function') onConfirm();
  });
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

// ============================================================
// Existing UI Elements (references added from sidebar.html)
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
// Tool Handlers with Confirmation Wrappers
// ============================================================

/**
 * Send message to background script.
 */
function sendToBackground(action, data = {}) {
  return browser.runtime.sendMessage({ action, ...data });
}

/**
 * Send message to native host with optional confirmation.
 * @param {string} method - Native host method name
 * @param {Object} params - Method parameters
 * @param {Object} confirmOpts - Confirmation options (title, text, etc.)
 * @returns {Promise<any>} - Resolution if confirmed, rejection if cancelled
 */
async function sendToNativeWithConfirmation(method, params = {}, confirmOpts = {}) {
  // Generate a unique consent ID for tracking
  const consentId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Show confirmation dialog
  return new Promise((resolve, reject) => {
    showConfirmation({
      title: confirmOpts.title || 'Confirm Action',
      text: confirmOpts.text || `Are you sure you want to perform "${method}"?`,
      confirmText: confirmOpts.confirmText || 'Confirm',
      cancelText: confirmOpts.cancelText || 'Cancel',
      timeoutMs: confirmOpts.timeoutMs ?? 30000,
      onConfirm: async () => {
        // User confirmed — send to native host
        try {
          const data = { id: `req_${Date.now()}_${messageId++}`, method, params };
          const res = await sendToBackground('send_to_native', { data });

          if (!res) {
            reject(new Error('No response from native host'));
            return;
          }
          if (!res.success) {
            reject(new Error(res.error || 'Native call failed'));
            return;
          }

          // Mark consent as given so we don't ask again for same method type
          markConsentGiven(method);

          resolve(res.result);
        } catch (err) {
          reject(err);
        }
      },

      onCancel: () => {
        // User cancelled
        reject(new Error('Action cancelled by user'));
      },
    });
  });
}

/**
 * Mark a method type as consented globally (never ask again).
 * @param {string} methodType - The method category (e.g., "click", "type", "navigate")
 */
function markConsentGiven(methodType) {
  // Store in local storage with expiry one year from now
  const expiry = Date.now() + 365 * 24 * 60 * 60 * 1000;
  localStorage.setItem(`consent_${methodType}`, expiry);
}

/**
 * Check if we have global consent for a method type.
 * @param {string} methodType - The method category
 * @returns {Promise<boolean>} - True if consented and not expired
 */
function hasGlobalConsent(methodType) {
  const expiry = localStorage.getItem(`consent_${methodType}`);
  if (!expiry) return false;
  // Check if not expired
  if (Date.now() > parseInt(expiry)) {
    localStorage.removeItem(`consent_${methodType}`);
    return false;
  }
  return true;
}

/**
 * Check if a specific action should show confirmation.
 * @param {string} method - The native host method
 * @returns {Promise<boolean>} - True if confirmation is required
 */
async function shouldShowConfirmation(method) {
  // Define which methods always require confirmation
  const highRiskMethods = ['go_to_url', 'click_by_uid', 'type_text', 'evaluate_script'];

  // If user has global consent for this method type, skip confirmation
  const methodType = method.split('_')[0]; // e.g., "click", "type", "go"
  if (hasGlobalConsent(methodType)) return false;

  // Always require confirmation for high-risk methods
  if (highRiskMethods.includes(method)) return true;

  // Default: require confirmation for any potentially destructive action
  return true;
}

// ============================================================
// Tool Handlers — with Confirmation Flows
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

/** --- Confirmation Flow Tool Handlers --- */

/** Click element — requires confirmation */
btnClick.addEventListener('click', async () => {
  addMessage('Click element — confirmation required.', 'system');

  try {
    // Ask for confirmation before proceeding
    const confirmed = await showConfirmation({
      title: 'Confirm Element Click',
      text: 'This will simulate a click on the selected DOM element. Proceed?',
      confirmText: 'Click',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Click cancelled by user.', 'system');
      return;
    }

    // Prompt for selector
    const selector = prompt('Enter CSS selector for the element to click:');
    if (!selector) {
      addMessage('No selector provided. Click cancelled.', 'system');
      return;
    }

    addMessage('Clicking element: ' + selector, 'system');
    const res = await sendToNativeWithConfirmation('click_by_uid', {
      uid: selector, // Using selector as uid for now
    });
    addMessage(`Click result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Click failed: ${err.message}`, 'error');
  }
});

/** Type text — requires confirmation */
btnType.addEventListener('click', async () => {
  addMessage('Type text — confirmation required.', 'system');

  try {
    const confirmed = await showConfirmation({
      title: 'Confirm Text Input',
      text: 'This will type text into a focused element. Proceed?',
      confirmText: 'Type',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Text input cancelled by user.', 'system');
      return;
    }

    const text = prompt('Enter text to type:');
    if (!text) {
      addMessage('No text provided. Typing cancelled.', 'system');
      return;
    }

    addMessage('Typing: ' + text, 'system');
    const res = await sendToNativeWithConfirmation('type_text', {
      text,
    });
    addMessage(`Type result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Typing failed: ${err.message}`, 'error');
  }
});

/** Go to URL — requires confirmation */
btnGo.addEventListener('click', async () => {
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

    const url = prompt('Enter URL to navigate to:');
    if (!url) {
      addMessage('No URL provided. Navigation cancelled.', 'system');
      return;
    }

    addMessage('Navigating to: ' + url, 'system');
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

setToolsEnabled(false);
initConnection();