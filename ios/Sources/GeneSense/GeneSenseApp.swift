import SwiftUI

@main
struct GeneSenseApp: App {
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

/// The web app fills the screen; the launch mark stays until the first page has loaded.
struct RootView: View {
    @StateObject private var web = WebModel()

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            // Edge to edge: the page itself pads for the Dynamic Island and home bar (env(safe-area-inset-*)).
            WebView(webView: web.webView).ignoresSafeArea()
                .background(BluetoothSheet(ble: web.ble))
            if web.offline {
                OfflineView { web.reload() }.transition(.opacity)
            }
            if !web.ready {
                LaunchView().transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.3), value: web.ready)
        .animation(.easeOut(duration: 0.25), value: web.offline)
        .statusBarHidden(!web.ready)
        .preferredColorScheme(.light)
    }
}

struct WebView: UIViewRepresentable {
    let webView: UIView
    func makeUIView(context: Context) -> UIView { webView }
    func updateUIView(_ view: UIView, context: Context) {}
}

enum Theme {
    static let navy = Color(red: 13 / 255, green: 44 / 255, blue: 84 / 255)
    static let blue = Color(red: 7 / 255, green: 86 / 255, blue: 206 / 255)
    static let ink = Color(red: 16 / 255, green: 38 / 255, blue: 75 / 255)
    static let muted = Color(red: 74 / 255, green: 91 / 255, blue: 120 / 255)
    static let background = Color(red: 245 / 255, green: 249 / 255, blue: 1)
    static let glow = Color(red: 217 / 255, green: 243 / 255, blue: 251 / 255)
    static let pulse = Color(red: 156 / 255, green: 195 / 255, blue: 239 / 255)
}

struct LaunchView: View {
    var body: some View {
        ZStack {
            Theme.navy.ignoresSafeArea()
            VStack(spacing: 14) {
                LogoMark()
                    .frame(width: 52, height: 52)
                    .frame(width: 88, height: 88)
                    .glass(radius: 24, tint: .white.opacity(0.10))
                Text("GeneSense")
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
    }
}

/// The favicon's cross and pulse line, drawn on a 64-point grid.
struct LogoMark: View {
    var body: some View {
        Canvas { context, size in
            let s = size.width / 64
            func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            var cross = Path()
            cross.move(to: point(32, 14)); cross.addLine(to: point(32, 50))
            cross.move(to: point(14, 32)); cross.addLine(to: point(50, 32))
            context.stroke(cross, with: .color(.white), style: StrokeStyle(lineWidth: 9 * s, lineCap: .round))
            var pulse = Path()
            pulse.addLines([point(20, 38), point(27, 38), point(31, 26), point(36, 43), point(40, 34), point(47, 34)])
            context.stroke(pulse, with: .color(Theme.pulse), style: StrokeStyle(lineWidth: 3 * s, lineCap: .round, lineJoin: .round))
        }
    }
}

struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            RadialGradient(colors: [Theme.glow, .clear], center: UnitPoint(x: 0.8, y: 0.1), startRadius: 0, endRadius: 480)
                .ignoresSafeArea()
            VStack(spacing: 10) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(Theme.navy)
                Text("Chưa có kết nối")
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
                Text("Kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button("Thử lại", action: retry)
                    .buttonStyle(RaisedButtonStyle())
                    .padding(.top, 8)
            }
            .padding(28)
            .frame(maxWidth: 340)
            .glass(radius: 26)
            .padding(24)
        }
    }
}

extension View {
    /// Frosted glass: blurred material, a faint tint, and a bright top edge fading down.
    func glass(radius: CGFloat, tint: Color = .white.opacity(0.35)) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(.ultraThinMaterial, in: shape)
            .background(tint, in: shape)
            .overlay(shape.strokeBorder(LinearGradient(colors: [.white.opacity(0.9), .white.opacity(0.25)], startPoint: .top, endPoint: .bottom), lineWidth: 1))
    }
}

/// Flat blue button that sits 2 points proud and presses down, with a light tap.
struct RaisedButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        return configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 30)
            .frame(minHeight: 48)
            .background(shape.fill(Theme.blue))
            .overlay(shape.strokeBorder(LinearGradient(colors: [.white.opacity(0.45), .clear, .black.opacity(0.18)], startPoint: .top, endPoint: .bottom), lineWidth: 1.5))
            .background(shape.fill(Theme.navy.opacity(0.3)).offset(y: pressed ? 0 : 2))
            .offset(y: pressed ? 2 : 0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: pressed)
            .sensoryFeedback(.impact(weight: .light), trigger: pressed) { _, isPressed in isPressed }
    }
}
