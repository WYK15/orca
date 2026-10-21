use std::{cell::RefCell, ptr::NonNull, time::Duration};

use block2::{DynBlock, RcBlock};
use objc2::{define_class, msg_send, rc::Retained, runtime::ProtocolObject, DefinedClass};
use objc2_foundation::{NSArray, NSBundle, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSettings, UNNotificationSound, UNUserNotificationCenter,
    UNUserNotificationCenterDelegate,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

define_class!(
    #[unsafe(super = NSObject)]
    #[ivars = AppHandle]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            complete: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            complete.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn respond(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            complete: &DynBlock<dyn Fn()>,
        ) {
            let id = response.notification().request().identifier().to_string();
            let action = response.actionIdentifier().to_string();
            let app = self.ivars().clone();
            tauri::async_runtime::spawn(async move {
                let action = if action == "com.apple.UNNotificationDefaultActionIdentifier" {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    "click"
                } else {
                    "close"
                };
                let _ = app
                    .state::<crate::backend::Backend>()
                    .call(
                        "send".into(),
                        "desktop:notification".into(),
                        vec![json!(id), json!(action)],
                    )
                    .await;
            });
            complete.call(());
        }
    }
);

thread_local! {
    // UNUserNotificationCenter only keeps a weak delegate reference.
    static DELEGATE: RefCell<Option<Retained<NotificationDelegate>>> = const { RefCell::new(None) };
}

pub fn initialize(app: &AppHandle) {
    use objc2::AnyThread;
    let Ok(center) = center() else { return };
    let delegate = NotificationDelegate::alloc().set_ivars(app.clone());
    let delegate: Retained<NotificationDelegate> = unsafe { msg_send![super(delegate), init] };
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    DELEGATE.with(|slot| *slot.borrow_mut() = Some(delegate));
}

fn center() -> Result<Retained<UNUserNotificationCenter>, String> {
    // macOS 26 aborts the process when this API is called outside an application bundle.
    if NSBundle::mainBundle().bundleIdentifier().is_none() {
        return Err("Native notifications require the bundled macOS application".into());
    }
    Ok(UNUserNotificationCenter::currentNotificationCenter())
}

async fn authorization() -> Result<&'static str, String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    {
        let callback = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            // The settings object is valid for the lifetime of this completion callback.
            let status = unsafe { settings.as_ref() }.authorizationStatus();
            let status = match status {
                UNAuthorizationStatus::Authorized | UNAuthorizationStatus::Provisional => {
                    "authorized"
                }
                UNAuthorizationStatus::Denied => "denied",
                UNAuthorizationStatus::NotDetermined => "not-determined",
                _ => "unknown",
            };
            let _ = tx.send(status);
        });
        center()?.getNotificationSettingsWithCompletionHandler(&callback);
    }
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .map_err(|_| "Notification settings timed out")?
        .ok_or_else(|| "Notification settings unavailable".into())
}

async fn request_permission() -> Result<(), String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    {
        let callback = RcBlock::new(move |granted: objc2::runtime::Bool, error: *mut NSError| {
            let result = if !error.is_null() {
                Err(unsafe { &*error }.localizedDescription().to_string())
            } else if granted.as_bool() {
                Ok(())
            } else {
                Err("Notifications are blocked by macOS".into())
            };
            let _ = tx.send(result);
        });
        center()?.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert
                | UNAuthorizationOptions::Sound
                | UNAuthorizationOptions::Badge,
            &callback,
        );
    }
    tokio::time::timeout(Duration::from_secs(120), rx.recv())
        .await
        .map_err(|_| "Notification permission is awaiting a decision")?
        .ok_or("Notification permission unavailable")?
}

#[derive(Deserialize)]
struct NotificationContent {
    id: String,
    title: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    silent: bool,
}

pub async fn dispatch(app: &AppHandle, channel: &str, args: &[Value]) -> Result<Value, String> {
    match channel {
        "notification-authorization" => Ok(json!(authorization().await?)),
        "notification-settings" => {
            app.opener().open_url(
                "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.wyk15.orcaw.tauri",
                None::<&str>,
            ).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "notification-dismiss" => {
            let id = args
                .first()
                .and_then(Value::as_str)
                .ok_or("Missing notification identifier")?;
            let ids = NSArray::from_retained_slice(&[NSString::from_str(id)]);
            let center = center()?;
            center.removePendingNotificationRequestsWithIdentifiers(&ids);
            center.removeDeliveredNotificationsWithIdentifiers(&ids);
            Ok(Value::Null)
        }
        "notification-show" => {
            let payload: NotificationContent = serde_json::from_value(
                args.first()
                    .cloned()
                    .ok_or("Missing notification content")?,
            )
            .map_err(|e| e.to_string())?;
            if payload.id.len() > 128 || payload.title.len() > 4096 || payload.body.len() > 16384 {
                return Err("Notification content exceeds limits".into());
            }
            match authorization().await? {
                "authorized" => {}
                "not-determined" => request_permission().await?,
                _ => return Err("Notifications are blocked by macOS".into()),
            }
            show(payload).await?;
            Ok(Value::Null)
        }
        _ => Err("Unknown notification operation".into()),
    }
}

async fn show(payload: NotificationContent) -> Result<(), String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(&payload.title));
        content.setBody(&NSString::from_str(&payload.body));
        if !payload.silent {
            content.setSound(Some(&UNNotificationSound::defaultSound()));
        }
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(&payload.id),
            &content,
            None,
        );
        let callback = RcBlock::new(move |error: *mut NSError| {
            let result = if error.is_null() {
                Ok(())
            } else {
                Err(unsafe { &*error }.localizedDescription().to_string())
            };
            let _ = tx.send(result);
        });
        center()?.addNotificationRequest_withCompletionHandler(&request, Some(&callback));
    }
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .map_err(|_| "Notification submission timed out")?
        .ok_or("Notification submission unavailable")?
}
