import AppKit

let clipboard = NSPasteboard.general
let saved = (clipboard.pasteboardItems ?? []).map { item -> NSPasteboardItem in
    let copy = NSPasteboardItem()
    for type in item.types {
        if let data = item.data(forType: type) { copy.setData(data, forType: type) }
    }
    return copy
}
let originalCount = clipboard.changeCount
var ownedCount = originalCount
let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
defer {
    if clipboard.changeCount == ownedCount {
        clipboard.clearContents()
        clipboard.writeObjects(saved)
    }
    try? FileManager.default.removeItem(at: directory)
}

let file = directory.appendingPathComponent("中文 文件.md")
let folder = directory.appendingPathComponent("a folder")
try Data("test".utf8).write(to: file)
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

func check(_ objects: [NSPasteboardWriting], expected: [String]) throws {
    guard clipboard.changeCount == ownedCount else {
        throw NSError(domain: "Clipboard changed during the test", code: 1)
    }
    clipboard.clearContents()
    guard clipboard.writeObjects(objects) else {
        throw NSError(domain: "Could not prepare native clipboard fixture", code: 1)
    }
    ownedCount = clipboard.changeCount
    let process = Process()
    process.executableURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["ORCA_CLIPBOARD_TEST_BINARY"]!)
    process.arguments = ["clipboard::tests::reads_native_file_clipboard_fixture", "--ignored", "--exact"]
    var environment = ProcessInfo.processInfo.environment
    environment["ORCA_NATIVE_FILES_EXPECTED"] = String(data: try JSONSerialization.data(withJSONObject: expected), encoding: .utf8)
    process.environment = environment
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
        throw NSError(domain: "Native clipboard read failed", code: Int(process.terminationStatus))
    }
}

try check([file as NSURL, folder as NSURL], expected: [file.path, folder.path])
try check([file.path as NSString], expected: [])
print("PASS: native file URLs preserve multiple files, folders, Unicode and spaces; plain text is not a file reference")
