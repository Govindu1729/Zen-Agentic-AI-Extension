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
    div.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

function setToolsEnabled(enabled) {
    [btnSnapshot, btnScreenCapture, btnAnalyze, btnNetwork, chatInput, sendBtn].forEach((el) => {
        if (el) el.disabled = !enabled;
    });
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    if (connectionStatus) connectionStatus.classList.toggle('connected', connected);
    if (statusText) statusText.textContent = connected ? 'Connected' : 'Disconnected';
    setToolsEnabled(connected);
    if (connected) addMessage('Connected to native host.', 'system');
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

// Route native calls through the MCP tool interface where appropriate
async function callMcpTool(toolName, args = {}) {
    return sendToNative('call_mcp_tool', { tool_name: toolName, arguments: args });
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
        addMessage(`URL: ${snap.url}\nTitle: ${snap.title}\nElements: ${snap.elementCount}\nInteractive: ${snap.interactiveElements}`, 'assistant');
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
        const lines = reqs.slice(-5).map((r) => `${r.method || '?'} ${r.status || r.error || '?'} ${String(r.url).slice(0, 60)}`);
        addMessage(`Found ${reqs.length} requests:\n${lines.join('\n')}`, 'assistant');
    } catch (err) {
        addMessage(`Network query failed: ${err.message}`, 'error');
    }
});

btnAnalyze.addEventListener('click', async () => {
    addMessage('Analyzing page content...', 'system');
    try {
        const content = await sendToBackground('get_page_text');
        if (content && content.error) throw new Error(content.error);
        const text = (content && content.text) || '';
        if (!text) throw new Error('No page text available');

        const res = await callMcpTool('extract_page_content', { include_nlp: true, max_length: 4000, text });
        addMessage(res || 'Analysis complete.', 'assistant');
    } catch (err) {
        addMessage(`Analysis failed: ${err.message}`, 'error');
    }
});

btnScreenCapture.addEventListener('click', async () => {
    addMessage('Requesting screen capture...', 'system');
    try {
        const perm = await sendToNative('check_screen_capture_permission');
        if (perm && perm.has_permission === false) {
            addMessage('Screen capture permission not granted. Grant it in System Settings, then retry.', 'error');
            return;
        }
        const frame = await sendToNative('capture_frame_jpeg');
        addMessage(frame ? 'Screen capture received.' : 'No frame captured.', frame ? 'assistant' : 'error');
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
        const res = await callMcpTool('extract_page_content', {
            include_nlp: true,
            max_length: 4000,
            query: text,
        });
        loading.remove();
        addMessage(res || 'Analysis complete.', 'assistant');
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