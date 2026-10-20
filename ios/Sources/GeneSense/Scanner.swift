import UIKit
import VisionKit

/// Delegate for Apple's document scanner. Hands back one JPEG of all pages, or nil when cancelled.
/// VisionKit calls the delegate on the main thread, hence the main-actor conformance.
@MainActor
final class Scanner: NSObject, @MainActor VNDocumentCameraViewControllerDelegate {
    private let done: (Data?) -> Void

    init(done: @escaping (Data?) -> Void) {
        self.done = done
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        let pages = (0..<min(scan.pageCount, Self.maxPages)).map { scan.imageOfPage(at: $0) }
        controller.dismiss(animated: true)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        Task.detached(priority: .userInitiated) {
            let jpeg = Scanner.jpeg(joining: pages)
            await MainActor.run { self.done(jpeg) }
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        done(nil)
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true)
        done(nil)
    }

    // ponytail: pages past the fourth are dropped; the AI reads one image, and taller images lose detail.
    static let maxPages = 4

    /// Pages stacked top to bottom at 1600 px wide, as one JPEG under the server's 8 MB limit.
    nonisolated static func jpeg(joining pages: [UIImage]) -> Data? {
        guard !pages.isEmpty else { return nil }
        let width: CGFloat = 1600
        let heights = pages.map { width * $0.size.height / max($0.size.width, 1) }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = CGSize(width: width, height: heights.reduce(0, +))
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            var y: CGFloat = 0
            for (page, height) in zip(pages, heights) {
                page.draw(in: CGRect(x: 0, y: y, width: width, height: height))
                y += height
            }
        }
        for quality in [0.8, 0.6, 0.4] as [CGFloat] {
            if let data = image.jpegData(compressionQuality: quality), data.count < 7_500_000 { return data }
        }
        return nil
    }
}
