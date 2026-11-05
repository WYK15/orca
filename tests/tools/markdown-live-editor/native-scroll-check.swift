import AppKit
import WebKit

let environment = ProcessInfo.processInfo.environment
let previousApplication = NSWorkspace.shared.frontmostApplication
let previousPointer = CGEvent(source: nil)?.location

final class ScrollCheck: NSObject, WKNavigationDelegate {
    let window = NSWindow(
        contentRect: NSRect(x: 100, y: 100, width: 1462, height: 1052),
        styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1462, height: 1052))
    let source = try! String(contentsOfFile: environment["ORCA_MARKDOWN_SCROLL_FIXTURE"]!, encoding: .utf8)
    let deltas: [Int32] = [4, 40, 167, 231, 264, 290, 310]
    var finished = false

    func start() {
        window.title = "Orcaw native Markdown scroll check"
        window.contentView = web
        web.navigationDelegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.load(URLRequest(url: URL(string: environment["ORCA_MARKDOWN_CHECK_URL"]!)!))
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { self.finish("Timed out") }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        waitUntil("typeof window.setDocument === 'function'") {
            let serialized = String(data: try! JSONSerialization.data(withJSONObject: ["source": self.source]), encoding: .utf8)!
            let forceQuery = environment["ORCA_MARKDOWN_NATIVE_QUERY_CONTAINER"] == "1"
            self.web.evaluateJavaScript("""
                document.getElementById('root').style.cssText='width:calc(100vw - 244px);margin-left:244px';
                const sidebar=document.createElement('div');
                sidebar.tabIndex=0;
                sidebar.style.cssText='position:absolute;left:0;top:0;width:244px;height:100vh;overflow:auto';
                document.body.append(sidebar);
                sidebar.focus();
                window.setDocument((\(serialized)).source);
                if (\(forceQuery)) document.querySelector('.live-markdown-layout').style.containerType='inline-size';
                """) { _, error in
                if let error { self.finish(error.localizedDescription); return }
                self.waitUntil("!!document.querySelector('.live-md-diagram svg')") {
                    self.waitUntil("document.fonts.status === 'loaded'") {
                        self.prime()
                    }
                }
            }
        }
    }

    func waitUntil(_ script: String, then action: @escaping () -> Void) {
        guard !finished else { return }
        web.evaluateJavaScript(script) { value, error in
            if value as? Bool == true { action() }
            else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    self.waitUntil(script, then: action)
                }
            }
        }
    }

    func prime() {
        web.evaluateJavaScript("window.editor.scrollDOM.scrollTop=100000") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self.web.evaluateJavaScript("window.editor.scrollDOM.scrollTop=0") { _, _ in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.observe() }
                }
            }
        }
    }

    func observe() {
        web.evaluateJavaScript("""
            window.nativeScrollSamples=[];
            window.nativeWheelCount=0;
            const view=window.editor;
            window.nativeBefore=view.state.doc.toString();
            view.scrollDOM.addEventListener('wheel',()=>window.nativeWheelCount++,{passive:true});
            window.nativeSampling=true;
            const sample=()=>{
                window.nativeScrollSamples.push({top:view.scrollDOM.scrollTop,height:view.scrollDOM.scrollHeight,
                  viewportFrom:view.viewport.from});
                if(window.nativeSampling)requestAnimationFrame(sample);
            };
            sample();
            const rect=view.scrollDOM.getBoundingClientRect();
            ({x:rect.left+rect.width*0.65,y:rect.top+rect.height*0.35});
            """) { value, error in
            guard let point = value as? [String: Double], error == nil else {
                self.finish(error?.localizedDescription ?? "Missing scroll viewport"); return
            }
            let screen = self.window.convertPoint(toScreen: self.web.convert(
                NSPoint(x: point["x"]!, y: point["y"]!), to: nil))
            let location = CGPoint(x: screen.x, y: NSScreen.screens[0].frame.height - screen.y)
            CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
                    mouseCursorPosition: location, mouseButton: .left)?.post(tap: .cghidEventTap)
            self.wheel(0, location: location)
        }
    }

    func wheel(_ index: Int, location: CGPoint) {
        guard index < deltas.count * 8 else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.finish(nil) }
            return
        }
        let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1,
                            wheel1: -deltas[index % deltas.count], wheel2: 0, wheel3: 0)!
        event.location = location
        event.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
        event.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: Int64(window.windowNumber))
        event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent,
                                   value: Int64(window.windowNumber))
        event.post(tap: .cghidEventTap)
        let delay = index % deltas.count == deltas.count - 1 ? 0.2 : 0.016
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { self.wheel(index + 1, location: location) }
    }

    func finish(_ error: String?) {
        guard !finished else { return }
        finished = true
        web.evaluateJavaScript("""
            window.nativeSampling=false;
            JSON.stringify({samples:window.nativeScrollSamples||[],wheels:window.nativeWheelCount||0,
              unchanged:window.nativeBefore===window.editor?.state.doc.toString()});
            """) { value, _ in
            let text = value as? String ?? "{}"
            let data = text.data(using: .utf8)!
            let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            let samples = result["samples"] as? [[String: Double]] ?? []
            let wheels = result["wheels"] as? Int ?? 0
            let backwards = zip(samples, samples.dropFirst()).map { $0["top"]! - $1["top"]! }.max() ?? 0
            let maximum = samples.map { $0["top"]! }.max() ?? 0
            let virtualized = samples.contains { ($0["viewportFrom"] ?? 0) > 0 }
            let passed = error == nil && wheels >= 20 && maximum > 1000 && backwards <= 3
                && virtualized && result["unchanged"] as? Bool == true
            let path = URL(fileURLWithPath: environment["ORCA_MARKDOWN_CHECK_ARTIFACTS"]!)
                .appendingPathComponent("native-scroll.json")
            try? data.write(to: path)
            print("\(passed ? "PASS" : "FAIL"): native WKWebView wheel events=\(wheels), maxTop=\(maximum), backward=\(backwards)px \(error ?? "")")
            self.window.orderOut(nil)
            previousApplication?.activate(options: [])
            if let previousPointer {
                CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
                        mouseCursorPosition: previousPointer, mouseButton: .left)?.post(tap: .cghidEventTap)
            }
            exit(passed ? 0 : 1)
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let check = ScrollCheck()
check.start()
app.run()
