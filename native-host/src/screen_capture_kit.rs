//! Minimal screen capture module - cross-platform stubs
//!
//! Provides consistent API surface across macOS, Windows, Linux.
//! Full FFI implementations (DXGI, X11/Wayland) pending.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureConfig {
    pub window_id: Option<u32>,
    pub fps: u32,
    pub format: ImageFormat,
    pub quality: u8,
    pub target_app: Option<String>,
}

impl Default for CaptureConfig {
    fn default() -> Self {
        Self {
            window_id: None,
            fps: 60,
            format: ImageFormat::Jpeg,
            quality: 85,
            target_app: Some("Zen".to_string()),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageFormat {
    Jpeg,
    Png,
    WebP,
}

/// Captured frame data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedFrame {
    pub timestamp: u64,
    pub width: u32,
    pub height: u32,
    pub data: String,  // base64-encoded JPEG
    pub window_title: Option<String>,
    pub app_name: Option<String>,
}

/// Available capture source
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub source_type: CaptureSourceType,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub app_name: Option<String>,
    pub bundle_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum CaptureSourceType {
    Display,
    Window,
}

/// Cross-platform screen capture manager
pub struct ScreenCaptureManager {
    config: Option<CaptureConfig>,
    is_capturing: bool,
    current_source_id: Option<String>,
}

impl ScreenCaptureManager {
    pub fn new() -> Self {
        Self {
            config: None,
            is_capturing: false,
            current_source_id: None,
        }
    }

    /// Check platform screen capture permission.
    pub async fn check_permission() -> bool {
        false
    }

    /// Request platform screen capture permission.
    pub async fn request_permission() -> bool {
        false
    }

    /// Enumerate available screen capture sources.
    pub async fn enumerate_sources(&mut self) -> Result<Vec<CaptureSource>> {
        Ok(vec![])
    }

    /// Find windows belonging to a specific application.
    pub async fn find_application_windows(&self, _app_name: &str) -> Vec<CaptureSource> {
        vec![]
    }

    /// Find Zen Browser windows specifically.
    pub async fn find_zen_windows(&self) -> Vec<CaptureSource> {
        self.find_application_windows("Zen").await
    }

    /// Configure capture stream with a specific window and dimensions.
    pub async fn configure_stream(&mut self, window_id: u32, _width: u32, _height: u32) -> Result<()> {
        self.config = Some(CaptureConfig {
            window_id: Some(window_id),
            fps: 60,
            format: ImageFormat::Jpeg,
            quality: 85,
            target_app: Some("Zen".to_string()),
        });
        self.current_source_id = Some(format!("window-{}", window_id));
        self.is_capturing = true;
        Ok(())
    }

    /// Capture a single frame from the configured source.
    pub async fn capture_frame(&mut self) -> Result<Option<CapturedFrame>> {
        Ok(None)
    }

    /// Capture frame as JPEG bytes.
    pub async fn capture_frame_jpeg(&mut self) -> Result<Vec<u8>> {
        anyhow::bail!("No frame captured - screen capture not implemented for this platform");
    }

    /// Stop any ongoing capture session.
    pub fn stop_capture(&mut self) -> Result<()> {
        self.is_capturing = false;
        self.current_source_id = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_config_default() {
        let config = CaptureConfig::default();
        assert_eq!(config.fps, 60);
        assert_eq!(config.quality, 85);
        assert_eq!(config.target_app, Some("Zen".to_string()));
    }

    #[test]
    fn test_capture_source_serialization() {
        let source = CaptureSource {
            id: "window-123".to_string(),
            name: "Zen Browser".to_string(),
            source_type: CaptureSourceType::Window,
            width: Some(1920),
            height: Some(1080),
            app_name: Some("Zen".to_string()),
            bundle_id: Some("app.zen.browser".to_string()),
        };
        let json = serde_json::to_string(&source).unwrap();
        assert!(json.contains("Zen Browser"));
        assert!(json.contains("window-123"));
    }

    #[test]
    fn test_capture_frame_serialization() {
        let frame = CapturedFrame {
            timestamp: 1000,
            width: 1920,
            height: 1080,
            data: "base64data".to_string(),
            window_title: Some("Zen Browser".to_string()),
            app_name: Some("Zen".to_string()),
        };
        let json = serde_json::to_string(&frame).unwrap();
        assert!(json.contains("1920"));
        assert!(json.contains("1080"));
        assert!(json.contains("Zen Browser"));
    }
}
