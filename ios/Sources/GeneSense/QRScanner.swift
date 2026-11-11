import AVFoundation
import UIKit

/// Full-screen QR scanner for the GeneSense device's sign-in code. Apple's own detector reads every camera frame,
/// so a code is picked up the moment it is in view; a grid then locks onto its four corners and the scanner closes.
/// Hands back the code's text, or nil when closed. "Nhập mã" lets the person type the code instead.
final class QRScanner: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let done: (String?) -> Void
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "qr.session")
    private let preview = AVCaptureVideoPreviewLayer()
    private let grid = CAShapeLayer()
    private let brackets = CAShapeLayer()
    private let hint = PaddedLabel()
    private var device: AVCaptureDevice?
    private var finished = false

    init(done: @escaping (String?) -> Void) {
        self.done = done
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        preview.session = session
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)

        brackets.strokeColor = UIColor.white.cgColor
        brackets.fillColor = nil
        brackets.lineWidth = 4
        brackets.lineCap = .round
        view.layer.addSublayer(brackets)

        grid.strokeColor = UIColor.systemBlue.cgColor
        grid.fillColor = UIColor.systemBlue.withAlphaComponent(0.22).cgColor
        grid.lineWidth = 3
        grid.lineJoin = .round
        grid.opacity = 0
        view.layer.addSublayer(grid)

        let close = glassButton(symbol: "xmark", label: "Đóng") { [weak self] in self?.finish(nil) }
        let torch = glassButton(symbol: "bolt.fill", label: "Đèn pin") { [weak self] in self?.toggleTorch() }
        let manual = glassButton(symbol: "keyboard", title: "Nhập mã", label: "Nhập mã") { [weak self] in self?.askForCode() }
        hint.text = "Hướng camera vào mã QR trên máy đo"
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 15, weight: .medium)
        hint.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        hint.layer.cornerRadius = 18
        hint.layer.masksToBounds = true
        hint.textAlignment = .center

        for item in [close, torch, manual, hint] as [UIView] {
            item.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(item)
        }
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            close.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 18),
            close.topAnchor.constraint(equalTo: safe.topAnchor, constant: 12),
            close.widthAnchor.constraint(equalToConstant: 46), close.heightAnchor.constraint(equalToConstant: 46),
            torch.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -18),
            torch.topAnchor.constraint(equalTo: safe.topAnchor, constant: 12),
            torch.widthAnchor.constraint(equalToConstant: 46), torch.heightAnchor.constraint(equalToConstant: 46),
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hint.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: 170),
            hint.heightAnchor.constraint(equalToConstant: 36),
            manual.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            manual.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -24),
            manual.heightAnchor.constraint(equalToConstant: 48),
        ])
        startCamera()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview.frame = view.bounds
        // Four corner brackets around a 250 pt square in the middle: where to hold the code.
        let side: CGFloat = 250, arm: CGFloat = 34, r: CGFloat = 14
        let box = CGRect(x: view.bounds.midX - side / 2, y: view.bounds.midY - side / 2 - 20, width: side, height: side)
        let path = UIBezierPath()
        for (corner, dx, dy) in [(CGPoint(x: box.minX, y: box.minY), 1.0, 1.0), (CGPoint(x: box.maxX, y: box.minY), -1.0, 1.0),
                                 (CGPoint(x: box.minX, y: box.maxY), 1.0, -1.0), (CGPoint(x: box.maxX, y: box.maxY), -1.0, -1.0)] {
            path.move(to: CGPoint(x: corner.x, y: corner.y + dy * arm))
            path.addLine(to: CGPoint(x: corner.x, y: corner.y + dy * r))
            path.addQuadCurve(to: CGPoint(x: corner.x + dx * r, y: corner.y), controlPoint: corner)
            path.addLine(to: CGPoint(x: corner.x + dx * arm, y: corner.y))
        }
        brackets.path = path.cgPath
    }

    private func startCamera() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                guard granted else { return self.denied() }
                guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                      let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                    return self.showHint("Không mở được camera.")
                }
                self.device = device
                if (try? device.lockForConfiguration()) != nil {
                    // The code is held close to the lens: focus there first.
                    if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
                    if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
                    device.unlockForConfiguration()
                }
                let output = AVCaptureMetadataOutput()
                self.session.beginConfiguration()
                self.session.sessionPreset = .high
                self.session.addInput(input)
                if self.session.canAddOutput(output) { self.session.addOutput(output) }
                output.setMetadataObjectsDelegate(self, queue: .main)
                output.metadataObjectTypes = [.qr]
                self.session.commitConfiguration()
                let session = self.session
                self.queue.async { session.startRunning() }
            }
        }
    }

    private func denied() {
        showHint("Chưa được phép dùng camera")
        let alert = UIAlertController(title: "Cần quyền dùng camera",
                                      message: "Bật camera cho GeneSense trong Cài đặt để quét mã, hoặc nhập mã bằng tay.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Mở Cài đặt", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        alert.addAction(UIAlertAction(title: "Để sau", style: .cancel))
        present(alert, animated: true)
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished, let code = objects.first as? AVMetadataMachineReadableCodeObject, let text = code.stringValue, !text.isEmpty,
              let seen = preview.transformedMetadataObject(for: code) as? AVMetadataMachineReadableCodeObject, seen.corners.count == 4 else { return }
        finished = true
        lockGrid(on: seen.corners)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        showHint("Đã nhận mã máy đo", color: .systemBlue)
        let session = self.session
        queue.async { session.stopRunning() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.close(with: text) }
    }

    /// The code's outline with a 4 x 4 grid inside it, following the code's tilt and perspective.
    private func lockGrid(on c: [CGPoint]) {
        func lerp(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint { CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t) }
        let path = UIBezierPath()
        path.move(to: c[0]); path.addLine(to: c[1]); path.addLine(to: c[2]); path.addLine(to: c[3]); path.close()
        for t in [0.25, 0.5, 0.75] as [CGFloat] {
            path.move(to: lerp(c[0], c[1], t)); path.addLine(to: lerp(c[3], c[2], t))
            path.move(to: lerp(c[1], c[2], t)); path.addLine(to: lerp(c[0], c[3], t))
        }
        grid.path = path.cgPath
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.duration = 0.15
        grid.add(fade, forKey: "fade")
        grid.opacity = 1
        brackets.opacity = 0
    }

    private func showHint(_ text: String, color: UIColor = UIColor.black.withAlphaComponent(0.45)) {
        hint.text = text
        hint.backgroundColor = color
    }

    private func toggleTorch() {
        guard let device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = device.torchMode == .on ? .off : .on
        device.unlockForConfiguration()
    }

    private func askForCode() {
        let alert = UIAlertController(title: "Nhập mã máy đo", message: "Mã gồm 8 chữ và số, trên màn hình máy đo.", preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "ABCD 2345"
            field.autocapitalizationType = .allCharacters
            field.autocorrectionType = .no
        }
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel))
        alert.addAction(UIAlertAction(title: "Kết nối", style: .default) { [weak self, weak alert] _ in
            let text = alert?.textFields?.first?.text?.trimmingCharacters(in: .whitespaces) ?? ""
            if !text.isEmpty { self?.finish(text) }
        })
        present(alert, animated: true)
    }

    private func finish(_ text: String?) {
        finished = true
        let session = self.session
        queue.async { session.stopRunning() }
        close(with: text)
    }

    private func close(with text: String?) {
        dismiss(animated: true) { self.done(text) }
    }

    private func glassButton(symbol: String, title: String? = nil, label: String, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold))
        config.title = title
        config.imagePadding = 8
        config.baseForegroundColor = .white
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: title == nil ? 0 : 22, bottom: 0, trailing: title == nil ? 0 : 22)
        config.background.visualEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        let button = UIButton(configuration: config, primaryAction: UIAction { _ in action() })
        button.accessibilityLabel = label
        return button
    }
}

/// A label with room around its text, for the hint pill.
private final class PaddedLabel: UILabel {
    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + 32, height: size.height)
    }
}
