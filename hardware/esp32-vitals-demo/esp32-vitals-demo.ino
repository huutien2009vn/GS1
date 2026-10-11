// GeneSense-Vitals: Bluetooth demo "measuring device" for GeneSense on the XH-S3E-AI board (ESP32-S3).
// Sends MOCK heart rate, SpO2 and blood pressure over the standard Bluetooth health services.
// Not a medical device: the numbers are made up. Setup and wiring: see README.md in this folder.

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

// Switches the brownout check off. Added while a worn USB cable made the board reset whenever the
// radio started; the real fix was a better cable and port. With good power, this declaration and
// the two lines after "Screen OK" in setup() can be removed to keep the safety check on.
extern "C" void esp_brownout_disable(void);

#define OLED_SDA 41
#define OLED_SCL 42
#define SPK_BCLK 15
#define SPK_LRCK 16
#define SPK_DOUT 7
#define BUTTON   0

Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;
const int RATE = 16000;

BLECharacteristic *hrChar, *plxChar, *bpChar;
volatile bool bleConnected = false;
bool wasConnected = false, soundOn = true, screenOk = false;

float bpm = 74, spo2 = 97.6, sys = 119, dia = 77;    // mock values
unsigned long nextBeat = 0, beatShownUntil = 0, nextSend = 0;

class ServerEvents : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleConnected = true; }
  void onDisconnect(BLEServer*) override { bleConnected = false; }
};

// Bluetooth health formats use "SFLOAT": 4-bit exponent + 12-bit mantissa.
uint16_t sfloat(float v, bool oneDecimal) {
  int16_t m = lround(v * (oneDecimal ? 10 : 1));
  return ((oneDecimal ? 0xF : 0x0) << 12) | (m & 0x0FFF);   // 0xF = exponent -1
}
void put16(uint8_t *p, uint16_t v) { p[0] = v & 0xFF; p[1] = v >> 8; }

void playTone(float freq, int ms, int volume = 2500) {
  int16_t buf[256 * 2];
  int total = RATE * ms / 1000;
  for (int done = 0; done < total; ) {
    int n = min(256, total - done);
    for (int i = 0; i < n; i++) {
      int16_t v = sin(2 * PI * freq * (done + i) / RATE) * volume;
      buf[2 * i] = buf[2 * i + 1] = v;
    }
    i2s.write((uint8_t*)buf, n * 4);
    done += n;
  }
}

void drawHeart(int cx, int cy, int s) {          // two circles + a triangle
  display.fillCircle(cx - s, cy - s / 2, s, SSD1306_WHITE);
  display.fillCircle(cx + s, cy - s / 2, s, SSD1306_WHITE);
  display.fillTriangle(cx - 2 * s, cy - s / 3, cx + 2 * s, cy - s / 3, cx, cy + 2 * s, SSD1306_WHITE);
}

void drawScreen(bool beat) {
  if (!screenOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("DEMO  ");
  display.print(bleConnected ? "BLE: connected" : "BLE: waiting");
  if (!soundOn) { display.setCursor(110, 0); display.print("x"); }

  drawHeart(22, 30, beat ? 9 : 7);

  display.setTextSize(3);
  display.setCursor(52, 16);
  display.print((int)round(bpm));
  display.setTextSize(1);
  display.setCursor(108, 30);
  display.print("bpm");

  display.setCursor(0, 54);
  display.printf("SpO2 %.0f%%  BP %d/%d", spo2, (int)round(sys), (int)round(dia));
  display.display();
}

void updateMock() {
  float t = millis() / 1000.0;
  auto noise = [](float a) { return random(-100, 101) / 100.0 * a; };
  bpm  = 74 + 5 * sin(t / 7) + noise(1.5);
  spo2 = constrain(97.6 + 0.8 * sin(t / 11) + noise(0.3), 94, 100);
  sys  = 119 + 5 * sin(t / 13) + noise(1.5);
  dia  = 77 + 3 * sin(t / 13) + noise(1);
}

void sendReadings() {
  uint8_t hr[2] = {0x00, (uint8_t)round(bpm)};      // flags, bpm (8-bit)
  hrChar->setValue(hr, 2);  hrChar->notify();

  uint8_t plx[5] = {0x00};                           // flags, SpO2, pulse rate
  put16(plx + 1, sfloat(spo2, true));
  put16(plx + 3, sfloat(bpm, false));
  plxChar->setValue(plx, 5);  plxChar->notify();

  uint8_t bp[7] = {0x00};                            // flags (mmHg), systolic, diastolic, mean
  put16(bp + 1, sfloat(sys, false));
  put16(bp + 3, sfloat(dia, false));
  put16(bp + 5, sfloat(dia + (sys - dia) / 3, false));
  bpChar->setValue(bp, 7);  bpChar->notify();
}

BLECharacteristic* addService(BLEServer *server, uint16_t service, uint16_t characteristic) {
  BLEService *s = server->createService(BLEUUID(service));
  BLECharacteristic *c = s->createCharacteristic(BLEUUID(characteristic),
      BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_INDICATE);
  c->addDescriptor(new BLE2902());
  s->start();
  BLEDevice::getAdvertising()->addServiceUUID(BLEUUID(service));
  return c;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("Starting");
  pinMode(BUTTON, INPUT_PULLUP);

  Wire.begin(OLED_SDA, OLED_SCL, 100000);
  for (int i = 0; i < 5 && !screenOk; i++) {         // the screen needs a moment after power-up
    Wire.beginTransmission(0x3C);
    screenOk = Wire.endTransmission() == 0 && display.begin(SSD1306_SWITCHCAPVCC, 0x3C, true, false);
    if (!screenOk) delay(300);
  }
  Serial.println(screenOk ? "Screen OK" : "Screen not found");

  esp_brownout_disable();
  Serial.println("Brownout check off, starting Bluetooth");

  BLEDevice::init("GeneSense-Vitals");
  BLEDevice::setPower(ESP_PWR_LVL_N0);               // lower radio power: smaller current peaks
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerEvents());
  hrChar  = addService(server, 0x180D, 0x2A37);      // Heart Rate
  plxChar = addService(server, 0x1822, 0x2A5F);      // Pulse Oximeter
  bpChar  = addService(server, 0x1810, 0x2A35);      // Blood Pressure
  BLEDevice::getAdvertising()->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Advertising as GeneSense-Vitals");

  i2s.setPins(SPK_BCLK, SPK_LRCK, SPK_DOUT);
  i2s.begin(I2S_MODE_STD, RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
  drawScreen(false);
}

void loop() {
  unsigned long now = millis();

  if (bleConnected != wasConnected) {                // after a disconnect, advertise again
    if (!bleConnected) { delay(300); BLEDevice::startAdvertising(); }
    Serial.println(bleConnected ? "Connected" : "Disconnected");
    wasConnected = bleConnected;
    drawScreen(false);
  }

  if (now >= nextSend) {
    updateMock();
    if (bleConnected) sendReadings();
    nextSend = now + 1000;
  }

  if (now >= nextBeat) {                             // heart beat: big heart + beep
    nextBeat = now + 60000 / bpm;
    beatShownUntil = now + 150;
    drawScreen(true);
    if (soundOn) playTone(1200, 25);
  } else if (beatShownUntil && now >= beatShownUntil) {
    beatShownUntil = 0;
    drawScreen(false);
  }

  if (digitalRead(BUTTON) == LOW) {                  // IO0 turns the beep on/off
    soundOn = !soundOn;
    drawScreen(false);
    while (digitalRead(BUTTON) == LOW) delay(10);
  }
}