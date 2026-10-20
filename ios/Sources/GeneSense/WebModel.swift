import SwiftUI
import VisionKit
import WebKit

/// Owns the web view that shows https://genesense-five.vercel.app and the bridge the page talks to.
///
/// Page to app: `window.gsNative.scan()` (document scanner, resolves to a JPEG Blob or null) and `window.print()`.
/// Everything else is the normal web app; the page knows it runs here by the `ios-app` class on <html>.
@MainActor
final class WebModel: NSObject, ObservableObject {
    static let home = URL(string: "https://genesense-five.vercel.app/")!

    @Published var ready = false
    @Published var offline = false
    let webView: WKWebView
    private var scanner: Scanner?
    private var downloads: [ObjectIdentifier: URL] = [:]

    override init() {
        let config = WKWebViewConfiguration()
        config.limitsNavigationsToAppBoundDomains = true
        config.applicationNameForUserAgent = "GeneSenseiOS/1.0"
        let scripts = WKUserContentController()
        scripts.addUserScript(WKUserScript(source: Self.bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = scripts
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        // ponytail: the content controller keeps this model alive; fine while it lives as long as the app.
        scripts.add(self, name: "gsNative")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Theme.background)
        webView.scrollView.backgroundColor = UIColor(Theme.background)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: Self.home))
        // Never keep the launch mark up longer than this on a slow network.
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.ready = true }
    }

    func reload() {
        offline = false
        if webView.url == nil { webView.load(URLRequest(url: Self.home)) } else { webView.reload() }
    }

    private func topController() -> UIViewController? {
        var top = webView.window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    private func scan(id: Int) {
        guard VNDocumentCameraViewController.isSupported, let top = topController() else { return finishScan(id, nil) }
        let scanner = Scanner { [weak self] jpeg in self?.finishScan(id, jpeg) }
        self.scanner = scanner
        let camera = VNDocumentCameraViewController()
        camera.delegate = scanner
        top.present(camera, animated: true)
    }

    private func finishScan(_ id: Int, _ jpeg: Data?) {
        scanner = nil
        let value = jpeg.map { "\"" + $0.base64EncodedString() + "\"" } ?? "null"
        webView.evaluateJavaScript("window.gsNative._resolve(\(id), \(value))", completionHandler: nil)
    }

    private func printPage() {
        let printer = UIPrintInteractionController.shared
        printer.printFormatter = webView.viewPrintFormatter()
        _ = printer.present(animated: true)
    }

    private func share(_ url: URL) {
        topController()?.present(UIActivityViewController(activityItems: [url], applicationActivities: nil), animated: true)
    }

    private static let bridge = """
    (() => {
      const mark = () => document.documentElement && document.documentElement.classList.add("ios-app");
      mark();
      const pending = new Map();
      let next = 0;
      const post = message => window.webkit.messageHandlers.gsNative.postMessage(message);
      window.gsNative = {
        scan: () => new Promise(resolve => { const id = ++next; pending.set(id, resolve); post({ type: "scan", id }); }),
        _resolve(id, base64) {
          const resolve = pending.get(id);
          pending.delete(id);
          if (resolve) resolve(base64 ? new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: "image/jpeg" }) : null);
        }
      };
      window.print = () => post({ type: "print" });
      addEventListener("DOMContentLoaded", () => {
        mark();
        // App feel: no zoom when a form field gets focus; the page fills the screen under the Dynamic Island.
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) viewport.content += ", maximum-scale=1, viewport-fit=cover";
      });
    })();
    """
}

extension WebModel: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        switch body["type"] as? String {
        case "scan": scan(id: body["id"] as? Int ?? 0)
        case "print": printPage()
        default: break
        }
    }
}

extension WebModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        if action.shouldPerformDownload { return .download }
        guard let url = action.request.url else { return .cancel }
        if url.host == Self.home.host || ["about", "blob", "data"].contains(url.scheme ?? "") { return .allow }
        // Other sites, phone numbers and mail open in their own apps.
        await UIApplication.shared.open(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        offline = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    private func failed(_ error: Error) {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain, error.code != NSURLErrorCancelled else { return }
        offline = true
        ready = true
    }
}

extension WebModel: WKUIDelegate {
    /// Links with target="_blank" open in Safari instead of being dropped.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }
}

extension WebModel: WKDownloadDelegate {
    /// Saved files ("Lưu ảnh") land in a temporary file, then the share sheet offers Save Image, Files, AirDrop.
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(suggestedFilename)
        try? FileManager.default.removeItem(at: url)
        downloads[ObjectIdentifier(download)] = url
        return url
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { share(url) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
    }
}
