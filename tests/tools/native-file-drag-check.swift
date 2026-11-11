import AppKit
import ApplicationServices

// Run after: cargo build --manifest-path src-tauri/Cargo.toml --example file_drag_probe
// Uses only temporary files and its own Finder windows. General clipboard is untouched.
guard AXIsProcessTrusted() else { fatalError("Native drag test needs existing Accessibility access") }
let binary = CommandLine.arguments[1]
let originalApp = NSWorkspace.shared.frontmostApplication
let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
defer {
    try? FileManager.default.removeItem(at: root)
    originalApp?.activate(options: [])
}

func script(_ source: String) throws -> NSAppleEventDescriptor {
    var error: NSDictionary?
    let value = NSAppleScript(source: source)!.executeAndReturnError(&error)
    if let error { throw NSError(domain: "Finder test", code: 1, userInfo: error as? [String: Any]) }
    return value
}

func mouse(_ type: CGEventType, _ x: Double, _ y: Double) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)!.post(tap: .cghidEventTap)
}

func check(_ names: [String], cancel: Bool = false, webview: Bool = false) throws {
    let source = root.appendingPathComponent(UUID().uuidString)
    let destination = root.appendingPathComponent(UUID().uuidString)
    for folder in [source, destination] {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }
    let paths = try names.map { name -> String in
        let item = source.appendingPathComponent(name)
        if name.hasSuffix("folder") {
            try FileManager.default.createDirectory(at: item, withIntermediateDirectories: true)
            try Data("nested content".utf8).write(to: item.appendingPathComponent("nested.txt"))
        } else {
            try Data("original content".utf8).write(to: item)
        }
        return item.path
    }
    let finderID = try script("""
        tell application "Finder"
            set w to make new Finder window to POSIX file "\(destination.path)"
            set bounds of w to {550, 100, 1150, 700}
            set current view of w to icon view
            activate
            return id of w
        end tell
        """).int32Value
    defer { _ = try? script("tell application \"Finder\" to close window id \(finderID)") }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: binary)
    process.arguments = [String(data: try JSONSerialization.data(withJSONObject: paths), encoding: .utf8)!]
    if webview { process.arguments!.append("--webview") }
    let output = Pipe()
    let errors = Pipe()
    process.standardOutput = output
    process.standardError = errors
    try process.run()
    let ready = output.fileHandleForReading.availableData
    guard String(data: ready, encoding: .utf8)?.contains("ready") == true else {
        fatalError("Probe did not start: \(String(data: errors.fileHandleForReading.availableData, encoding: .utf8) ?? "")")
    }
    _ = try script("tell application \"System Events\" to set frontmost of (first application process whose unix id is \(process.processIdentifier)) to true")
    Thread.sleep(forTimeInterval: 0.6)
    mouse(.mouseMoved, 200, 260)
    mouse(.leftMouseDown, 200, 260)
    Thread.sleep(forTimeInterval: 0.1)
    for step in 1...25 {
        mouse(.leftMouseDragged, 200 + Double(step) * 24, 260 + Double(step) * 6)
        Thread.sleep(forTimeInterval: 0.04)
    }
    Thread.sleep(forTimeInterval: 0.25)
    if cancel {
        CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: true)!.post(tap: .cghidEventTap)
        CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: false)!.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.1)
    }
    mouse(.leftMouseUp, 800, 410)
    let deadline = Date().addingTimeInterval(8)
    while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
    if process.isRunning { process.terminate(); process.waitUntilExit(); fatalError("Native drag did not finish: \(String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "")") }
    let result = output.fileHandleForReading.readDataToEndOfFile()
    let error = errors.fileHandleForReading.readDataToEndOfFile()
    guard process.terminationStatus == 0 else {
        fatalError("Native drag failed: \(String(data: error, encoding: .utf8) ?? "")")
    }
    let payload = try JSONSerialization.jsonObject(with: result) as! [String: Bool]
    precondition(payload["copied"] == !cancel, "Unexpected drag result")
    let copyDeadline = Date().addingTimeInterval(4)
    while !cancel && Date() < copyDeadline {
        if names.allSatisfy({ name in
            let relative = name.hasSuffix("folder") ? "\(name)/nested.txt" : name
            return FileManager.default.fileExists(atPath: destination.appendingPathComponent(relative).path)
        }) { break }
        Thread.sleep(forTimeInterval: 0.05)
    }
    for name in names {
        let relative = name.hasSuffix("folder") ? "\(name)/nested.txt" : name
        let original = try Data(contentsOf: source.appendingPathComponent(relative))
        if cancel {
            precondition(!FileManager.default.fileExists(atPath: destination.appendingPathComponent(name).path))
        } else {
            let copied = try Data(contentsOf: destination.appendingPathComponent(relative))
            precondition(copied == original)
        }
    }
    print("PASS \(webview ? "WebKit" : "AppKit") \(cancel ? "cancel" : "copy") \(names)")
}

try check(["中文 file # %.md"])
try check(["a folder"])
try check(["one.txt", "two 中文.md", "nested folder"])
try check(["cancel.txt", "cancel folder"], cancel: true)
try check(["web 中文.md", "web folder"], webview: true)
try check(["web cancel.md"], cancel: true, webview: true)
