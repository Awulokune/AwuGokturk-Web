/* Requirement Parser — Python `requirement_parser.py` birebir portu.
 * Kullanıcının verdiği pin/parametre aynen korunur.
 */

import { PinSpec, getBoard } from "./boards.js";
import { getModule } from "./knowledge.js";
import { pinEquals } from "./util.js";

const TR = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
  "Ç": "C", "Ğ": "G", "İ": "I", "Ö": "O", "Ş": "S", "Ü": "U" };

function normTr(s) {
  let out = "";
  for (const ch of String(s ?? "")) out += TR[ch] ?? ch;
  return out.toLowerCase();
}

const W = "\\p{L}\\p{N}_";
const PIN_RE = new RegExp(
  `(?<![${W}])gpio\\s*(?<gpio>-?\\d{1,3})` +
  `|(?<![${W}])(?<analog>A\\d{1,2})(?![${W}])` +
  `|(?<![${W}])D(?<dnum>\\d{1,3})(?![${W}])` +
  `|(?<![${W}])(?<n1>-?\\d{1,3})\\s*(?:\\.|'|’)?\\s*(?:numaral[ıi]|nolu|no|nc[ıi])?\\s*` +
  `(?:pindeki|pininde|pine|pini|pin|pinde|pinden)` +
  `|(?:pin\\s*\\(?\\s*(?<n2>-?\\d{1,3}))` +
  `|(?<![${W}])(?<n3>-?\\d{1,3})\\s*(?:'|’)\\s*(?:deki|daki|de|da)`,
  "giu",
);

const LIST_RE = new RegExp(
  `(?<![${W}])(?<a>-?\\d{1,3})\\s*(?:,|ve)\\s*(?<b>-?\\d{1,3})\\s*` +
  `(?:numaral[ıi]|nolu|no)?\\s*(?:pindeki|pinlerde|pinler|pine|pini|pin|pinde|pinden)`,
  "giu",
);

const SSID_RE = /(?:[sS][sS][iI][dD]|[aA][gGğĞ]\s*[aA][dD][ıiİI])\s*[:=]?\s*['"]?([^\s'",;]+)/;
const PW_RE = /(?:[sSşŞ][iI][fF][rR][eE]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][aA][rR][oO][lL][aA])\s*[:=]?\s*['"]?([^\s'",;]+)/;
const URL_RE = /https?:\/\/[^\s'"]+/;

export function extractUrl(text) {
  const m = URL_RE.exec(text);
  return m ? m[0] : null;
}

export function extractWifiCreds(text) {
  const sm = SSID_RE.exec(text);
  const pm = PW_RE.exec(text);
  const ssid = sm ? sm[1].replace(/[.,;:]+$/, "") : null;
  const pw = pm ? pm[1].replace(/[.,;:]+$/, "") : null;
  return [ssid, pw];
}

export function rawToSpec(raw) {
  const r = String(raw).trim();
  if (/^-?\d{1,3}$/.test(r)) return PinSpec(r, "digital", Number(r));
  if (/^A\d{1,2}$/i.test(r)) {
    const up = r.toUpperCase();
    return PinSpec(up, "analog", null, Number(up.slice(1)));
  }
  return PinSpec(r, "digital", null);
}

function findPins(text) {
  const found = [];
  PIN_RE.lastIndex = 0;
  let m;
  while ((m = PIN_RE.exec(text)) !== null) {
    let raw = null;
    if (m.groups.gpio !== undefined) raw = m.groups.gpio;
    else if (m.groups.analog !== undefined) raw = m.groups.analog.toUpperCase();
    else if (m.groups.dnum !== undefined) raw = m.groups.dnum;
    else if (m.groups.n1 !== undefined) raw = m.groups.n1;
    else if (m.groups.n2 !== undefined) raw = m.groups.n2;
    else if (m.groups.n3 !== undefined) raw = m.groups.n3;
    if (raw === null) continue;
    found.push([rawToSpec(raw), m.index]);
    if (m[0].length === 0) PIN_RE.lastIndex++;
  }
  LIST_RE.lastIndex = 0;
  while ((m = LIST_RE.exec(text)) !== null) {
    const aIndex = m.index + m[0].indexOf(m.groups.a);
    const bIndex = m.index + m[0].lastIndexOf(m.groups.b);
    found.push([rawToSpec(m.groups.a), aIndex]);
    found.push([rawToSpec(m.groups.b), bIndex]);
  }
  found.sort((x, y) => x[1] - y[1]);
  const seen = new Set();
  const out = [];
  for (const [spec, pos] of found) {
    const key = `${spec.raw}\u0000${pos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([spec, pos]);
  }
  return out;
}

const TR_NUM = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10 };

export function intervalMs(ntext) {
  let m = /(\d+(?:[.,]\d+)?)\s*(?:ms|milisaniye[a-z]*|mili\s*saniye[a-z]*)/.exec(ntext);
  if (m) return Math.trunc(Number(m[1].replace(",", ".")));
  const words = Object.keys(TR_NUM).join("|");
  m = new RegExp(`\\b(${words}|yarim)\\s*(?:saniye[a-z]*|sn)\\b`).exec(ntext);
  if (m) return m[1] === "yarim" ? 500 : TR_NUM[m[1]] * 1000;
  m = /(\d+(?:[.,]\d+)?)\s*(?:saniye[a-z]*|sn|s)\b/.exec(ntext);
  if (m) return Math.trunc(Number(m[1].replace(",", ".")) * 1000);
  return null;
}

const ROLE_KW = {
  led: ["led"], led1: ["led"], led2: ["led"],
  button: ["buton", "dugme", "switch", "anahtar"],
  button1: ["buton", "dugme"], button2: ["buton", "dugme"],
  pot: ["potansiyometre", "analog", "ldr", "adc", "sensor"],
  pwm_led: ["pwm", "parlaklik", "fade"],
  servo: ["servo"],
  trig: ["trig"], echo: ["echo"],
  buzzer: ["buzzer", "hoparlor"],
  dht: ["dht", "sicaklik", "nem"],
};

export function parse(text) {
  const n = normTr(text);
  const req = {
    text, actions: [], libraries: [], unknown_modules: [], unsupported_features: [],
    missing: [], ambiguous: [], notes: [], user_pins: [],
  };
  const pins = findPins(text);
  req.user_pins = pins.map(([p]) => p);

  function takeNear(role, count = 1, window = 45) {
    const kws = ROLE_KW[role] || [];
    const chosen = [];
    for (const [p, pos] of pins) {
      if (chosen.some((c) => pinEquals(c, p))) continue;
      let hit = false;
      for (const kw of kws) {
        const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        let m;
        while ((m = re.exec(n)) !== null) {
          if (Math.abs(m.index - pos) <= window || Math.abs(m.index + m[0].length - pos) <= window) {
            hit = true;
            break;
          }
          if (m[0].length === 0) re.lastIndex++;
        }
        if (hit) break;
      }
      if (hit) chosen.push(p);
      if (chosen.length >= count) break;
    }
    return chosen;
  }

  function remainingPins() {
    const used = [];
    for (const a of req.actions) for (const p of Object.values(a.pins)) used.push(p);
    return pins.map(([p]) => p).filter((p) => !used.some((u) => pinEquals(u, p)));
  }

  const hasLed = n.includes("led");
  const hasBtn = ["buton", "dugme", "anahtar", "switch"].some((w) => n.includes(w));
  const hasTwo = n.includes("iki") || n.includes("2 ") || n.includes("2 adet");
  const hasPot = ["potansiyometre", "ldr"].some((w) => n.includes(w));
  const hasAnalog = n.includes("analog") || n.includes("adc");
  const hasPwm = n.includes("pwm") || n.includes("parlaklik") || n.includes("fade");
  const hasServo = n.includes("servo");
  const hasUs = ["ultrasonik", "hc-sr04", "hcsr04", "mesafe"].some((w) => n.includes(w));
  const hasBuzzer = ["buzzer", "hoparlor", "ton uret", "ses"].some((w) => n.includes(w));
  const hasDht = ["dht", "sicaklik", "nem sensor"].some((w) => n.includes(w));
  const hasLcd = n.includes("lcd");
  const hasI2c = n.includes("i2c");
  const hasWifi = ["wifi", "wi-fi"].some((w) => n.includes(w));
  const hasHttp = ["http", "istek", "get", "post", "web", "url"].some((w) => n.includes(w));
  const hasServer = ["sunucu", "server", "cevap veren"].some((w) => n.includes(w));
  const wantsScan = n.includes("tara") && n.includes("i2c");
  const unknownSensor = (n.includes("bilinmeyen") && (n.includes("sensor") || n.includes("modul"))) ||
    n.includes("tanimadigim") || n.includes("tanimiyorum");

  const interval = intervalMs(n);

  if (unknownSensor) {
    req.unknown_modules.push("bilinmeyen_sensor");
    req.notes.push("Istek, taninmayan bir sensor/modul iceriyor; API uydurulmaz.");
    return req;
  }

  if (hasServer) {
    req.unsupported_features.push("http_server");
    req.notes.push("HTTP/web SUNUCUSU modulu bu sistemde yok; Wi-Fi istemcisi (HTTPClient) kodu sunucu olarak SUNULMAZ.");
    return req;
  }

  if (hasBtn && hasLed) {
    const a = {
      module: (hasTwo && n.split("led").length - 1 >= 1 && hasTwo) ? "two_buttons_two_leds" : "button_led",
      pins: {}, params: {}, pin_order_raw: [],
    };
    if (a.module === "two_buttons_two_leds") {
      const bs = takeNear("button1", 2);
      const ls = takeNear("led1", 2);
      if (bs.length) a.pins.button1 = bs[0];
      if (bs.length > 1) a.pins.button2 = bs[1];
      if (ls.length) a.pins.led1 = ls[0];
      if (ls.length > 1) a.pins.led2 = ls[1];
    } else {
      const b = takeNear("button");
      const l = takeNear("led");
      if (b.length) a.pins.button = b[0];
      if (l.length) a.pins.led = l[0];
    }
    a.params.debounce_ms = 50;
    req.actions.push(a);
  } else if (hasLed && !hasPwm) {
    let a;
    if (["yakip sondur", "yanip son", "blink", "aralik", "periyot"].some((w) => n.includes(w)) || interval) {
      a = { module: "led_blink", pins: {}, params: {}, pin_order_raw: [] };
      if (interval) a.params.interval_ms = interval;
      const l = takeNear("led");
      if (l.length) a.pins.led = l[0];
    } else if (hasTwo) {
      a = { module: "two_leds", pins: {}, params: {}, pin_order_raw: [] };
      const ls = takeNear("led1", 2);
      if (ls.length) a.pins.led1 = ls[0];
      if (ls.length > 1) a.pins.led2 = ls[1];
    } else if (n.includes("sondur") && !n.includes("yak")) {
      a = { module: "led_off", pins: {}, params: {}, pin_order_raw: [] };
      const l = takeNear("led");
      if (l.length) a.pins.led = l[0];
    } else {
      a = { module: "led_on", pins: {}, params: {}, pin_order_raw: [] };
      const l = takeNear("led");
      if (l.length) a.pins.led = l[0];
    }
    req.actions.push(a);
  } else if (hasServo) {
    const a = { module: "servo_sweep", pins: {}, params: {}, pin_order_raw: [] };
    const p = takeNear("servo");
    if (p.length) a.pins.servo = p[0];
    req.actions.push(a);
  } else if (hasUs) {
    const a = { module: "ultrasonic_distance", pins: {}, params: {}, pin_order_raw: [] };
    const t = takeNear("trig");
    const e = takeNear("echo");
    const rem = remainingPins();
    if (t.length) a.pins.trig = t[0];
    else if (rem.length) a.pins.trig = rem[0];
    if (e.length) a.pins.echo = e[0];
    else if (rem.length > 1) a.pins.echo = rem[1];
    if (interval) a.params.interval_ms = interval;
    req.actions.push(a);
  } else if (hasBuzzer) {
    const a = { module: "buzzer_tone", pins: {}, params: {}, pin_order_raw: [] };
    const p = takeNear("buzzer");
    if (p.length) a.pins.buzzer = p[0];
    const fq = /(\d{2,5})\s*hz/.exec(n);
    if (fq) a.params.freq = Number(fq[1]);
    req.actions.push(a);
  } else if (hasDht) {
    const a = { module: "dht_read", pins: {}, params: {}, pin_order_raw: [] };
    const p = takeNear("dht");
    if (p.length) a.pins.dht = p[0];
    if (n.includes("dht22")) a.params.sensor_type = "DHT22";
    else if (n.includes("dht11")) a.params.sensor_type = "DHT11";
    req.actions.push(a);
  } else if (hasLcd) {
    const a = { module: "lcd_i2c_print", pins: {}, params: {}, pin_order_raw: [] };
    const m = /'([^']+)'|"([^"]+)"/.exec(text);
    if (m) a.params.text = m[1] || m[2];
    req.actions.push(a);
  } else if (hasI2c && wantsScan) {
    req.actions.push({ module: "i2c_scan", pins: {}, params: {}, pin_order_raw: [] });
  } else if (hasWifi && hasHttp) {
    const a = { module: "wifi_http_get", pins: {}, params: {}, pin_order_raw: [] };
    const url = extractUrl(text);
    const [ssid, pw] = extractWifiCreds(text);
    if (url) a.params.url = url;
    else req.missing.push("HTTP istegi icin hedef URL belirtilmedi.");
    if (ssid) a.params.ssid = ssid;
    else req.missing.push("Wi-Fi icin SSID belirtilmedi.");
    if (pw) a.params.password = pw;
    else req.missing.push("Wi-Fi icin sifre belirtilmedi.");
    if (n.includes("post")) req.notes.push("POST istendi; su an GET ornegi uretilir, POST icin govde gerekir.");
    req.actions.push(a);
  } else if (hasWifi) {
    const a = { module: "wifi_connect", pins: {}, params: {}, pin_order_raw: [] };
    const [ssid, pw] = extractWifiCreds(text);
    if (ssid) a.params.ssid = ssid;
    else req.missing.push("Wi-Fi icin SSID belirtilmedi.");
    if (pw) a.params.password = pw;
    else req.missing.push("Wi-Fi icin sifre belirtilmedi.");
    req.actions.push(a);
  } else if (hasPwm) {
    let a = { module: "pwm_fade", pins: {}, params: {}, pin_order_raw: [] };
    const p = takeNear("pwm_led");
    const valm = /(\d{1,3})\s*(?:deger|degeri|degerini|seviye)/.exec(n);
    if (valm && !n.includes("fade") && !n.includes("parlaklik")) {
      a = { module: "pwm_write", pins: {}, params: { value: Number(valm[1]) }, pin_order_raw: [] };
    }
    if (p.length) a.pins.pwm_led = p[0];
    req.actions.push(a);
  } else if (hasPot || (hasAnalog && ["oku", "yazdir", "seri", "goster"].some((w) => n.includes(w))) ||
      (pins.some(([pp]) => pp.kind === "analog") &&
        ["oku", "olc", "yazdir", "goster", "seri"].some((w) => n.includes(w)))) {
    const a = { module: "analog_read_serial", pins: {}, params: {}, pin_order_raw: [] };
    let p = takeNear("pot");
    if (!p.length && n.includes("a0")) p = [PinSpec("A0", "analog", null, 0)];
    if (!p.length && pins.length) p = [pins[0][0]];
    if (p.length) a.pins.pot = p[0];
    if (interval) a.params.interval_ms = interval;
    req.actions.push(a);
  } else if (hasAnalog) {
    const a = { module: "analog_read_serial", pins: {}, params: {}, pin_order_raw: [] };
    const p = takeNear("pot");
    if (p.length) a.pins.pot = p[0];
    req.actions.push(a);
  }

  const libs = [];
  for (const a of req.actions) {
    const md = getModule(a.module);
    if (md) libs.push(...md.libraries);
  }
  req.libraries = [...new Set(libs)].sort();

  if (!req.actions.length && !req.unknown_modules.length) {
    req.ambiguous.push("Istek yapilandirilamadi: hangi modul/eylem oldugu net degil.");
  }
  return req;
}

export { getBoard };
