/* Kart profilleri ve pin doğrulama — Python `awa_agent/boards` portu. */

export const ROLE_DIGITAL_OUT = "digital_out";
export const ROLE_DIGITAL_IN = "digital_in";
export const ROLE_ANALOG_IN = "analog_in";
export const ROLE_PWM = "pwm";
export const ROLE_INTERRUPT = "interrupt";
export const ROLE_ANY = "any";

export function PinSpec(raw, kind, number = null, channel = null) {
  return { raw, kind, number, channel };
}

export class BoardProfile {
  constructor(cfg) {
    Object.assign(this, {
      flash_kb: 0, sram_kb: 0, clock_mhz: 0,
      digital_min: 0, digital_max: -1,
      pwm_pins: new Set(), interrupt_pins: new Set(),
      analog_labels: {}, analog_numbers: new Set(),
      input_only: new Set(), unusable_pins: new Set(), strapping: new Set(),
      dac_pins: new Set(), adc2_pins: new Set(),
      uart: {}, i2c_default: [], spi_default: {},
      adc_max: 1023, features: new Set(),
      family_only_libs: {}, safe_outputs: [], safe_inputs: [],
      safe_analog: [], notes: [],
    }, cfg);
    for (const k of ["pwm_pins", "interrupt_pins", "analog_numbers", "input_only",
      "unusable_pins", "strapping", "dac_pins", "adc2_pins", "features"]) {
      if (!(this[k] instanceof Set)) this[k] = new Set(this[k] || []);
    }
  }

  resolvePin(text) {
    if (text === null || text === undefined) return null;
    const s = String(text).trim();
    if (!s) return null;
    const up = s.toUpperCase();
    let m = /^A(\d{1,2})$/.exec(up);
    if (m) {
      const ch = Number(m[1]);
      const num = this.analog_labels[`A${ch}`] ?? null;
      return PinSpec(s, "analog", num, ch);
    }
    m = /^(?:GPIO|G)?(\d{1,2})$/.exec(up);
    if (m) {
      const num = Number(m[1]);
      return PinSpec(s, up.startsWith("GPIO") ? "gpio" : "digital", num, null);
    }
    return null;
  }

  isKnownDigital(num) { return num >= this.digital_min && num <= this.digital_max; }
  isAnalogNumber(num) { return this.analog_numbers.has(num); }
  isPwm(num) { return this.pwm_pins.has(num); }
  isUnusable(num) { return this.unusable_pins.has(num); }
  isInputOnly(num) { return this.input_only.has(num); }
  supports(feature) { return this.features.has(feature); }

  _analogRange() {
    const labels = Object.keys(this.analog_labels).sort();
    if (labels.length) return labels.join(", ");
    return `[${[...this.analog_numbers].sort((a, b) => a - b).join(", ")}]`;
  }

  _analogWarning(num) {
    if (this.adc2_pins.has(num) && this.supports("wifi")) {
      return `GPIO ${num} ADC2 birimindedir; ESP32'de Wi-Fi/Bluetooth aktifken ` +
        "ADC2 kullanilamaz, ADC1 (32-39) tercih edilmelidir.";
    }
    return null;
  }

  checkPin(pin, role) {
    let num = pin.number;
    if (num === null && pin.kind === "analog" && pin.channel !== null) {
      num = this.analog_labels[`A${pin.channel}`] ?? null;
    }
    if (num === null || num === undefined || num < 0) {
      return [false, `Gecersiz pin: '${pin.raw}' (negatif veya cozumlenemeyen pin).`, null];
    }
    if (role === ROLE_ANALOG_IN) {
      if (this.analog_numbers.has(num)) return [true, null, this._analogWarning(num)];
      return [false, `'${pin.raw}' bu kartta analog giris degil ` +
        `(gecerli analog: ${this._analogRange()}).`, null];
    }
    if (this.isUnusable(num)) {
      return [false, `GPIO ${num} bu kartta kullanilamaz (flash/PSRAM'e bagli). ` +
        "Baska pin secin.", null];
    }
    if (!this.isKnownDigital(num) && !this.isAnalogNumber(num)) {
      return [false, `'${pin.raw}' bu kartta tanimli bir pin degil ` +
        `(dijital aralik: ${this.digital_min}-${this.digital_max}).`, null];
    }
    if (role === ROLE_DIGITAL_OUT && this.isInputOnly(num)) {
      return [false, `GPIO ${num} yalnizca giris (input-only); cikis icin kullanilamaz.`, null];
    }
    if (role === ROLE_PWM && !this.isPwm(num)) {
      return [false, `'${pin.raw}' bu kartta PWM desteklemiyor ` +
        `(PWM pinleri: [${[...this.pwm_pins].sort((a, b) => a - b).join(", ")}]).`, null];
    }
    if (role === ROLE_INTERRUPT && !this.interrupt_pins.has(num)) {
      return [false, `'${pin.raw}' bu kartta harici kesme (interrupt) desteklemiyor ` +
        `(kesme pinleri: [${[...this.interrupt_pins].sort((a, b) => a - b).join(", ")}]).`, null];
    }
    let warn = null;
    if (this.strapping.has(num)) {
      warn = `GPIO ${num} strapping pinidir; boot davranisini etkileyebilir, dikkatli kullanin.`;
    } else if (role === ROLE_ANALOG_IN && this.adc2_pins.has(num) && this.supports("wifi")) {
      warn = `GPIO ${num} ADC2'dedir; Wi-Fi aktifken ADC2 kullanilamaz.`;
    }
    return [true, null, warn];
  }

  supportsLibrary(lib) {
    const fam = this.family_only_libs[lib];
    if (fam === undefined) return true;
    return fam.includes(this.family);
  }
}

function arduinoUno() {
  return new BoardProfile({
    key: "arduino_uno",
    display_name: "Arduino Uno R3",
    mcu: "ATmega328P",
    family: "avr",
    voltage: 5.0,
    framework_default: "arduino",
    flash_kb: 32, sram_kb: 2, clock_mhz: 16,
    digital_min: 0, digital_max: 13,
    pwm_pins: new Set([3, 5, 6, 9, 10, 11]),
    interrupt_pins: new Set([2, 3]),
    analog_labels: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`A${i}`, 14 + i])),
    analog_numbers: new Set(Array.from({ length: 6 }, (_, i) => 14 + i)),
    uart: { Serial: [0, 1] },
    i2c_default: [18, 19],
    spi_default: { SS: 10, MOSI: 11, MISO: 12, SCK: 13 },
    adc_max: 1023,
    features: new Set(["digital", "analog", "pwm", "interrupt", "i2c", "spi", "uart", "eeprom"]),
    family_only_libs: {
      WiFi: ["esp32"], HTTPClient: ["esp32"], BLE: ["esp32"], BluetoothSerial: ["esp32"],
    },
    safe_outputs: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
    safe_inputs: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    safe_analog: ["A0", "A1", "A2", "A3", "A4", "A5"],
    notes: [
      "Dijital 0/1 seri haberlesme (RX/TX) icindir; mumkunse kacinin.",
      "A4/A5 ayni zamanda I2C hattidir (SDA/SCL).",
      "PWM pinleri: 3, 5, 6, 9, 10, 11. Harici kesme: 2, 3.",
    ],
  });
}

function arduinoMega() {
  const pwm = new Set([...Array(12).keys()].map((i) => i + 2));
  for (const p of [44, 45, 46]) pwm.add(p);
  return new BoardProfile({
    key: "arduino_mega2560",
    display_name: "Arduino Mega 2560",
    mcu: "ATmega2560",
    family: "avr",
    voltage: 5.0,
    framework_default: "arduino",
    flash_kb: 256, sram_kb: 8, clock_mhz: 16,
    digital_min: 0, digital_max: 53,
    pwm_pins: pwm,
    interrupt_pins: new Set([2, 3, 18, 19, 20, 21]),
    analog_labels: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`A${i}`, 54 + i])),
    analog_numbers: new Set(Array.from({ length: 16 }, (_, i) => 54 + i)),
    uart: { Serial: [0, 1], Serial1: [19, 18], Serial2: [17, 16], Serial3: [15, 14] },
    i2c_default: [20, 21],
    spi_default: { SS: 53, MOSI: 51, MISO: 50, SCK: 52 },
    adc_max: 1023,
    features: new Set(["digital", "analog", "pwm", "interrupt", "i2c", "spi", "uart", "eeprom"]),
    family_only_libs: {
      WiFi: ["esp32"], HTTPClient: ["esp32"], BLE: ["esp32"], BluetoothSerial: ["esp32"],
    },
    safe_outputs: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, ...Array.from({ length: 32 }, (_, i) => 22 + i)],
    safe_inputs: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, ...Array.from({ length: 32 }, (_, i) => 22 + i)],
    safe_analog: Array.from({ length: 16 }, (_, i) => `A${i}`),
    notes: [
      "Mega analog girisler A0-A15 (54-69) olarak da adreslenir; Uno'nun A0=14 eslemesi Mega icin gecerli DEGILDIR.",
      "PWM pinleri: 2-13, 44, 45, 46. Harici kesme: 2, 3, 18, 19, 20, 21.",
      "Ek donanim UART: Serial1(18/19), Serial2(16/17), Serial3(14/15).",
      "I2C: 20 (SDA), 21 (SCL). SPI: 50-53.",
      "Dijital 0/1 seri haberlesme icindir.",
    ],
  });
}

function esp32() {
  const adc1 = new Set(Array.from({ length: 8 }, (_, i) => 32 + i));
  const adc2 = new Set([0, 2, 4, 12, 13, 14, 15, 25, 26, 27]);
  const inputOnly = new Set([34, 35, 36, 37, 38, 39]);
  const unusable = new Set([6, 7, 8, 9, 10, 11]);
  const all = new Set(Array.from({ length: 40 }, (_, i) => i));
  const outputCapable = new Set([...all].filter((n) => !unusable.has(n) && !inputOnly.has(n)));
  return new BoardProfile({
    key: "esp32",
    display_name: "ESP32 (klasik, ESP32-D0WD/WROOM-32)",
    mcu: "ESP32-D0WD",
    family: "esp32",
    voltage: 3.3,
    framework_default: "arduino-esp32",
    flash_kb: 4096, sram_kb: 520, clock_mhz: 240,
    digital_min: 0, digital_max: 39,
    pwm_pins: outputCapable,
    interrupt_pins: new Set([...all].filter((n) => !unusable.has(n))),
    analog_numbers: new Set([...adc1, ...adc2]),
    input_only: inputOnly,
    unusable_pins: unusable,
    strapping: new Set([0, 2, 4, 5, 12, 15]),
    dac_pins: new Set([25, 26]),
    adc2_pins: adc2,
    uart: { Serial: [1, 3], Serial2: [17, 16] },
    i2c_default: [21, 22],
    spi_default: { SCK: 18, MISO: 19, MOSI: 23, SS: 5 },
    adc_max: 4095,
    features: new Set(["digital", "analog", "pwm", "interrupt", "i2c", "spi", "uart",
      "wifi", "ble", "dac", "touch"]),
    family_only_libs: {},
    safe_outputs: [18, 19, 21, 22, 23, 5, 17, 16, 25, 26, 27, 32, 33, 4, 13, 12],
    safe_inputs: [18, 19, 21, 22, 23, 5, 17, 16, 32, 33, 34, 35, 25, 26, 27, 13, 12, 4],
    safe_analog: [32, 33, 34, 35, 36, 39, 25, 26, 27],
    notes: [
      "3,3 V lojik; 5 V'a toleransli DEGILDIR (seviye cevirici gerekebilir).",
      "GPIO 6-11 flash'e baglidir, kullanilamaz; GPIO 34-39 yalnizca giristir.",
      "ADC2 pinleri (0,2,4,12-15,25-27) Wi-Fi/Bluetooth aktifken kullanilamaz.",
      "Varsayilan I2C: 21 (SDA), 22 (SCL). Varsayilan SPI: 5,18,19,23.",
      "Klasik ESP32 varsayildi; varyant (S2/S3/C3) ise belirtin.",
    ],
  });
}

const REGISTRY = new Map();

function register(board, aliases = []) {
  REGISTRY.set(board.key, board);
  for (const a of aliases) REGISTRY.set(a, board);
}

register(arduinoUno(), ["uno", "arduino uno", "arduino_uno_r3"]);
register(arduinoMega(), ["mega", "mega2560", "mega 2560", "arduino mega", "arduino_mega"]);
register(esp32(), ["esp32", "esp32 klasik", "esp32-d0wd", "esp32 wroom", "esp-wroom-32"]);

export function getBoard(key) {
  return REGISTRY.get(key) || null;
}

export function listBoards() {
  const seen = new Set();
  const out = [];
  for (const b of REGISTRY.values()) {
    if (!seen.has(b.key)) { seen.add(b.key); out.push(b); }
  }
  return out;
}

export { register };
