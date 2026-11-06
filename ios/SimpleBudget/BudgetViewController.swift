import UIKit
import UniformTypeIdentifiers
import WebKit

/// Serves the embedded Vite build from `SimpleBudget.app/www/` over `simplebudget://app/`
/// so the app runs 100% offline from the native iOS bundle with zero network dependency.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let requestUrl = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(URLError(.badURL))
      return
    }

    let rawPath = requestUrl.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let relativePath = rawPath.isEmpty ? "index.html" : rawPath
    guard let wwwUrl = Bundle.main.resourceURL?.appendingPathComponent("www", isDirectory: true) else {
      urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
      return
    }

    let candidateUrl = wwwUrl.appendingPathComponent(relativePath)
    let fileUrl = FileManager.default.fileExists(atPath: candidateUrl.path)
      ? candidateUrl
      : wwwUrl.appendingPathComponent("index.html")

    do {
      let data = try Data(contentsOf: fileUrl)
      let mimeType = Self.mimeType(for: fileUrl.pathExtension)
      let response = HTTPURLResponse(
        url: requestUrl,
        statusCode: 200,
        httpVersion: "HTTP/1.1",
        headerFields: [
          "Content-Type": mimeType,
          "Content-Length": "\(data.count)",
          "Cache-Control": "no-cache"
        ]
      )!
      urlSchemeTask.didReceive(response)
      urlSchemeTask.didReceive(data)
      urlSchemeTask.didFinish()
    } catch {
      urlSchemeTask.didFailWithError(error)
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

  private static func mimeType(for ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js", "mjs": return "application/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json", "webmanifest": return "application/json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    default:
      if let utType = UTType(filenameExtension: ext), let mime = utType.preferredMIMEType {
        return mime
      }
      return "application/octet-stream"
    }
  }
}

/// Native iOS file storage bridge (`window.webkit.messageHandlers.nativeStorage`).
/// Saves budget state atomically into `Application Support/SimpleBudget/database.json`
/// (with an automatic backup copy `database.backup.json`).
/// - Completely isolated from Safari: clearing Safari cache/history in iOS Settings never affects this directory.
/// - Automatically included in iOS device & iCloud backups with zero user taps.
final class BudgetViewController: UIViewController, WKScriptMessageHandlerWithReply {
  private var webView: WKWebView!

  private static var storageDir: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let dir = base.appendingPathComponent("SimpleBudget", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private static var primaryDbUrl: URL {
    storageDir.appendingPathComponent("database.json")
  }

  private static var backupDbUrl: URL {
    storageDir.appendingPathComponent("database.backup.json")
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "simplebudget")
    config.userContentController.addScriptMessageHandler(
      self,
      contentWorld: .page,
      name: "nativeStorage"
    )

    let bootstrapScript = WKUserScript(
      source: "window.__SIMPLE_BUDGET_NATIVE_IOS__ = true;",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    )
    config.userContentController.addUserScript(bootstrapScript)

    webView = WKWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    view.addSubview(webView)

    if let url = URL(string: "simplebudget://app/index.html") {
      webView.load(URLRequest(url: url))
    }
  }

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard let body = message.body as? [String: Any],
          let action = body["action"] as? String else {
      replyHandler(nil, "Invalid nativeStorage message")
      return
    }

    switch action {
    case "read":
      if let data = try? Data(contentsOf: Self.primaryDbUrl),
         let json = String(data: data, encoding: .utf8) {
        replyHandler(json, nil)
      } else if let backupData = try? Data(contentsOf: Self.backupDbUrl),
                let backupJson = String(data: backupData, encoding: .utf8) {
        replyHandler(backupJson, nil)
      } else {
        replyHandler(nil, nil)
      }

    case "write":
      guard let payload = body["payload"] as? String,
            let data = payload.data(using: .utf8) else {
        replyHandler(nil, "Missing UTF-8 payload")
        return
      }
      do {
        if FileManager.default.fileExists(atPath: Self.primaryDbUrl.path) {
          try? FileManager.default.removeItem(at: Self.backupDbUrl)
          try? FileManager.default.copyItem(at: Self.primaryDbUrl, to: Self.backupDbUrl)
        }
        try data.write(to: Self.primaryDbUrl, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        replyHandler(true, nil)
      } catch {
        replyHandler(nil, error.localizedDescription)
      }

    default:
      replyHandler(nil, "Unknown action: \(action)")
    }
  }
}
