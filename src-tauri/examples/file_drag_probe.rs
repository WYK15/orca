//! Native smoke-test source; reuses the App's actual AppKit drag implementation.
#[cfg(target_os = "macos")]
#[path = "../src/file_drag_source.rs"]
mod file_drag_source;

#[cfg(target_os = "macos")]
mod probe {
    use objc2::{
        define_class, msg_send, rc::Retained, runtime::ProtocolObject, DefinedClass,
        MainThreadMarker, MainThreadOnly,
    };
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSEvent, NSScreen,
        NSView, NSWindow, NSWindowStyleMask,
    };
    use objc2_foundation::{NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString};
    use objc2_web_kit::{
        WKScriptMessage, WKScriptMessageHandler, WKUserContentController, WKWebView,
        WKWebViewConfiguration,
    };

    fn start(view: &NSView, paths: Vec<String>, mtm: MainThreadMarker) {
        let copied_paths = paths.clone();
        let result = super::file_drag_source::begin(
            view,
            paths.clone(),
            paths,
            "probe-workspace".into(),
            Box::new(move |copied| {
                assert!(copied_paths
                    .iter()
                    .all(|path| std::path::Path::new(path).exists()));
                println!("{}", serde_json::json!({"copied":copied}));
                std::process::exit(0);
            }),
            mtm,
        );
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        assert!(
            super::file_drag_source::origin_for(&[std::path::PathBuf::from("/different-file")])
                .is_none()
        );
    }

    define_class!(
        #[unsafe(super = NSObject)]
        #[thread_kind = MainThreadOnly]
        #[ivars = Vec<String>]
        struct DragBridge;
        unsafe impl NSObjectProtocol for DragBridge {}
        unsafe impl WKScriptMessageHandler for DragBridge {
            #[unsafe(method(userContentController:didReceiveScriptMessage:))]
            unsafe fn message(&self, _controller: &WKUserContentController, message: &WKScriptMessage) {
                let body = unsafe { message.body() }.downcast::<NSString>().unwrap().to_string();
                if body == "ready" {
                    println!("ready");
                    return;
                }
                assert_eq!(body, "start");
                let window = NSApplication::sharedApplication(self.mtm()).keyWindow().unwrap();
                start(&window.contentView().unwrap(), self.ivars().clone(), self.mtm());
            }
        }
    );

    define_class!(
        #[unsafe(super = NSView)]
        #[thread_kind = MainThreadOnly]
        #[ivars = Vec<String>]
        struct DragView;
        unsafe impl NSObjectProtocol for DragView {}
        impl DragView {
            #[unsafe(method(mouseDown:))]
            fn down(&self, _event: &NSEvent) {}

            #[unsafe(method(mouseDragged:))]
            fn dragged(&self, _event: &NSEvent) {
                start(self, self.ivars().clone(), self.mtm());
            }
        }
    );

    pub fn run() {
        let mtm = MainThreadMarker::new().unwrap();
        let app = NSApplication::sharedApplication(mtm);
        app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
        let screen = NSScreen::mainScreen(mtm).unwrap().frame();
        let frame = NSRect::new(
            NSPoint::new(40.0, screen.size.height - 420.0),
            NSSize::new(380.0, 300.0),
        );
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                frame,
                NSWindowStyleMask::Titled | NSWindowStyleMask::Closable,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        window.setTitle(&NSString::from_str("Orcaw file drag test"));
        let paths: Vec<String> =
            serde_json::from_str(&std::env::args().nth(1).expect("paths JSON")).unwrap();
        let web_mode = std::env::args().any(|arg| arg == "--webview");
        let view = DragView::alloc(mtm).set_ivars(paths.clone());
        let view: Retained<DragView> = unsafe {
            msg_send![super(view), initWithFrame: NSRect::new(NSPoint::new(0.0,0.0), frame.size)]
        };
        window.setContentView(Some(&view));
        if web_mode {
            let bridge = DragBridge::alloc(mtm).set_ivars(paths);
            let bridge: Retained<DragBridge> = unsafe { msg_send![super(bridge), init] };
            unsafe {
                let configuration = WKWebViewConfiguration::new(mtm);
                configuration
                    .userContentController()
                    .addScriptMessageHandler_name(
                        ProtocolObject::from_ref(&*bridge),
                        &NSString::from_str("drag"),
                    );
                let web = WKWebView::initWithFrame_configuration(
                    WKWebView::alloc(mtm),
                    view.bounds(),
                    &configuration,
                );
                view.addSubview(&web);
                web.loadHTMLString_baseURL(&NSString::from_str(r#"<!doctype html><style>body{margin:0}button{width:100vw;height:100vh}</style><button draggable="true">Drag files to Finder</button><script>
                    const post=value=>window.webkit.messageHandlers.drag.postMessage(value);
                    const transfer=new DataTransfer(); transfer.items.add(new File([], 'file'));
                    const event=new DragEvent('dragover', {dataTransfer:transfer});
                    if(event.dataTransfer.types.includes('Files')) post('ready'); else post('unsupported');
                    document.querySelector('button').ondragstart=event=>{event.preventDefault(); setTimeout(()=>post('start'),30)};
                </script>"#), None);
            }
        }
        window.makeKeyAndOrderFront(None);
        app.finishLaunching();
        app.activate();
        if !web_mode {
            println!("ready");
        }
        app.run();
    }
}

fn main() {
    #[cfg(target_os = "macos")]
    probe::run();
}
