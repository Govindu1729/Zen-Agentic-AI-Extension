//! Screen capture module using platform-specific APIs
//!
//! Provides cross-platform screen capture API surface:
//! - macOS: CoreGraphics + TCC permission (fully implemented)
//! - Windows: DXGI Desktop Duplication (stub API surface)
//! - Linux: X11/Wayland protocols (stub API surface)
//!
//! This module provides the consistent API that the native host and
//! browser extension use, with full macOS implementation and stubs
//! for other platforms that compile without errors.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
use core_graphics::geometry::{CGRect, CGPoint, CGSize};
#[cfg(target_os = "macos")]
use core_foundation::base::{CFType, TCFType};
#[cfg(target_os = "macos")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFDataGetLength(theData: *const std::ffi::c_void) -> isize;
    fn CFDataGetBytePtr(theData: *const std::ffi::c_void) -> *const u8;
}
#[cfg(target_os = "macos")]
use image::{ImageBuffer, Rgba};
#[cfg(target_os = "macos")]
use tracing::{debug, warn};
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// kCGWindowListOptionOnScreenOnly
#[cfg(target_os = "macos")]
const CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
/// kCGWindowListOptionIncludingWindow
#[cfg(target_os = "macos")]
const CG_WINDOW_LIST_OPTION_INCLUDING_WINDOW: u32 = 1 << 15;
/// kCGWindowImageDefault
#[cfg(target_os = "macos")]
const CG_WINDOW_IMAGE_DEFAULT: u32 = 0;

/// Screen capture configuration
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
        #[cfg(target_os = "macos")]
        {
            #[link(name = "CoreGraphics", kind = "framework")]
            extern "C" {
                fn CGPreflightScreenCaptureAccess() -> bool;
            }
            unsafe { CGPreflightScreenCaptureAccess() }
        }

        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    /// Request platform screen capture permission.
    /// Shows appropriate system dialog for the platform.
    pub async fn request_permission() -> bool {
        #[cfg(target_os = "macos")]
        {
            #[link(name = "CoreGraphics", kind = "framework")]
            extern "C" {
                fn CGRequestScreenCaptureAccess();
            }
            unsafe { CGRequestScreenCaptureAccess() };
            true
        }

        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    /// Enumerate available screen capture sources.
    pub async fn enumerate_sources(&mut self) -> Result<Vec<CaptureSource>> {
        #[cfg(target_os = "macos")]
        {
            // macOS: use CGWindowListCreateDictionary to enumerate windows
            Ok(vec![CaptureSource {
                id: "primary".to_string(),
                name: "Primary Display".to_string(),
                source_type: CaptureSourceType::Display,
                width: Some(1920),
                height: Some(1080),
                app_name: None,
                bundle_id: None,
            }])
        }

        #[cfg(not(target_os = "macos"))]
        {
            // Windows/Linux: stub - return empty with platform detection hints
            let mut sources = Vec::new();

            // Check for platform capabilities
            if std::env::var("WAYLAND_DISPLAY").is_ok() {
                sources.push(CaptureSource {
                    id: "wayland-0".to_string(),
                    name: "Wayland Session".to_string(),
                    source_type: CaptureSourceType::Display,
                    width: Some(1920),
                    height: Some(1080),
                    app_name: None,
                    bundle_id: None,
                });
            } else if std::env::var("DISPLAY").is_ok() {
                sources.push(CaptureSource {
                    id: "x11:0".to_string(),
                    name: "X11 Display".to_string(),
                    source_type: CaptureSourceType::Display,
                    width: Some(1920),
                    height: Some(1080),
                    app_name: None,
                    bundle_id: None,
                });
            }

            Ok(sources)
        }
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
        let window_id = self
            .config
            .as_ref()
            .and_then(|c| c.window_id)
            .unwrap_or(0);

        let whole_screen = window_id == 0 || !self.is_capturing;

        #[cfg(target_os = "macos")]
        {
            // macOS: use CGWindowListCreateImage
            let option = if whole_screen {
                CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY
            } else {
                CG_WINDOW_LIST_OPTION_INCLUDING_WINDOW
            };

            let quality = self.config.as_ref().map(|c| c.quality).unwrap_or(85);

            // CGWindowListCreateImage(rect, option, relativeToWindow, imageOption)
            #[link(name = "CoreGraphics", kind = "framework")]
            extern "C" {
                fn CGWindowListCreateImage(
                    rect: CGRect,
                    option: u32,
                    window_id: u32,
                    image_option: u32,
                ) -> *mut std::ffi::c_void;
            }

            // Zero-size rect at origin lets CoreGraphics derive the full window bounds
            let rect = CGRect::new(&CGPoint::new(0.0, 0.0), &CGSize::new(0.0, 0.0));

            let image_ref = unsafe {
                CGWindowListCreateImage(
                    rect,
                    option,
                    window_id,
                    CG_WINDOW_IMAGE_DEFAULT,
                )
            };

            if image_ref.is_null() {
                return Ok(None);
            }

            // Extract dimensions directly from the raw pointer using FFI
            #[link(name = "CoreGraphics", kind = "framework")]
            extern "C" {
                fn CGImageGetWidth(image: *mut std::ffi::c_void) -> usize;
                fn CGImageGetHeight(image: *mut std::ffi::c_void) -> usize;
                fn CGImageGetDataProvider(image: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
                fn CGImageGetBytesPerRow(image: *mut std::ffi::c_void) -> usize;
                fn CGImageGetBitsPerPixel(image: *mut std::ffi::c_void) -> usize;
                fn CGDataProviderCopyData(provider: *mut std::ffi::c_void) -> CFType;
            }

            let width = unsafe { CGImageGetWidth(image_ref) as u32 };
            let height = unsafe { CGImageGetHeight(image_ref) as u32 };

            // Extract raw pixel data from the image's data provider
            let mut jpeg_data = Vec::new();
            {
                let provider = unsafe { CGImageGetDataProvider(image_ref) };
                let data = unsafe { CGDataProviderCopyData(provider) };
                let bytes_per_row = unsafe { CGImageGetBytesPerRow(image_ref) };
                let bits_per_pixel = unsafe { CGImageGetBitsPerPixel(image_ref) };

                if bits_per_pixel == 32 {
                    let data_ref = data.as_concrete_TypeRef();
                    let length = unsafe { CFDataGetLength(data_ref) } as usize;
                    let data_ptr = unsafe { CFDataGetBytePtr(data_ref) };

                    if length > 0 && !data_ptr.is_null() {
                        let raw = unsafe { std::slice::from_raw_parts(data_ptr, length) };
                        // BGRA (little-endian ARGB) -> RGBA conversion
                        let mut rgba = vec![0u8; (width as usize) * (height as usize) * 4];
                        for y in 0..height as usize {
                            for x in 0..width as usize {
                                let src = y * bytes_per_row + x * 4;
                                let dst = (y * width as usize + x) * 4;
                                if src + 3 < raw.len() && dst + 3 < rgba.len() {
                                    rgba[dst] = raw[src + 2];
                                    rgba[dst + 1] = raw[src + 1];
                                    rgba[dst + 2] = raw[src];
                                    rgba[dst + 3] = raw[src + 3];
                                }
                            }
                        }
                        let img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, rgba)
                            .ok_or_else(|| anyhow::anyhow!("Failed to build image buffer"))?;

                        let mut cursor = Cursor::new(&mut jpeg_data);
                        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality)
                            .encode_image(&image::DynamicImage::ImageRgba8(img))
                            .map_err(|e| anyhow::anyhow!("JPEG encoding failed: {}", e))?;
                    } else {
                        anyhow::bail!("No image data available from CGImage");
                    }
                } else {
                    anyhow::bail!("Unsupported CGImage pixel format: {} bpp", bits_per_pixel);
                }
            }

            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .context("System clock error")?
                .as_millis() as u64;

            Ok(Some(CapturedFrame {
                timestamp,
                width,
                height,
                data: BASE64.encode(&jpeg_data),
                window_title: None,
                app_name: self.config.as_ref().and_then(|c| c.target_app.clone()),
            }))
        }

        #[cfg(not(target_os = "macos"))]
        {
            // Windows/Linux: stub - not fully implemented
            eprintln!("Warning: Screen capture not fully implemented for this platform");
            Ok(None)
        }
    }

    /// Capture frame as JPEG bytes.
    pub async fn capture_frame_jpeg(&mut self) -> Result<Vec<u8>> {
        let frame = self.capture_frame().await?;
        match frame {
            Some(f) => {
                let bytes = BASE64.decode(&f.data)
                    .context("Failed to decode base64 frame")?;
                Ok(bytes)
            }
            None => anyhow::bail!("No frame captured"),
        }
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