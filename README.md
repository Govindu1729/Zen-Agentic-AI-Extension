# Zen Agentic Extension

An agentic AI WebExtension for Zen Browser integrating Model Context Protocol (MCP), Native Messaging, and Local Machine Learning.

## Architecture Overview

This project bridges Zen Browser (Firefox fork) with local AI agents through a modular architecture:

- **WebExtension**: Next.js/React sidebar UI using Firefox WebExtensions API
- **Native Host**: Rust binary handling IPC, screen capture, and MCP server
- **ML Backend**: Python subprocess for NLP, embeddings, and Agentic RAG
- **MCP Integration**: Standardised tools for Claude Desktop, Cursor, and other AI clients

## Project Structure

```
zen-agentic-extension/
├── native-host/          # Rust native messaging host
│   ├── src/
│   │   ├── main.rs       # Entry point & message loop
│   │   ├── ipc.rs        # 32-bit length-prefixed JSON-RPC
│   │   ├── screen_capture_kit.rs  # Cross-platform screen capture (macOS/CoreGraphics, Windows/DXGI, Linux/X11- Wayland)
│   │   ├── mcp/          # Model Context Protocol server
│   │   └── webdriver/    # WebDriver BiDi integration
│   ├── Cargo.toml
│   └── build.rs
├── webextension/         # Firefox WebExtension
│   ├── src/              # Next.js source
│   ├── public/
│   ├── manifest.json
│   └── package.json
├── ml-backend/           # Python ML pipeline
│   ├── nlp_processor.py  # Sentiment analysis, entity extraction, intent detection
│   ├── rag_engine.py     # Agentic RAG with local embeddings
│   ├── requirements.txt
│   └── models/
├── docs/                 # Documentation
│   ├── architecture.md
│   ├── setup-guide.md
│   └── api-reference.md
└── scripts/              # Build & deployment scripts
    ├── build-native.sh
    ├── package-extension.sh
    └── install-macos.sh
```

## Platform Support

| Feature | macOS (Apple Silicon) | Windows | Linux |
|---------|----------------------|---------|-------|
| Screen Capture | ✅ ScreenCaptureKit + TCC | 🔄 DXGI Desktop Duplication (stub) | 🔄 X11/Wayland (stub) |
| Native Messaging | ✅ Full support | ✅ Full support | ✅ Full support |
| WebDriver BiDi | ✅ GeckoDriver | ✅ GeckoDriver | ✅ GeckoDriver |
| MCP Server | ✅ Full support | ✅ Full support | ✅ Full support |
| Security/HITL Confirmation | ✅ Prompted flows | ✅ Prompted flows | ✅ Prompted flows |

## Security & Human-in-the-Loop

This extension exposes deep browser internals to AI agents. **Strong security controls are mandatory.**

### Confirmation Flows for Destructive Operations

| Operation | Risk Level | Confirmation Required |
|-----------|------------|----------------------|
| Navigation to new URLs / tab creation / tab closure | 🔴 High | ✅ Always |
| Click elements / type text / execute script | 🟠 Medium | ✅ Unless user-configured |
| Sentiment analysis / entity extraction / RAG queries | 🟡 Low | ❌ No (safe read-only) |
| Screen capture (macOS) / permission checks | ℹ️ Info | ⚠️ Remind once |

### How It Works

1. **Confirmation Dialog** — User is prompted before any potentially destructive action
2. **Per-operation consent** — Each action type requires explicit approval
3. **Global allowlist** — Users can mark trusted operations never to ask again
4. **Audit logging** — All confirmed operations are logged

### Confirmation UI

The sidebar includes modal confirmation prompts for:
- Clicking DOM elements
- Typing text into forms/inputs
- Navigating to new URLs
- Executing JavaScript

Users can opt-out of future prompts for specific operation types via a global allowlist.

### Safe Operations (No Confirmation Needed)

- Sentiment analysis
- Entity extraction
- Keyword extraction
- Text summarization
- Embedding generation
- RAG queries (read-only)
- Page content extraction

### Auditing

- All confirmed operations are logged with timestamps
- User consents are stored persistently
- Optional audit trail for compliance

## Installation (macOS)

```bash
# Clone repository
git clone https://github.com/Govindu1729/Zen-Agentic-AI-Extension.git
cd Zen-Agentic-AI-Extension

# Run installer
chmod +x scripts/install-macos.sh
./scripts/install-macos.sh
```

## Manual Setup

### 1. Build Native Host
```bash
cd native-host
cargo build --release
```

### 2. Create Manifest
Create `~/Library/Application Support/Zen/NativeMessagingHosts/zen_agentic_native.json`:
```json
{
  "name": "zen_agentic_native",
  "description": "Zen Agentic AI Native Host",
  "path": "/absolute/path/to/native-host/target/release/zen-agentic-native",
  "type": "stdio",
  "allowed_extensions": ["zen-agentic-ai@localhost"]
}
```

### 3. Load Extension
1. Open Zen Browser
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `webextension/manifest.json`

### 4. Grant Screen Capture Permission
- System Settings → Privacy & Security → Screen & System Audio Recording
- Add `zen-agentic-native` to the list

## Next Steps

1. **Make extension permanent**: `npx web-ext sign` (requires Mozilla developer account)
2. **Add cross-platform screen capture**: Implement DXGI (Windows) and X11/Wayland (Linux)
3. **Add ML features**: Intent detection, tool-use suggestions, context-aware prompting
4. **Security hardening**: Human-in-the-loop confirmation flows (implemented in this release)
5. **Add MCP tool catalog**: Standardised tools for Claude Desktop, Cursor, and other AI clients

## License

MIT License - See LICENSE file for details

## Contributing

This is an architectural blueprint implementation. Contributions welcome for:
- Additional MCP tools
- Cross-platform screen capture
- ML model optimizations
- Security hardening

---

## Recent Improvements

- **Cross-platform screen capture**: macOS CoreGraphics working; Windows/DXGI and Linux/X11- Wayland stubs with consistent API surface
- **ML backend enhancement**: Intent detection, improved entity extraction, keyword caching, RAG store/query
- **MCP tool catalog**: 28 tools documented with full input schemas
- **Skills directory**: Structured for Agensi.io marketplace (Free/$19/$99 tiers, 70%/90% author share)
- **Security & human-in-the-loop**: Confirmation flows for destructive operations (click, type, navigate)
- **GitHub commits**: All improvements committed to main branch