# Quick Start Guide - Zen Agentic Extension

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

## Testing

### Test Native Host
```bash
echo '{"id":"test1","method":"ping","params":{}}' | native-host/target/release/zen-agentic-native
```

### Test ML Backend
```bash
cd ml-backend
python3 nlp_processor.py
```

## Next Steps

1. **Make extension permanent**: `npx web-ext sign` (requires Mozilla developer account)
2. **Add screen capture**: Implement in `native-host/src/screen_capture_kit.rs`
3. **Add ML features**: Install NLTK with `pip install nltk`

## Architecture

```
native-host/     # Rust binary: native messaging, screen capture, MCP
webextension/    # Firefox WebExtension: UI, background scripts
ml-backend/      # Python: NLP, sentiment, entities, RAG
```
