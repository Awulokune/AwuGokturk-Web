/* Code Generator — Python `code_generator.py` birebir portu.
 * Kullanıcının verdiği pinler aynen kullanılır; eksik pinler güvenli
 * varsayılanla doldurulur ve "varsayılan" olarak raporlanır.
 */

import { PinSpec } from "./boards.js";
import { getModule, T_DIGITAL_OUT, T_DIGITAL_IN, T_ANALOG_IN, T_PWM } from "./knowledge.js";

export function pinStr(spec) {
  const raw = String(spec.raw ?? "").trim();
  let m = /^gpio\s*(-?\d+)$/i.exec(raw);
  if (m) return m[1];
  if (/^-?\d+$/.test(raw)) return raw;
  if (/^A\d{1,2}$/i.test(raw)) return raw.toUpperCase();
  return raw;
}

function constDecl(name, value, ctype = "int") {
  return `const ${ctype} ${name} = ${value};`;
}

export function makeContext() {
  return {
    esp32Channels: new Map(),
    channel(pin) {
      const key = String(pin);
      if (!this.esp32Channels.has(key)) this.esp32Channels.set(key, this.esp32Channels.size);
      return this.esp32Channels.get(key);
    },
  };
}

function pickDefault(board, roleType, used) {
  let pool;
  if (roleType === T_DIGITAL_OUT) pool = board.safe_outputs;
  else if (roleType === T_DIGITAL_IN) pool = board.safe_inputs;
  else if (roleType === T_ANALOG_IN) pool = board.safe_analog;
  else if (roleType === T_PWM) pool = board.safe_outputs.filter((p) => board.isPwm(p));
  else pool = board.safe_outputs;
  for (const p of pool) {
    let spec = board.resolvePin(String(p));
    if (spec === null && /^\d+$/.test(String(p))) spec = PinSpec(String(p), "digital", Number(p));
    if (spec === null) continue;
    if (spec.number !== null && used.has(spec.number)) continue;
    const [ok] = board.checkPin(spec, roleType);
    if (ok) return spec;
  }
  return null;
}

export function fillDefaults(board, actions) {
  const used = new Set();
  for (const a of actions) {
    for (const sp of Object.values(a.pins)) {
      if (sp.number !== null && sp.number !== undefined) used.add(sp.number);
    }
  }
  const defaulted = [];
  const unresolved = [];
  for (const a of actions) {
    const md = getModule(a.module);
    if (!md) continue;
    for (const [role, rq] of Object.entries(md.roles)) {
      if (role in a.pins) continue;
      const spec = pickDefault(board, rq.role_type, used);
      if (spec === null) { unresolved.push([a.module, role]); continue; }
      if (spec.number !== null && spec.number !== undefined) used.add(spec.number);
      a.pins[role] = spec;
      defaulted.push([a.module, role, pinStr(spec)]);
    }
  }
  return [defaulted, unresolved];
}

function part(props = {}) {
  return {
    includes: [], globals: [], setup: [], loop: [], wiring: [], notes: [], libraries: [],
    ...props,
  };
}

function rLedOn(a) {
  const p = pinStr(a.pins.led);
  return part({
    globals: [constDecl("LED_PIN", p)],
    setup: ["pinMode(LED_PIN, OUTPUT);", "digitalWrite(LED_PIN, HIGH);"],
    wiring: [`LED_ANOT -> ${p} (direnc ile), LED_KATOT -> GND`],
    notes: ["LED akimini sinirlamak icin seri direnc (220-330 ohm) kullanin."],
  });
}

function rLedOff(a) {
  const p = pinStr(a.pins.led);
  return part({
    globals: [constDecl("LED_PIN", p)],
    setup: ["pinMode(LED_PIN, OUTPUT);", "digitalWrite(LED_PIN, LOW);"],
    wiring: [`LED_ANOT -> ${p}, LED_KATOT -> GND`],
  });
}

function rLedBlink(a) {
  const p = pinStr(a.pins.led);
  const iv = parseInt(a.params.interval_ms ?? 500, 10);
  return part({
    globals: [constDecl("LED_PIN", p), constDecl("INTERVAL_MS", iv, "unsigned long")],
    setup: ["pinMode(LED_PIN, OUTPUT);"],
    loop: [
      "digitalWrite(LED_PIN, HIGH);", "delay(INTERVAL_MS);",
      "digitalWrite(LED_PIN, LOW);", "delay(INTERVAL_MS);",
    ],
    wiring: [`LED -> ${p}`],
    notes: [`Yanip sonme araligi: ${iv} ms.`],
  });
}

function rButtonLed(a) {
  const bp = pinStr(a.pins.button);
  const lp = pinStr(a.pins.led);
  const db = parseInt(a.params.debounce_ms ?? 50, 10);
  return part({
    globals: [constDecl("BUTTON_PIN", bp), constDecl("LED_PIN", lp),
      constDecl("DEBOUNCE_MS", db, "unsigned long"),
      "int _lastReading = HIGH;", "int _stable = HIGH;", "unsigned long _lastChange = 0;"],
    setup: ["pinMode(BUTTON_PIN, INPUT_PULLUP);", "pinMode(LED_PIN, OUTPUT);"],
    loop: [
      "int reading = digitalRead(BUTTON_PIN);",
      "if (reading != _lastReading) { _lastChange = millis(); }",
      "if (millis() - _lastChange > DEBOUNCE_MS) {",
      "  if (reading != _stable) {",
      "    _stable = reading;",
      "    digitalWrite(LED_PIN, _stable == LOW ? HIGH : LOW);",
      "  }",
      "}",
      "_lastReading = reading;",
    ],
    wiring: [`Buton -> ${bp} ile GND arasi (INPUT_PULLUP; ikinci direnc gerekmez)`,
      `LED -> ${lp}`],
    notes: [`Yazilimsal debounce: ${db} ms.`],
  });
}

function rTwoButtonsTwoLeds(a) {
  const b1 = pinStr(a.pins.button1);
  const b2 = pinStr(a.pins.button2);
  const l1 = pinStr(a.pins.led1);
  const l2 = pinStr(a.pins.led2);
  const db = parseInt(a.params.debounce_ms ?? 50, 10);
  return part({
    globals: [constDecl("BTN1", b1), constDecl("BTN2", b2),
      constDecl("LED1", l1), constDecl("LED2", l2),
      constDecl("DEBOUNCE_MS", db, "unsigned long"),
      "const int BTN_PINS[2] = {BTN1, BTN2};",
      "const int LED_PINS[2] = {LED1, LED2};",
      "int _lastReading[2] = {HIGH, HIGH};",
      "int _stable[2] = {HIGH, HIGH};",
      "unsigned long _lastChange[2] = {0, 0};"],
    setup: ["for (int i = 0; i < 2; i++) {",
      "  pinMode(BTN_PINS[i], INPUT_PULLUP);",
      "  pinMode(LED_PINS[i], OUTPUT);",
      "}"],
    loop: ["for (int i = 0; i < 2; i++) {",
      "  int reading = digitalRead(BTN_PINS[i]);",
      "  if (reading != _lastReading[i]) { _lastChange[i] = millis(); }",
      "  if (millis() - _lastChange[i] > DEBOUNCE_MS) {",
      "    if (reading != _stable[i]) {",
      "      _stable[i] = reading;",
      "      digitalWrite(LED_PINS[i], _stable[i] == LOW ? HIGH : LOW);",
      "    }",
      "  }",
      "  _lastReading[i] = reading;",
      "}"],
    wiring: [`Buton1 -> ${b1}, LED1 -> ${l1}`, `Buton2 -> ${b2}, LED2 -> ${l2}`],
    notes: [`Her buton kendi LED'ini kontrol eder; debounce ${db} ms.`],
  });
}

function rTwoLeds(a) {
  const l1 = pinStr(a.pins.led1);
  const l2 = pinStr(a.pins.led2);
  return part({
    globals: [constDecl("LED1_PIN", l1), constDecl("LED2_PIN", l2)],
    setup: ["pinMode(LED1_PIN, OUTPUT);", "pinMode(LED2_PIN, OUTPUT);",
      "digitalWrite(LED1_PIN, HIGH);", "digitalWrite(LED2_PIN, HIGH);"],
    wiring: [`LED1 -> ${l1}, LED2 -> ${l2} (seri direnc ile)`],
    notes: ["Iki LED surekli yanar."],
  });
}

function rAnalogReadSerial(a, board) {
  const p = a.pins.pot.kind === "analog" ? "A" + a.pins.pot.channel : pinStr(a.pins.pot);
  const baud = parseInt(a.params.baud ?? 9600, 10);
  const iv = parseInt(a.params.interval_ms ?? 200, 10);
  const p2 = part({
    globals: [constDecl("SENSOR_PIN", p), constDecl("INTERVAL_MS", iv, "unsigned long")],
    setup: [`Serial.begin(${baud});`],
    loop: ["int deger = analogRead(SENSOR_PIN);", 'Serial.print("Deger: ");',
      "Serial.println(deger);", "delay(INTERVAL_MS);"],
    wiring: [board.family === "avr"
      ? `Potansiyometre orta uc -> ${p}, uclar -> 5V/GND`
      : `Sensor cikisi -> GPIO ${p} (3.3V uyumlu olmali)`],
  });
  if (board.family === "esp32") {
    p2.notes.push(`ESP32 ADC 12 bit (0-${board.adc_max}); besleme 3.3V'u geçmemeli.`);
  } else {
    p2.notes.push("AVR ADC 10 bit (0-1023).");
  }
  return p2;
}

function rPwmFade(a, board, ctx) {
  const p = pinStr(a.pins.pwm_led);
  const step = parseInt(a.params.step ?? 5, 10);
  if (board.family === "esp32") {
    const ch = ctx.channel(p);
    return part({
      globals: [constDecl("PWM_PIN", p), constDecl("PWM_CH", ch),
        constDecl("PWM_FREQ", 5000), constDecl("PWM_RES", 8)],
      setup: ["ledcSetup(PWM_CH, PWM_FREQ, PWM_RES);", "ledcAttachPin(PWM_PIN, PWM_CH);"],
      loop: [
        `for (int d = 0; d <= 255; d += ${step}) { ledcWrite(PWM_CH, d); delay(15); }`,
        `for (int d = 255; d >= 0; d -= ${step}) { ledcWrite(PWM_CH, d); delay(15); }`,
      ],
      wiring: [`LED -> GPIO ${p} (LEDC kanal ${ch})`],
      notes: [`ESP32 LEDC (freq=5000Hz, 8 bit). Parlaklik adimi: ${step}.`],
    });
  }
  return part({
    globals: [constDecl("PWM_PIN", p)],
    setup: ["pinMode(PWM_PIN, OUTPUT);"],
    loop: [
      `for (int d = 0; d <= 255; d += ${step}) { analogWrite(PWM_PIN, d); delay(15); }`,
      `for (int d = 255; d >= 0; d -= ${step}) { analogWrite(PWM_PIN, d); delay(15); }`,
    ],
    wiring: [`LED -> ${p} (PWM)`],
    notes: [`analogWrite 0-255. Parlaklik adimi: ${step}.`],
  });
}

function rPwmWrite(a, board, ctx) {
  const p = pinStr(a.pins.pwm_led);
  const val = parseInt(a.params.value ?? 128, 10);
  if (board.family === "esp32") {
    const ch = ctx.channel(p);
    return part({
      globals: [constDecl("PWM_PIN", p), constDecl("PWM_CH", ch)],
      setup: ["ledcSetup(PWM_CH, 5000, 8);", "ledcAttachPin(PWM_PIN, PWM_CH);"],
      loop: [`ledcWrite(PWM_CH, ${val});`, "delay(1000);"],
      wiring: [`LED -> GPIO ${p}`],
      notes: [`PWM degeri ${val} (0-255), LEDC kanal ${ch}.`],
    });
  }
  return part({
    globals: [constDecl("PWM_PIN", p)],
    setup: ["pinMode(PWM_PIN, OUTPUT);"],
    loop: [`analogWrite(PWM_PIN, ${val});`, "delay(1000);"],
    wiring: [`LED -> ${p} (PWM)`],
    notes: [`PWM degeri ${val} (0-255).`],
  });
}

function rServoSweep(a) {
  const p = pinStr(a.pins.servo);
  const mn = parseInt(a.params.min_angle ?? 0, 10);
  const mx = parseInt(a.params.max_angle ?? 180, 10);
  const dl = parseInt(a.params.step_delay ?? 15, 10);
  return part({
    includes: ["#include <Servo.h>"], libraries: ["Servo"],
    globals: [constDecl("SERVO_PIN", p), "Servo _servo;"],
    setup: ["_servo.attach(SERVO_PIN);"],
    loop: [
      `for (int a = ${mn}; a <= ${mx}; a++) { _servo.write(a); delay(${dl}); }`,
      `for (int a = ${mx}; a >= ${mn}; a--) { _servo.write(a); delay(${dl}); }`,
    ],
    wiring: [`Servo sinyal -> ${p}; servo beslemesi ayri 5V (GND ortak)`],
    notes: ["Servo akimi yuksektir; harici besleme onerilir."],
  });
}

function rUltrasonicDistance(a, board) {
  const t = pinStr(a.pins.trig);
  const e = pinStr(a.pins.echo);
  const iv = parseInt(a.params.interval_ms ?? 200, 10);
  const p = part({
    globals: [constDecl("TRIG_PIN", t), constDecl("ECHO_PIN", e),
      constDecl("INTERVAL_MS", iv, "unsigned long")],
    setup: ["pinMode(TRIG_PIN, OUTPUT);", "pinMode(ECHO_PIN, INPUT);", "Serial.begin(9600);"],
    loop: ["digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);",
      "digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);",
      "digitalWrite(TRIG_PIN, LOW);",
      "long sure = pulseIn(ECHO_PIN, HIGH);",
      "long cm = sure / 58;",
      'Serial.print("Mesafe: "); Serial.print(cm); Serial.println(" cm");',
      "delay(INTERVAL_MS);"],
    wiring: [`HC-SR04 TRIG -> ${t}, ECHO -> ${e}, VCC -> 5V, GND -> GND`],
  });
  if (board.family === "esp32") {
    p.notes.push("HC-SR04 ECHO 5V uretir; ESP32 3.3V oldugu icin gerilim bolucu gerekir.");
  }
  return p;
}

function rBuzzerTone(a) {
  const p = pinStr(a.pins.buzzer);
  const fq = parseInt(a.params.freq ?? 1000, 10);
  return part({
    globals: [constDecl("BUZZER_PIN", p), constDecl("FREQ", fq)],
    setup: ["pinMode(BUZZER_PIN, OUTPUT);"],
    loop: ["tone(BUZZER_PIN, FREQ);", "delay(500);", "noTone(BUZZER_PIN);", "delay(500);"],
    wiring: [`Buzzer + -> ${p}, - -> GND`],
    notes: [`tone() frekansi: ${fq} Hz.`],
  });
}

function rDhtRead(a) {
  const p = pinStr(a.pins.dht);
  const st = String(a.params.sensor_type ?? "DHT11").toUpperCase();
  const iv = parseInt(a.params.interval_ms ?? 2000, 10);
  return part({
    includes: ["#include <DHT.h>"], libraries: ["DHT"],
    globals: [constDecl("DHT_PIN", p), `#define DHT_TYPE ${st}`, "DHT _dht(DHT_PIN, DHT_TYPE);"],
    setup: ["Serial.begin(9600);", "_dht.begin();"],
    loop: ["float nem = _dht.readHumidity();", "float sicaklik = _dht.readTemperature();",
      'Serial.print("Sicaklik: "); Serial.print(sicaklik);',
      'Serial.print(" C, Nem: "); Serial.print(nem); Serial.println(" %");',
      `delay(${iv});`],
    wiring: [`DHT veri -> ${p} (10k pull-up onerilir), VCC/GND`],
    notes: [`Sensor tipi: ${st}. Ornekleme araligi >= 2000 ms onerilir.`],
  });
}

function rLcdI2cPrint(a) {
  const p = part({
    includes: ["#include <Wire.h>", "#include <LiquidCrystal_I2C.h>"],
    libraries: ["Wire", "LiquidCrystal_I2C"],
  });
  const addr = String(a.params.address ?? "0x27");
  const cols = parseInt(a.params.cols ?? 16, 10);
  const rows = parseInt(a.params.rows ?? 2, 10);
  const txt = String(a.params.text ?? "Merhaba");
  p.globals = [`LiquidCrystal_I2C _lcd(${addr}, ${cols}, ${rows});`];
  p.setup = ["_lcd.init();", "_lcd.backlight();", "_lcd.setCursor(0, 0);", `_lcd.print("${txt}");`];
  p.wiring = ["LCD SDA -> SDA, SCL -> SCL, VCC -> 5V, GND -> GND"];
  return p;
}

function rI2cScan() {
  return part({
    includes: ["#include <Wire.h>"], libraries: ["Wire"],
    setup: ["Serial.begin(9600);", "Wire.begin();"],
    loop: ["for (byte addr = 1; addr < 127; addr++) {",
      "  Wire.beginTransmission(addr);",
      "  if (Wire.endTransmission() == 0) {",
      '    Serial.print("Bulundu: 0x"); Serial.println(addr, HEX);',
      "  }",
      "}",
      "delay(5000);"],
    wiring: ["I2C SDA/SCL pinleri karta gore belirlenmistir"],
  });
}

function rWifiConnect(a) {
  let ssid = a.params.ssid;
  let pw = a.params.password;
  const ph = [];
  if (!ssid) { ssid = "YOUR_SSID"; ph.push("SSID"); }
  if (!pw) { pw = "YOUR_PASSWORD"; ph.push("sifre"); }
  return part({
    includes: ["#include <WiFi.h>"], libraries: ["WiFi"],
    globals: [`const char* WIFI_SSID = "${ssid}";`, `const char* WIFI_PASS = "${pw}";`],
    setup: ["Serial.begin(115200);", "WiFi.begin(WIFI_SSID, WIFI_PASS);",
      "while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print(\".\"); }",
      'Serial.println(); Serial.print("Bagli. IP: "); Serial.println(WiFi.localIP());'],
    loop: ["delay(1000);"],
    wiring: ["ESP32 dahili Wi-Fi (harici modul gerekmez)"],
    notes: ph.length ? ["Eksik yapilandirma: " + ph.join(", ") + " (placeholder olarak birakildi)."] : [],
  });
}

function rWifiHttpGet(a) {
  let ssid = a.params.ssid;
  let pw = a.params.password;
  let url = a.params.url;
  const ph = [];
  if (!ssid) { ssid = "YOUR_SSID"; ph.push("SSID"); }
  if (!pw) { pw = "YOUR_PASSWORD"; ph.push("sifre"); }
  if (!url) { url = "http://example.com/"; ph.push("URL"); }
  const iv = parseInt(a.params.interval_ms ?? 10000, 10);
  return part({
    includes: ["#include <WiFi.h>", "#include <HTTPClient.h>"],
    libraries: ["WiFi", "HTTPClient"],
    globals: [`const char* WIFI_SSID = "${ssid}";`, `const char* WIFI_PASS = "${pw}";`,
      `const char* TARGET_URL = "${url}";`, constDecl("REQUEST_INTERVAL_MS", iv, "unsigned long")],
    setup: ["Serial.begin(115200);", "WiFi.begin(WIFI_SSID, WIFI_PASS);",
      "while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print(\".\"); }",
      'Serial.println(); Serial.println("Wi-Fi bagli.");'],
    loop: ["if (WiFi.status() == WL_CONNECTED) {",
      "  HTTPClient http;",
      "  http.begin(TARGET_URL);",
      "  int code = http.GET();",
      "  if (code > 0) {",
      '    Serial.print("HTTP kodu: "); Serial.println(code);',
      "    String payload = http.getString();",
      "    Serial.println(payload);",
      "  } else {",
      '    Serial.print("Istek hatasi: "); Serial.println(code);',
      "  }",
      "  http.end();",
      "}",
      "delay(REQUEST_INTERVAL_MS);"],
    wiring: ["ESP32 dahili Wi-Fi"],
    notes: ph.length ? ["Eksik yapilandirma: " + ph.join(", ") + " (placeholder)."] : [],
  });
}

const RENDER = {
  led_on: rLedOn, led_off: rLedOff, led_blink: rLedBlink,
  two_leds: rTwoLeds,
  button_led: rButtonLed, two_buttons_two_leds: rTwoButtonsTwoLeds,
  analog_read_serial: rAnalogReadSerial, pwm_fade: rPwmFade,
  pwm_write: rPwmWrite, servo_sweep: rServoSweep,
  ultrasonic_distance: rUltrasonicDistance, buzzer_tone: rBuzzerTone,
  dht_read: rDhtRead, lcd_i2c_print: rLcdI2cPrint, i2c_scan: rI2cScan,
  wifi_connect: rWifiConnect, wifi_http_get: rWifiHttpGet,
};

export function renderAction(a, board, ctx) {
  const fn = RENDER[a.module];
  if (!fn) throw new Error(a.module);
  return fn(a, board, ctx);
}

export function generate(board, actions, ctx = null) {
  ctx = ctx || makeContext();
  const parts = actions.map((a) => renderAction(a, board, ctx));
  const includes = [];
  const seen = new Set();
  for (const p of parts) {
    for (const inc of p.includes) {
      if (!seen.has(inc)) { seen.add(inc); includes.push(inc); }
    }
  }
  if (!includes.includes("#include <Arduino.h>")) includes.unshift("#include <Arduino.h>");

  const globalsLines = [];
  for (const p of parts) {
    globalsLines.push(...p.globals);
    globalsLines.push("");
  }
  const setupLines = [];
  const loopLines = [];
  for (const p of parts) {
    setupLines.push(...p.setup);
    loopLines.push(...p.loop);
  }
  let code = includes.join("\n") + "\n\n";
  const globalsText = globalsLines.join("\n").replace(/\s+$/, "");
  if (globalsLines.length) code += globalsText + "\n\n";
  code += "void setup() {\n" + setupLines.map((l) => "  " + l).join("\n") + "\n}\n\n";
  code += "void loop() {\n" + loopLines.map((l) => "  " + l).join("\n") + "\n}\n";
  return [code, parts];
}
