# GeneSense iOS app with xtool: plan and roadmap

Status (2026-10-20): owner's answers: iPhone 15 Plus on iOS 18.5, free Apple ID, document scanner first, live site
(fastest: it keeps the same-origin login and the service worker caches it). Phase 1 and the scanner are built in `ios/`;
native screens and in-app dialogs use frosted glass and raised buttons (owner's choice, app only).

## 1. What xtool is

[xtool](https://github.com/xtool-org/xtool) (MIT, latest release 1.22.2 on 2026-10-14, about 13k stars) replaces Xcode
on Linux and on Windows through WSL. It:

- builds a Swift Package (SwiftPM) into an iOS `.app`,
- signs it with your Apple ID and installs it on an iPhone over USB (`xtool dev`),
- talks to Apple Developer Services (certificates, App IDs, provisioning profiles) for you.

What it needs on this PC (Windows 11):

| Item | Notes |
|---|---|
| WSL2 (Ubuntu) | xtool runs inside Linux |
| usbipd-win | passes the iPhone's USB connection into WSL. If it fails with `AFCClient.Error.muxError`, the docs link a workaround that relays the connection through iTunes on Windows |
| Swift 6.4 toolchain for Linux | from swift.org |
| `Xcode.xip` (Xcode 27) | downloaded by hand from developer.apple.com with an Apple ID. xtool only extracts the iOS SDK from it; Xcode itself never runs |
| An iPhone and a USB cable | there is no iOS Simulator on Linux/Windows (xtool issue #311 is still open) |
| An Apple ID | free works. "Password" login uses private Apple APIs, so the xtool docs suggest a throwaway Apple ID |

What it cannot do today:

- **No simulator.** Every test runs on a real iPhone.
- **No App Store or TestFlight upload** (issue #117 is open). Publishing still needs a Mac with Xcode, plus the paid
  Apple Developer Program (99 USD per year).
- **Asset catalogs (app icon) are fragile on WSL.** Issue #310 reports `actool` failing on WSL2 with 1.21.0. Test the icon
  early and keep it optional.
- **Some entitlements are not provisioned** (issue #352: network extensions, data protection, associated domains).
  GeneSense needs none of these.

Free Apple ID versus paid, as it affects GeneSense:

| | Free Apple ID | Paid (99 USD/year) |
|---|---|---|
| Install on your own iPhone | yes | yes |
| App keeps working | 7 days, then run `xtool dev` again | 1 year |
| Apps per device | 3 | no limit |
| HealthKit | yes (xtool marks it free) | yes |
| Bluetooth (CoreBluetooth) | yes, needs no entitlement | yes |
| Local notifications (medicine reminders) | yes, needs no entitlement | yes |
| Remote push notifications | no | yes |
| Give the app to other people / App Store | no | yes, with a Mac for the upload |

The bundle ID gets a prefix such as `XTL-1234.` on device installs. That is expected.

## 2. Why an iOS app at all

GeneSense already works in Safari as a PWA. The app is worth building for what Safari on iPhone cannot do:

1. **Bluetooth.** `frontend/js/ble.js` uses Web Bluetooth (`navigator.bluetooth`). Safari and every iOS browser do not
   support it, so the UNIHIKER K10 cannot sync with an iPhone today. This is the main reason.
2. **Apple Health.** Heart rate and SpO2 from an Apple Watch, and blood pressure from connected cuffs, can be imported
   with HealthKit.
3. **Reliable medicine reminders.** Local notifications fire on time without the app open.
4. **Document scanning.** VisionKit's document camera gives flat, cropped photos for "Giấy tờ", which makes the AI
   reading more accurate.

## 3. Approach: a thin native shell around the existing web app

Recommended: a SwiftUI app with one `WKWebView` that loads https://genesense-five.vercel.app, plus a small native
bridge for the four features above.

Why not a full SwiftUI rewrite: GeneSense has about 2,100 lines of `app.js`, and every screen would need rebuilding and
then maintaining twice. The shell reuses all of it, and web changes reach the app with no rebuild.

Why not Capacitor: it is possible with xtool (issue #310 shows someone doing it), but it adds npm, Capacitor's own
project layout and plugins on top of xtool, and that reporter hit the same `actool` failure. A hand-written shell is
about 300 lines of Swift.

How the bridge works:

- JavaScript to Swift: `window.webkit.messageHandlers.gsNative.postMessage({type: "ble.connect"})`.
- Swift to JavaScript: `webView.evaluateJavaScript("window.gsNative.onReading({...})")`.
- `ble.js` gets one more reading source, used when `window.webkit?.messageHandlers?.gsNative` exists and
  `navigator.bluetooth` does not. The rest of the app does not change; readings arrive in the same shape as today.
- The Swift side reuses the same GATT services as the ESP32 sketch: Heart Rate `0x180D/0x2A37`, Pulse Oximeter
  `0x1822/0x2A5F`, Blood Pressure `0x1810/0x2A35`, values as SFLOAT. The parsers in `ble.js` are ported line for line.

Repository layout (new folder, nothing else moves):

```
ios/
  Package.swift
  xtool.yml            bundleID: vn.genesense.app, infoPath: Info.plist, entitlementsPath: GeneSense.entitlements
  Info.plist           NSBluetoothAlwaysUsageDescription, NSCameraUsageDescription,
                       NSHealthShareUsageDescription, CFBundleDisplayName "GeneSense"
  GeneSense.entitlements   com.apple.developer.healthkit (phase 3 only)
  Sources/GeneSense/
    GeneSenseApp.swift     app entry
    WebShell.swift         WKWebView, bridge, external links open in Safari
    Bluetooth.swift        CoreBluetooth central and the SFLOAT parsers
    Health.swift           HealthKit import (phase 3)
    Reminders.swift        local notifications (phase 3)
```

## 4. Roadmap

Each phase ends with something that runs on the iPhone.

### Phase 0: toolchain (1–2 days)

1. Install WSL2 Ubuntu, usbipd-win, Swift 6.4 and `usbmuxd` / `libimobiledevice-utils`.
2. Download `Xcode.xip` (you do this in the browser; it needs your Apple ID).
3. Install the `xtool` AppImage, run `xtool setup`, log in, point it at the xip.
4. `xtool new Hello`, then `xtool dev` with the iPhone plugged in. Trust the computer, turn on Developer Mode,
   trust the developer profile in Settings > General > VPN & Device Management.

Done when: the template "Hello" app opens on the iPhone.

### Phase 1: web shell (2–3 days)

1. Create `ios/` with the layout above. The web view loads the live site.
2. Log in, all tabs, the profile form, charts and printing the doctor's report work.
3. `<input type="file">` for "Giấy tờ" opens the camera and photo library.
4. Links to other sites open in Safari; a simple offline page when there is no network.

Notes: cookies and `localStorage` persist in the default `WKWebView` data store. The service worker does not run in
`WKWebView` without App-Bound Domains; `app.js` already skips registration when it is unavailable, so leave it off.

Done when: daily use of GeneSense on the iPhone app matches Safari.

### Phase 2: K10 over Bluetooth (3–5 days)

1. `Bluetooth.swift`: scan, connect, subscribe to the three characteristics, parse, send readings to the page.
2. `ble.js`: add the native source; keep Web Bluetooth for Android/desktop Chrome.
3. Test with the K10: readings appear on "Hôm nay" and save with the right source.

Done when: the K10 syncs to the iPhone app the same way it syncs to Chrome on the laptop.

### Phase 3: native extras (pick in this order, 2–4 days each)

1. **Medicine reminders.** Read the schedule from the existing medications API after login and schedule local
   notifications for each slot. Reschedule whenever the medicines list changes.
2. **Apple Health import.** Read heart rate, SpO2 and blood pressure from HealthKit and save them through the existing
   vitals endpoint with a new source value ("Apple Health"). Needs a small backend change: one new value in the
   allowed sources, one test.
3. **Document scanner.** VisionKit's camera for "Thêm giấy tờ"; the scanned image goes into the existing
   `/api/medical-records/analyze` upload.

### Phase 4: polish for demos (1–2 days)

- App icon and launch screen (test `actool` first; if it fails on WSL, ship without the icon for now).
- Vietnamese display name, status bar colour that matches the background glow.
- A re-sign routine: with a free Apple ID the app stops opening after 7 days, so run `xtool dev` the day before any
  demo or contest.

### Phase 5: later, only if needed

- Publishing on the App Store: paid developer account, a Mac with Xcode for the upload, and App Review. Health apps
  are reviewed strictly (guideline 1.4.1): the "not a medical device" notices already in the app are needed, and a
  privacy policy page.
- Remote push notifications (paid account only).

## 5. Risks

| Risk | Mitigation |
|---|---|
| Apple flags the Apple ID for using private-API login | use a separate Apple ID for development |
| USB passthrough into WSL is flaky | the iTunes relay workaround in the xtool docs |
| xtool is young (1.x) and changes often | pin the xtool version that works in `ios/README.md` |
| Free-account apps expire after 7 days | re-sign before demos; move to paid only if others need to install it |
| No simulator, so every test needs the iPhone | keep the shell thin; most testing stays in the browser |

## 6. Decisions for the owner

1. Do you have an iPhone to test on, and which iOS version?
2. Free Apple ID for now, or is the paid program (99 USD/year) planned?
3. Phase 3 order: reminders, Apple Health, scanner. Keep or change?
4. Should the shell load the live site (always current) or a copy bundled into the app (works offline, needs a rebuild
   for every web change)? Recommended: the live site.
