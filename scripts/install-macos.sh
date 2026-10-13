#!/bin/bash
# Zen Agentic Extension - macOS Installation Script
# Usage: ./install-macos.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Zen Agentic Extension Installer ==="
echo "Project directory: $PROJECT_DIR"
echo ""

# Step 1: Build Native Host
echo "Step 1: Building native host..."
cd "$PROJECT_DIR/native-host"

if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust/Cargo not found. Please install Rust first:"
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

cargo build --release --quiet
BINARY_PATH="$PROJECT_DIR/native-host/target/release/zen-agentic-native"

if [[ ! -f "$BINARY_PATH" ]]; then
    echo "❌ Error: Build failed - binary not found"
    exit 1
fi

echo "✓ Native host built successfully"
echo "  Location: $BINARY_PATH"
echo ""

# Step 2: Create Native Messaging Manifest
echo "Step 2: Creating native messaging manifest..."
MANIFEST_DIR="$HOME/Library/Application Support/Zen/NativeMessagingHosts"
mkdir -p "$MANIFEST_DIR"

cat > "$MANIFEST_DIR/zen_agentic_native.json" << EOF
{
  "name": "zen_agentic_native",
  "description": "Zen Agentic AI Native Host",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_extensions": ["zen-agentic-ai@localhost"]
}
EOF

echo "✓ Manifest created at: $MANIFEST_DIR/zen_agentic_native.json"
echo ""

# Step 3: Grant Screen Capture Permission (if needed)
echo "Step 3: Checking screen capture permission..."
if ! tccutil status ScreenCapture "$BINARY_PATH" &>/dev/null; then
    echo "ℹ️  Note: Screen capture permission may need manual granting:"
    echo "   System Settings → Privacy & Security → Screen & System Audio Recording"
else
    echo "✓ Screen capture permission granted"
fi
echo ""

# Step 4: Install Extension (optional)
echo "Step 4: Installing browser extension (optional)..."
cd "$PROJECT_DIR/webextension"

if command -v npm &> /dev/null; then
    if [[ ! -d "node_modules" ]]; then
        npm install --quiet
        echo "✓ Extension dependencies installed"
    fi
else
    echo "ℹ️  npm not found, skipping extension tooling installation"
fi

echo ""

# Summary
echo "=== Installation Complete ==="
echo ""
echo "To load the extension in Zen Browser:"
echo "1. Open Zen Browser"
echo "2. Navigate to about:debugging#/runtime/this-firefox"
echo "3. Click 'Load Temporary Add-on'"
echo "4. Select: $PROJECT_DIR/webextension/manifest.json"
echo ""
echo "To grant screen capture permission:"
echo "  System Settings → Privacy & Security → Screen & System Audio Recording"
echo "  Add zen-agentic-native to the list"
echo ""
echo "To build in release mode:"
echo "  cd $PROJECT_DIR/native-host && cargo build --release"
echo ""
