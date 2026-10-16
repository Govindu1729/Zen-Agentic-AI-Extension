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

let isConnected = false;
let messageId = 0;

function addMessage(content, type = 'system') {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    // Never dump raw objects/arrays into the UI; summarise instead.
    if (typeof content === 'string') {
        div.textContent = content;
    } else {
        div.textContent = summarise(content);
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

function summarise(value) {
    if (Array.isArray(value)) {
        return `[${value.length} item(s)]`;
    }
    if (value && typeof value === 'object') {
        const parts = [];
        for (const [k, v] of Object.entries(value)) {
            if (Array.isArray(v)) parts.push(`${k}: ${v.length} item(s)`);
            else if (v && typeof v === 'object') parts.push(`${k}: {…}`);
            else parts.push(`${k}: ${v}`);
        }
        return parts.join('\n');
    }
    return String(value);
}

function setToolsEnabled(enabled) {
    [btnSnapshot, btnScreenCapture, btnAnalyze, btnNetwork, chatInput, sendBtn].forEach((el) => {
        if (el) el.disabled = !enabled;
    });
}

// Only announce a state TRANSITION, never on every status message.
function updateConnectionStatus(connected) {
    const changed = connected !== isConnected;
    isConnected = connected;
    if (connectionStatus) connectionStatus.classList.toggle('connected', connected);
    if (statusText) statusText.textContent = connected ? 'Connected' : 'Disconnected';
    setToolsEnabled(connected);
    if (changed) {
        addMessage(connected ? 'Connected to native host.' : 'Disconnected from native host.',
                   connected ? 'system' : 'error');
    }
}

// Messaging helpers -------------------------------------------------------

function sendToBackground(action, data = {}) {
    return browser.runtime.sendMessage({ action, ...data });
}

async function sendToNative(method, params = {}) {
    const data = { id: `req_${Date.now()}_${messageId++}`, method, params };
    const res = await sendToBackground('send_to_native', { data });
    if (!res) throw new Error('No response from background script');
    if (!res.success) throw new Error(res.error || 'Native call failed');
    return res.result;
}

async function callMcpTool(toolName, args = {}) {
    return sendToNative('call_mcp_tool', { tool_name: toolName, arguments: args });
}

// MCP responses are { content: [{ type:'text', text: '<json>' }], error }.
// Unwrap to the inner text so the UI never renders raw object trees.
function mcpText(res) {
    if (!res) return '';
    if (typeof res === 'string') return res;
    if (Array.isArray(res.content)) {
        return res.content
            .map((c) => (c && typeof c.text === 'string' ? c.text : ''))
            .filter(Boolean)
            .join('\n');
    }
    return summarise(res);
}

// Format a page-content analysis compactly instead of dumping the full text.
function formatAnalysis(res) {
    const raw = mcpText(res);
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (_) {
        return raw || 'Analysis complete.';
    }
    if (parsed && typeof parsed === 'object') {
        const lines = [];
        if (parsed.title) lines.push(`Title: ${parsed.title}`);
        if (typeof parsed.content_length === 'number') lines.push(`Characters analysed: ${parsed.content_length}`);
        if (parsed.query) lines.push(`Query: ${parsed.query}`);
        if (parsed.content) lines.push(`Preview: ${String(parsed.content).slice(0, 240)}…`);
        return lines.length ? lines.join('\n') : raw;
    }
    return raw;
}

// Connection lifecycle ----------------------------------------------------

browser.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.from !== 'background') return;

    switch (msg.type) {
        case 'connection':
            updateConnectionStatus(msg.status === 'connected');
            break;
        case 'error':
            addMessage(`Error: ${msg.message}`, 'error');
            break;
        case 'screen_capture_frame':
            addMessage('Screen capture frame received.', 'assistant');
            break;
        case 'mcp_tool_result':
            addMessage(msg.result, 'assistant');
            break;
        default:
            break;
    }
});

async function initConnection() {
    try {
        const res = await sendToBackground('ping');
        updateConnectionStatus(Boolean(res && res.connected));
        if (!res || !res.connected) {
            addMessage('Connecting to native host...', 'system');
            await sendToBackground('connect_native');
        }
    } catch (err) {
        addMessage(`Connection error: ${err.message}`, 'error');
        updateConnectionStatus(false);
    }
}

// Tool handlers -----------------------------------------------------------

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

// Chat --------------------------------------------------------------------

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

// Boot --------------------------------------------------------------------

setToolsEnabled(false);
initConnection();