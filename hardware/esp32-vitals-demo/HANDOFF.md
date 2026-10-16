# Handoff: ESP32-S3 vitals board (GeneSense-Vitals)

Written 13 October 2026 for the next Claude agent. Everything below was found or tested with the owner on 11 October 2026. Read it fully before suggesting changes; several "obvious" fixes were already tried and failed.

## 1. What this is

The owner has a small ESP32-S3 board with an OLED screen and a speaker. It now runs **GeneSense-Vitals**, an Arduino sketch that pretends to be a Bluetooth health monitor. It sends **mock** heart rate, SpO₂ and blood pressure to the owner's web app **GeneSense** (a Vietnamese chronic-disease home-tracking PWA), which reads them through Web Bluetooth with no app change.

The next planned step is a **MAX30102** sensor, so the board sends **real** heart rate and SpO₂ instead of mock values (section 8).

## 2. Files and where things live

| What | Where |
|---|---|
| Working sketch (this folder) | `C:\Users\TBB\Documents\Arduino\genesense\genesense.ino` |
| This handoff | `C:\Users\TBB\Documents\Arduino\genesense\HANDOFF.md` |
| GeneSense project (on an external SSD, **may be unplugged**) | `F:\CLAUDE CODE\GeneSense-share` |
| GeneSense repository (private) | https://github.com/yosidalogarit/genesense |
| Copy of the sketch in the repo | `hardware/esp32-vitals-demo/esp32-vitals-demo.ino` + `README.md`, added in PR #36 (`docs/esp32-board` branch). PR #36 was open at the last check; the repo copy has comment-only differences (a header, and an updated note on the brownout line). |
| GeneSense's Bluetooth reader | `frontend/js/ble.js` in the repo |
| GeneSense project handoff | `HANDOFF.md` in the repo; section 3 has an "ESP32 demo board" summary of this file |
| Live site | https://genesense-five.vercel.app |

If the SSD is unplugged, do not panic and do not recreate the project; ask the owner to plug it in when repo work is needed.

## 3. The hardware

- **Board:** silkscreen "XH-S3E-AI_V1.0". Module: Sparkle IoT **XH-S3E**, label **N16R8** = ESP32-S3 with 16 MB flash and 8 MB octal PSRAM. USB-C. 3.3 V regulator: **AMS1117-3.3** (SOT-223, near the USB-C port).
- **It came with XiaoZhi AI firmware** (open-source voice assistant, github.com/78/xiaozhi-esp32). The board matches XiaoZhi's **"bread-compact-wifi"** layout with a 128×64 OLED.

### Pins confirmed by testing

| Part | Pins | Notes |
|---|---|---|
| OLED 0.96" SSD1306, 128×64 | I²C **SDA = GPIO41, SCL = GPIO42**, address **0x3C** | Both lines have pull-ups (from the screen module). |
| Speaker amplifier (I²S) | **BCLK = GPIO15, LRCK = GPIO16, DOUT = GPIO7** | 16 kHz, 16-bit stereo tones work. Clicks when RST is pressed; that is normal. |
| Button | **IO0** (GPIO0) | Also the download-mode button. `INPUT_PULLUP`, LOW when pressed. |
| Reset | **RST** button | |

### Not confirmed

- **Microphone:** the owner says it has one. XiaoZhi's bread-compact layout uses I²S mic **WS = 4, SCK = 5, DIN = 6**. Not tested.
- **GPIO39 and GPIO40** have pull-up resistors (found by a pull-up scan). Probably the board's other buttons (XiaoZhi uses volume up/down). Not tested.
- **RGB LED** next to IO0 (likely a WS2812 on GPIO48 in the XiaoZhi layout). Not tested.
- **Two small white JST connectors** on the board edges: pinout unknown.

### The 8-socket header (the screen plugs in here)

Counted from the end next to the RGB LED and the IO0 button:

| Socket | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Signal | GND | 3V3 | IO42/SCL | IO41/SDA | VIN | GND | RXD | TXD |

The screen's pins are GND · VDD · SCK · SDA and belong in **sockets 1 to 4**. It was once found **two sockets too far towards TXD** (power on IO41, data on VIN and GND), so it got no proper power and nothing showed. If the screen is dark, check this first.

## 4. Arduino IDE setup that works

- Arduino IDE **2.3.10** on Windows 11.
- Board package: **"esp32 by Espressif Systems" 3.3.x** (3.3.12 installed). The "Arduino ESP32 Boards" package (for the Nano ESP32) is also installed but not needed; if the IDE says "Platform 'esp32:esp32' not found", restart the IDE and re-pick the board from **Tools → Board → esp32**.
- **Tools** settings:
  - Board: **ESP32S3 Dev Module**
  - USB CDC On Boot: **Enabled** (otherwise `Serial` prints nothing over USB-C)
  - Flash Size: **16MB**
  - PSRAM: **OPI PSRAM**
  - Partition Scheme: **16M Flash (3MB APP/9.9MB FATFS)**. The Bluetooth sketch does not fit the default scheme.
  - Erase All Flash Before Sketch Upload: **Disabled** (enable only for a one-off clean-up, e.g. after XiaoZhi).
- Libraries installed: **Adafruit SSD1306**, **Adafruit GFX** (and BusIO). `ESP_I2S` and the BLE library (`BLEDevice.h` etc.) come with the board package.
- **Upload cannot connect / board stuck restarting:** hold **IO0**, tap **RST**, release **IO0**, then upload. Press RST afterwards to run the sketch.
- **Port:** was COM6 on one USB port; it changes with the port. To find it: compare **Tools → Port** with the board plugged and unplugged.
- Two `.ino` files in one sketch folder are compiled together ("redefinition of 'void setup()'"). Each test program needs its own sketch (File → New Sketch).

## 5. The current sketch (`genesense.ino`)

- `BLEDevice::init("GeneSense-Vitals")`, transmit power `ESP_PWR_LVL_N0`.
- Three standard services, each characteristic with NOTIFY | INDICATE and a `BLE2902` descriptor:
  - Heart Rate **0x180D / 0x2A37**: `[flags 0x00, bpm uint8]`
  - Pulse Oximeter **0x1822 / 0x2A5F** (PLX Continuous): `[flags 0x00, SpO₂ SFLOAT, pulse rate SFLOAT]`
  - Blood Pressure **0x1810 / 0x2A35**: `[flags 0x00 (mmHg), systolic SFLOAT, diastolic SFLOAT, mean SFLOAT]`
  - SFLOAT = 4-bit exponent + 12-bit mantissa, little-endian; `sfloat(v, oneDecimal)` in the sketch.
- Sends every **1 s** while connected. Mock values drift with sine waves plus noise: heart rate ≈ 74, SpO₂ ≈ 97.6 %, BP ≈ 119/77.
- Screen: "DEMO", "BLE: connected/waiting", a heart that grows on each beat, big bpm number, "SpO2 x% BP s/d" line. Text is ASCII only (the default font has no Vietnamese diacritics).
- Speaker: 1200 Hz, 25 ms beep per beat; **IO0** toggles sound (an "x" shows when muted).
- Screen start-up: probe 0x3C up to **5 times, 300 ms apart**, then `display.begin(SSD1306_SWITCHCAPVCC, 0x3C, true, false)`. The first probe after power-up usually gets no answer (error code 2). The last `false` stops the Adafruit library from restarting I²C on default pins.
- After a disconnect, `loop()` restarts advertising.
- It still calls **`esp_brownout_disable()`** before Bluetooth starts (declared `extern "C" void esp_brownout_disable(void);`). That was a workaround during the power problem (section 6). With good power it can be removed to keep the safety check on; the repo copy's comment says so. Ask the owner before removing it.

## 6. The power problem (cost a whole session; read this)

**Symptom:** whenever the radio started (Bluetooth or Wi-Fi), the board restarted in a loop. First "E BOD: Brownout detector was triggered" with `rst:0x3 (RTC_SW_SYS_RST)`; later silent restarts with **reset reason 1 (power-on)**, and Windows dropped the COM port on every restart ("Not connected" in the Serial Monitor). Screen and speaker sketches ran fine because they do not use the radio.

**Cause:** a worn USB cable and/or a weak USB port. **Fix:** a different cable **and** a different USB port. An iPhone USB-C cable on the same port did not fix it; a phone charger and a power bank did not either (likely the same cable).

**What did not help, or made it worse (do not repeat):**
- `WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0)` (the classic ESP32 trick), in `setup()` or in a global constructor: on the **ESP32-S3** it caused an immediate reset loop before `setup()`.
- `setCpuFrequencyMhz(80)`: suspected of tripping the brownout check right at start-up; removed.
- Lowering Bluetooth transmit power, starting Bluetooth before the speaker: did not stop the resets.
- `esp_brownout_disable()`: the clean way to turn the check off, but it only hides a weak supply (the board then reset with reason 1 instead).
- Erasing all flash, PSRAM set to Disabled: no change.

**Useful diagnostics:** print `esp_reset_reason()` after the start-up delay (1 = power-on, 4 = panic, 9 or 15 = brownout, 6 = task watchdog). A plain Wi-Fi scan sketch (`WiFi.mode(WIFI_STA); WiFi.scanNetworks();`) is a quick radio-power test.

**Other notes:** some USB-C cables carry power only (board runs, no COM port appears). If ever needed again, the hardware fix is a 470–1000 µF electrolytic capacitor (6.3 V or more) between 3V3 and GND (stripe to GND), plus optionally 10–22 µF ceramic.

## 7. Connecting from GeneSense

1. **Chrome or Edge** (Firefox has no Web Bluetooth), on **https** (the live site) or **http://localhost:8000**. Web Bluetooth needs a secure context.
2. **Do not pair the board in Windows Bluetooth settings.** The browser connects on its own.
3. Sign in with a **trial account**: GeneSense stores the mock values as real readings from a device. Trial accounts are deleted after 3 days.
4. **Ghi chỉ số → Kết nối máy đo → Kết nối**, pick **GeneSense-Vitals** in the browser's list, **Pair**. Values update every second; save with **Lưu chỉ số**.

How GeneSense parses the data (`frontend/js/ble.js`), so the board's packets must keep these layouts:
- Heart rate: flags bit 0 chooses uint8 or uint16 bpm at offset 1.
- Pulse oximeter: SFLOAT SpO₂ at offset 1, SFLOAT pulse rate at offset 3 (at least 5 bytes).
- Blood pressure: SFLOAT systolic at 1, diastolic at 3; flags bit 0 = kPa (converted), else mmHg.
- Glucose (0x1808 / 0x2A18) is also supported by the app but not sent by the board.
- The app averages each value over the last 5 readings, and the device panel only saves values received in the last 30 seconds.

## 8. Next step: MAX30102 sensor (real heart rate and SpO₂)

The owner found a green **MAX30102** module (about 49,000 đ) with 7 pins: **VIN SCL SDA INT IRD RD GND**, and was told it is the right sensor. Status when this was written: **not bought or wired yet**.

**Known catch:** boards with this 7-pin layout often pull SDA/SCL up to **1.8 V** through three 4.7 kΩ resistors marked **472**. The ESP32-S3 may then read the shared I²C bus unreliably (screen included). **Test first:** if a scan finds **0x57** (sensor) and **0x3C** (screen) and the screen still works, leave it. If not, remove the three 472 resistors; the screen module already pulls the bus up to 3.3 V.

**Planned wiring (shares the screen's I²C bus):**

| Sensor | Board |
|---|---|
| VIN | VIN, header socket 5 (module accepts 3.3–5 V) |
| GND | GND, header socket 6 |
| SCL | IO42/SCL: solder to the screen's SCK pin |
| SDA | IO41/SDA: solder to the screen's SDA pin |
| INT, IRD, RD | not connected |

The sensor's pin strip comes loose (needs soldering). Female-to-female Dupont wires suit sockets 5 and 6.

**Software plan (not written yet):**
- Library: **SparkFun MAX3010x Pulse and Proximity Sensor Library** (`MAX30105.h`, `heartRate.h` with `checkForBeat()`, `spo2_algorithm.h`).
- Keep one `Wire` bus on 41/42 at 100 kHz (the screen's retry logic stays). Sensor address 0x57.
- Replace `updateMock()` with real readings; drive the beep and heart animation from real beats; show "Place finger" and send nothing when no finger is detected (IR value low).
- Blood pressure cannot be measured by this sensor: drop the Blood Pressure service, or keep it clearly marked as mock. Ask the owner.
- Keep "DEMO" or a similar label honest on the screen while values are not validated. GeneSense says it is **not a medical device**; hobby-grade readings need still fingers and light pressure for 10–20 seconds.

## 9. Restoring the original XiaoZhi firmware

1. Download `v2.5.0_bread-compact-wifi-128x64.zip` from github.com/78/xiaozhi-esp32 → Releases (not the plain `bread-compact-wifi`, which is for 128×32 screens). Unzip; use `merged-binary.bin`.
2. **Close Arduino IDE** (it holds the COM port; otherwise "Failed to open serial port").
3. Open https://espressif.github.io/esptool-js/ in Chrome or Edge, baud **115200**, **Connect**, pick the board's port. If it fails: IO0 + RST download mode, refresh, retry.
4. Optional **Erase Flash**. Then flash `merged-binary.bin` at address **0x0** (the page may default to 0x1000), **Program**, then press RST.
5. XiaoZhi asks for Wi-Fi: connect a phone to its "Xiaozhi-…" hotspot, open 192.168.4.1.

Going back to Arduino: pick the port again (it may change), upload as usual.

## 10. Working with the owner

- Chat style: short, plain, "caveman lite". The owner is new to electronics and Arduino: give step-by-step instructions, name buttons and menus exactly, and **give the entire program** when changing code (the owner asked for full programs, not snippets).
- Warn before anything irreversible or physical: unplug USB before wiring or soldering; flashing other firmware erases the current one.
- Ask before downloading files for the owner or publishing anything outside the PC. Merging pull requests is the owner's action.
- GeneSense commits use the owner's GitHub identity (name TBB, email phanthienbao7a3ltk@gmail.com) or Vercel blocks deploys; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, PR bodies with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Use `"/c/Program Files/GitHub CLI/gh.exe"` for pull requests.
- Never print or paste secrets (the GeneSense `.env` holds a Gemini key).

## 11. Not known yet (ask the owner)

- **Long-run stability:** after the cable and port fix the owner said "everything works perfectly fine now", but no long run (30 minutes or more connected) was reported. Whether the `esp_brownout_disable()` workaround can go is untested: remove it, run connected for 30+ minutes, watch the Serial Monitor for restarts.
- **Which cable and port work:** not recorded. Only known: the iPhone USB-C cable on the first port (COM6) failed; "a different cable and a different port" worked.
- **Microphone, GPIO39/40 buttons, RGB LED, the two small connectors:** never tested.
- **Blood pressure after the MAX30102:** no decision. The earlier agent's suggestion (not the owner's): drop the Blood Pressure service once real values arrive, because a saved reading that mixes real heart rate and SpO₂ with fake blood pressure would mislead.
- **End-to-end save in GeneSense:** not confirmed. Nobody reported a reading from the board saved with "Lưu chỉ số", or seen updating live after the power fix.
- **Wi-Fi or a web page on the board:** never planned. Only Bluetooth was built. Sending over Wi-Fi to GeneSense would need a new, secured upload endpoint on the server (none exists).
