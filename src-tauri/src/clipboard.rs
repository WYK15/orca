use arboard::{Clipboard, Error as ClipboardError, ImageData};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageEncoder, ImageFormat, ImageReader, Limits};
use serde_json::{json, Value};
use std::{borrow::Cow, io::Cursor, path::Path, sync::Mutex};

const MAX_SOURCE_BYTES: usize = 18 * 1024 * 1024;
const MAX_BASE64_CHARS: usize = 24 * 1024 * 1024;
const MAX_PIXELS: u64 = 32 * 1024 * 1024;

#[derive(Default)]
pub struct NativeClipboard(Mutex<Option<Clipboard>>);

impl NativeClipboard {
    pub fn dispatch(&self, channel: &str, args: &[Value]) -> Result<Value, String> {
        let mut state = self.0.lock().map_err(|e| e.to_string())?;
        if state.is_none() {
            *state = Some(Clipboard::new().map_err(|e| e.to_string())?);
        }
        let clipboard = state.as_mut().ok_or("Clipboard unavailable")?;
        let text = || {
            args.first()
                .and_then(Value::as_str)
                .ok_or("Missing clipboard data")
        };
        match channel {
            "clipboard-read" => match clipboard.get_text() {
                Ok(text) => Ok(json!(text)),
                Err(ClipboardError::ContentNotAvailable) => Ok(json!("")),
                Err(error) => Err(error.to_string()),
            },
            "clipboard-write" => {
                clipboard.set_text(text()?).map_err(|e| e.to_string())?;
                Ok(Value::Null)
            }
            "clipboard-read-image" => match clipboard.get_image() {
                Ok(image) => {
                    encode_image(image.width, image.height, &image.bytes).map(|png| json!(png))
                }
                Err(ClipboardError::ContentNotAvailable) => Ok(Value::Null),
                Err(error) => Err(error.to_string()),
            },
            "clipboard-write-image" => {
                let image = decode_image(text()?)?;
                clipboard
                    .set_image(ImageData {
                        width: image.width() as usize,
                        height: image.height() as usize,
                        bytes: Cow::Owned(image.into_raw()),
                    })
                    .map_err(|e| e.to_string())?;
                Ok(Value::Null)
            }
            "clipboard-write-file" => {
                let path = Path::new(text()?);
                if !path.is_absolute() || !path.exists() {
                    return Err("Invalid clipboard file path".into());
                }
                clipboard
                    .set()
                    .file_list(&[path])
                    .map_err(|e| e.to_string())?;
                Ok(Value::Null)
            }
            "clipboard-read-selection" | "clipboard-write-selection" => {
                selection(clipboard, channel, args.first().and_then(Value::as_str))
            }
            _ => Err("Unknown clipboard operation".into()),
        }
    }

    pub fn cleanup(&self) {
        if let Ok(mut state) = self.0.lock() {
            state.take();
        }
    }
}

#[cfg(target_os = "linux")]
fn selection(
    clipboard: &mut Clipboard,
    channel: &str,
    text: Option<&str>,
) -> Result<Value, String> {
    use arboard::{GetExtLinux, LinuxClipboardKind, SetExtLinux};
    if channel == "clipboard-write-selection" {
        clipboard
            .set()
            .clipboard(LinuxClipboardKind::Primary)
            .text(text.ok_or("Missing text")?)
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    } else {
        match clipboard
            .get()
            .clipboard(LinuxClipboardKind::Primary)
            .text()
        {
            Ok(text) => Ok(json!(text)),
            Err(ClipboardError::ContentNotAvailable) => Ok(json!("")),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn selection(_: &mut Clipboard, channel: &str, _: Option<&str>) -> Result<Value, String> {
    // Primary selection is a Linux clipboard, separate from normal copy/paste.
    Ok(if channel == "clipboard-read-selection" {
        json!("")
    } else {
        Value::Null
    })
}

fn validate_dimensions(width: u64, height: u64) -> Result<(), String> {
    if width == 0
        || height == 0
        || width
            .checked_mul(height)
            .is_none_or(|pixels| pixels > MAX_PIXELS)
    {
        return Err("Clipboard image is too large".into());
    }
    Ok(())
}

fn decode_image(content: &str) -> Result<image::RgbaImage, String> {
    if content.len() > MAX_BASE64_CHARS {
        return Err("Clipboard image is too large".into());
    }
    let bytes = STANDARD.decode(content).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("Clipboard image is too large".into());
    }
    let mut reader = ImageReader::with_format(Cursor::new(&bytes), ImageFormat::Png);
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_PIXELS * 4);
    reader.limits(limits);
    let dimensions = ImageReader::with_format(Cursor::new(&bytes), ImageFormat::Png)
        .into_dimensions()
        .map_err(|e| e.to_string())?;
    validate_dimensions(dimensions.0 as u64, dimensions.1 as u64)?;
    reader
        .decode()
        .map(|image| image.into_rgba8())
        .map_err(|e| e.to_string())
}

fn encode_image(width: usize, height: usize, rgba: &[u8]) -> Result<String, String> {
    validate_dimensions(width as u64, height as u64)?;
    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
        .write_image(
            rgba,
            width as u32,
            height as u32,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;
    if png.len() > MAX_SOURCE_BYTES {
        return Err("Clipboard image is too large".into());
    }
    Ok(STANDARD.encode(png))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_png_pixels_and_rejects_invalid_images() {
        let rgba = [255, 0, 128, 255, 0, 255, 64, 128];
        let encoded = encode_image(2, 1, &rgba).unwrap();
        assert_eq!(decode_image(&encoded).unwrap().as_raw(), &rgba);
        assert!(decode_image(&STANDARD.encode(b"not a PNG")).is_err());
        assert!(decode_image(&"A".repeat(MAX_BASE64_CHARS + 1)).is_err());
        assert!(validate_dimensions(u64::MAX, 2).is_err());
        assert!(validate_dimensions(MAX_PIXELS + 1, 1).is_err());
        assert!(validate_dimensions(0, 1).is_err());
    }
}
