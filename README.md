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
│   │   ├── screencapture/ # macOS ScreenCaptureKit integration
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
│   ├── nlp_processor.py  # Sentiment analysis, entity extraction
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
| Screen Capture | ✅ ScreenCaptureKit | 🔄 DXGI Desktop Duplication | ❌ Not implemented |
| Native Messaging | ✅ Full support | ✅ Full support | ✅ Full support |
| WebDriver BiDi | ✅ GeckoDriver | ✅ GeckoDriver | ✅ GeckoDriver |
| MCP Server | ✅ Full support | ✅ Full support | ✅ Full support |

## Prerequisites

### macOS
- macOS 12.3+ (for ScreenCaptureKit)
- Xcode Command Line Tools
- Rust (1.70+)
- Node.js 18+
- Python 3.10+

### Zen Browser
- Zen Browser latest version
- Enable Marionette for WebDriver BiDi (optional, isolated profile recommended)

## Security Considerations

⚠️ **Important**: This extension exposes deep browser internals to AI agents.

1. **Human-in-the-Loop**: Destructive operations require explicit user confirmation
2. **Isolated Profiles**: Use dedicated browser profiles for WebDriver automation
3. **TCC Permissions**: Screen capture requires manual user authorisation on macOS
4. **Prompt Injection**: Validate all inputs from web pages before LLM processing

## License

MIT License - See LICENSE file for details

## Contributing

This is an architectural blueprint implementation. Contributions welcome for:
- Additional MCP tools
- Cross-platform screen capture
- ML model optimizations
- Security hardening
