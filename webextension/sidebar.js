// Sidebar UI script for Zen Agentic AI Extension

const connectBtn = document.getElementById('connectBtn');
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
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    connectionStatus.classList.toggle('connected', connected);
    statusText.textContent = connected ? 'Connected' : 'Disconnected';
    
    [btnSnapshot, btnScreenCapture, btnAnalyze, btnNetwork, chatInput, sendBtn].forEach(btn => {
        btn.disabled = !connected;
    });
    
    if (connected) {
        addMessage('Connected to native host!', 'system');
    }
}

sendToBackground(action, data = {}) {
    return browser.runtime.sendMessage({ action, ...data });
}

sendToNative(method, params = {}) {
    return sendToBackground('send_to_native', { data: { id: messageId++, method, params } });
}

// Connection
browser.runtime.onMessage.addListener(msg => {
    if (msg.from !== 'background') return;
    
    switch (msg.type) {
        case 'connection':
            updateConnectionStatus(msg.status === 'connected');
            break;
        case 'error':
            addMessage(`Error: ${msg.message}`, 'error');
            break;
        case 'screen_capture_frame':
            addMessage('Screen capture received', 'assistant');
            break;
    }
});

// Send initial ping
sendToBackground('ping').then(res => {
    if (res.pong) {
        sendToBackground('connect_native');
    }
}).catch(() => {
    addMessage('Connecting to native host...', 'system');
    sendToBackground('connect_native');
});

// Tool handlers
btnSnapshot.onclick = async () => {
    addMessage('Taking snapshot...', 'system');
    try {
        const snap = await sendToBackground('get_dom_snapshot');
        addMessage(`URL: ${snap.url}\nTitle: ${snap.title}\nElements: ${snap.elementCount}`, 'assistant');
    } catch (e) {
        addMessage(`Error: ${e.message}`, 'error');
    }
};

btnNetwork.onclick = async () => {
    addMessage('Fetching network requests...', 'system');
    try {
        const reqs = await sendToBackground('get_network_requests', { limit: 20 });
        addMessage(`Found ${reqs.length} recent requests`, 'assistant');
    } catch (e) {
        addMessage(`Error: ${e.message}`, 'error');
    }
};

btnAnalyze.onclick = async () => {
    addMessage('Analyzing page...', 'system');
    try {
        await sendToNative('analyze_page');
        addMessage('Analysis requested. Check sidebar.', 'assistant');
    } catch (e) {
        addMessage(`Error: ${e.message}`, 'error');
    }
};

btnScreenCapture.onclick = async () => {
    addMessage('Requesting screen capture...', 'system');
    try {
        await sendToNative('capture_frame');
        addMessage('Capture initiated', 'assistant');
    } catch (e) {
        addMessage(`Error: ${e.message}`, 'error');
    }
};

// Chat
sendBtn.onclick = async () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    addMessage(text, 'user');
    chatInput.value = '';
    addMessage('Processing...', 'loading');
    
    try {
        await sendToNative('analyze_page', { query: text });
        addMessage('Analysis in progress...', 'assistant');
    } catch (e) {
        addMessage(`Error: ${e.message}`, 'error');
    }
};

chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendBtn.onclick();
});
