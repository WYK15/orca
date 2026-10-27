use serde_json::{json, Value};
use tauri::AppHandle;

#[cfg(target_os = "macos")]
fn current_id() -> Option<String> {
    use std::ffi::{c_char, c_void, CStr};

    #[link(name = "Carbon", kind = "framework")]
    extern "C" {
        fn TISCopyCurrentKeyboardInputSource() -> *const c_void;
        fn TISGetInputSourceProperty(source: *const c_void, key: *const c_void) -> *const c_void;
        static kTISPropertyInputSourceID: *const c_void;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: *const c_void);
        fn CFStringGetLength(value: *const c_void) -> isize;
        fn CFStringGetCString(
            value: *const c_void,
            buffer: *mut c_char,
            size: isize,
            encoding: u32,
        ) -> u8;
    }

    // The source owns the borrowed ID until CFRelease; dispatch keeps TIS on the main thread.
    unsafe {
        let source = TISCopyCurrentKeyboardInputSource();
        if source.is_null() {
            return None;
        }
        let id = TISGetInputSourceProperty(source, kTISPropertyInputSourceID);
        let result = if id.is_null() {
            None
        } else {
            let mut buffer = vec![0 as c_char; (CFStringGetLength(id) as usize) * 4 + 1];
            if CFStringGetCString(id, buffer.as_mut_ptr(), buffer.len() as isize, 0x08000100) != 0 {
                CStr::from_ptr(buffer.as_ptr())
                    .to_str()
                    .ok()
                    .map(str::to_owned)
            } else {
                None
            }
        };
        CFRelease(source);
        result
    }
}

pub async fn read(app: &AppHandle) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        let (send, receive) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = send.send(current_id());
        })
        .map_err(|error| error.to_string())?;
        Ok(json!(receive.await.map_err(|error| error.to_string())?))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(Value::Null)
    }
}
