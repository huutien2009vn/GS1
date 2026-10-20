# GeneSense for iPhone

A native shell around https://genesense-five.vercel.app, built on Windows with [xtool](https://github.com/xtool-org/xtool)
(no Mac, no Xcode app). Plan and roadmap: `docs/plans/ios-app-xtool.md`.

What the shell adds to the web app:

- **Document scanner.** In "Giấy tờ", "Quét giấy tờ" opens Apple's scanner (finds the page edges, flattens the photo).
  Up to 4 pages are joined into one JPEG under 8 MB and go through the normal upload.
- **Bluetooth.** iPhone browsers have no Web Bluetooth, so "Kết nối" opens a native picker (devices advertising
  heart rate, SpO₂, blood pressure or glucose, or named `GeneSense…`). The app subscribes and forwards raw
  notification bytes to `frontend/js/ble.js`, which parses them exactly as on Chrome (`Bluetooth.swift`).
- **Fast start.** The site is an app-bound domain (`WKAppBoundDomains` in `Info.plist`), so its service worker runs
  and the app opens from cache.
- **App feel.** Launch mark, offline screen, no zoom on form fields, printing the doctor's report through AirPrint or
  Save to PDF, "Lưu ảnh" through the share sheet, other sites open in Safari.
- **Look.** Frosted dialogs and raised buttons, only inside the app: CSS under `.ios-app` in
  `frontend/assets/styles.css`. The website is unchanged.

Files: `Sources/GeneSense/GeneSenseApp.swift` (screens and style), `WebModel.swift` (web view and bridge),
`Scanner.swift` (scanner and page joining). The icon is `Resources/AppIcon.svg`; rebuild the PNG with
`rsvg-convert -w 1024 -h 1024 Resources/AppIcon.svg -o Resources/AppIcon.png`.

## Build and install (Windows)

One-time setup: WSL Ubuntu on `F:\WSL\Ubuntu` with Swift 6.4.1 (`/opt/swift`), `zip`, libimobiledevice and xtool,
then `xtool setup` with the Apple ID.

The iPhone connects through Windows, not USB passthrough: usbipd attached the phone but garbled the data mid-install
(`Mux error (-8)`). What works:

- the **Apple Devices** app (Microsoft Store), which runs Apple's driver on `127.0.0.1:27015`;
- WSL in mirrored networking (`C:\Users\TBB\.wslconfig`: `networkingMode=mirrored`, `hostAddressLoopback=true`);
- in Ubuntu, `USBMUXD_SOCKET_ADDRESS=127.0.0.1:27015` (set in `/etc/bash.bashrc`) and Ubuntu's own usbmuxd masked.

1. Plug in the iPhone, unlock it. `idevice_id -l` in Ubuntu should list it.
2. In Ubuntu:
   ```
   cd "/mnt/f/CLAUDE CODE/GeneSense-share/ios"
   xtool dev
   ```
3. First run only: tap Trust on the iPhone, turn on Developer Mode (Settings > Privacy & Security), then
   Settings > General > VPN & Device Management > your Apple ID > Trust.

With a free Apple ID the app stops opening after 7 days. Run `xtool dev` again to renew it, for example the day
before a demo.
