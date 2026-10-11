# GeneSense-Vitals (ESP32 demo board)

An Arduino sketch that turns the owner's XH-S3E-AI board (ESP32-S3 N16R8, 0.96" OLED, I²S speaker) into a Bluetooth "measuring device" for GeneSense demos. It sends **mock** heart rate, SpO₂ and blood pressure every second. The numbers are made up; this is not a medical device.

## What it does

- Advertises as **GeneSense-Vitals** with the standard Bluetooth Heart Rate (0x180D / 0x2A37), Pulse Oximeter (0x1822 / 0x2A5F) and Blood Pressure (0x1810 / 0x2A35) services. GeneSense reads these in `frontend/js/ble.js` with no app change.
- The screen shows "DEMO", the Bluetooth state, a beating heart, the heart rate, SpO₂ and blood pressure.
- The speaker beeps on each beat. The **IO0** button turns the beep on or off.

## Hardware

| Part | Pins |
|---|---|
| OLED SSD1306 128×64, I²C address 0x3C | SDA = GPIO41, SCL = GPIO42 |
| I²S speaker amplifier | BCLK = GPIO15, LRCK = GPIO16, DOUT = GPIO7 |
| Button | IO0 (also the download-mode button) |

The screen plugs into sockets 1 to 4 of the 8-socket header, counted from the end next to the RGB LED and IO0: GND, 3V3, IO42/SCL, IO41/SDA.

## Arduino IDE settings

- Board package: **esp32 by Espressif Systems** 3.3.x. Board: **ESP32S3 Dev Module**.
- USB CDC On Boot: **Enabled**. Flash Size: **16MB**. PSRAM: **OPI PSRAM**.
- Partition Scheme: **16M Flash (3MB APP/9.9MB FATFS)** (the sketch does not fit the default).
- Libraries: **Adafruit SSD1306** (installs Adafruit GFX). `ESP_I2S` and the BLE library come with the board package.
- If an upload cannot connect: hold IO0, tap RST, release IO0, upload again.

## Connecting from GeneSense

1. Chrome or Edge, on https (the live site) or `http://localhost:8000`. Do not pair the board in Windows settings.
2. Sign in with a **trial account**: GeneSense saves the mock values as real device readings.
3. **Ghi chỉ số → Kết nối máy đo → Kết nối**, choose **GeneSense-Vitals**, then **Pair**. Save with **Lưu chỉ số**.

## Troubleshooting

- **The board restarts whenever Bluetooth starts** ("Brownout detector was triggered", or silent restarts with reset reason 1): the power supply is too weak. A different USB cable and port fixed it here. Do not write to `RTC_CNTL_BROWN_OUT_REG` on the ESP32-S3; it made the reset loop worse.
- **No COM port appears:** the cable may carry power only. Try another cable.
- **Screen stays dark:** check it sits in sockets 1 to 4. The first I²C probe after power-up can fail; the sketch retries.

## Next step

Replace the mock values with a MAX30102 heart-rate and SpO₂ sensor on the same I²C pins (address 0x57).
