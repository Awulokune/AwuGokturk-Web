/* AwuGuard — Python `awu_guard.py` portu. Halüsinasyon/elektriksel ön kontroller. */

import { getModule, libraryInfo, T_DIGITAL_OUT, T_DIGITAL_IN } from "./knowledge.js";
import { pinStr } from "./code-generator.js";

export function guardCheck(board, requirements, actions, code) {
  const findings = [];
  const add = (level, codeName, message) => findings.push({ level, code: codeName, message });
  if (!board) {
    add("info", "no_board", "Kart profili yok; kart-bagimli kontroller atlandi.");
    return { findings, errors: [], warnings: [], ok: true };
  }

  const pinUsers = new Map();
  for (const a of actions) {
    const md = getModule(a.module);
    if (!md) {
      add("error", "unknown_module", `Bilinmeyen modul: ${a.module}`);
      continue;
    }
    if (!md.families.has(board.family)) {
      add("error", "family_unsupported",
        `'${md.name_tr}' ${board.display_name} icin desteklenmiyor ` +
        `(desteklenen aileler: ['${[...md.families].sort().join("', '")}']).`);
    }
    for (const lib of md.libraries) {
      if (!board.supportsLibrary(lib)) {
        add("error", "lib_unsupported",
          `'${lib}' kutuphanesi ${board.display_name} ile uyumlu degil.`);
      }
    }
    for (const [role, sp] of Object.entries(a.pins)) {
      const rq = md.roles[role];
      if (!rq) continue;
      const [ok, err, warn] = board.checkPin(sp, rq.role_type);
      if (!ok) add("error", "bad_pin", `[${md.name_tr}] ${rq.label_tr}: ${err}`);
      else if (warn) add("warning", "pin_warn", `[${md.name_tr}] ${rq.label_tr}: ${warn}`);
      let eff = sp.number;
      if ((eff === null || eff === undefined) && sp.kind === "analog" && sp.channel !== null) {
        eff = board.analog_labels[`A${sp.channel}`] ?? null;
      }
      if (eff !== null && eff !== undefined) {
        if (!pinUsers.has(eff)) pinUsers.set(eff, []);
        pinUsers.get(eff).push([a.module, role, rq.role_type]);
      }
    }
  }

  for (const num of [...pinUsers.keys()].sort((a, b) => a - b)) {
    const users = pinUsers.get(num);
    if (users.length > 1) {
      const roles = users.map(([m, r]) => `${m}:${r}`).join(", ");
      const directions = new Set(users.map(([, , t]) => t));
      const lvl = directions.has(T_DIGITAL_OUT) && directions.has(T_DIGITAL_IN) ? "error" : "warning";
      add(lvl, "pin_conflict",
        `Pin ${num} birden fazla rol icin kullaniliyor (${roles}) -> pin cakismasi.`);
    }
  }

  for (const sp of (requirements && requirements.user_pins) || []) {
    const target = pinStr(sp);
    if (target && !code.includes(target)) {
      add("error", "pin_changed",
        `Istenen pin '${sp.raw}' uretilen kodda bulunamadi (varsayilana cevrilmis olabilir).`);
    }
  }

  for (const a of actions) {
    const md = getModule(a.module);
    if (!md) continue;
    for (const [pname, pd] of Object.entries(md.params)) {
      if (pd.required && (!(pname in a.params) || a.params[pname] === null || a.params[pname] === "")) {
        add("warning", "missing_param",
          `[${md.name_tr}] Zorunlu parametre eksik: ${pd.label_tr} (${pname}). ` +
          "Placeholder ile uretildi; lutfen degeri belirtin.");
      }
    }
  }

  const usedLibs = requirements ? requirements.libraries : [];
  for (const lib of usedLibs) {
    const info = libraryInfo(lib);
    if (!info) continue;
    for (const h of info.headers) {
      if (!code.includes(h)) {
        add("warning", "missing_include", `'${lib}' kullaniliyor ama '${h}' dahil edilmemis olabilir.`);
      }
    }
  }

  if (board.family === "esp32") {
    for (const a of actions) {
      if (a.module === "ultrasonic_distance") {
        add("warning", "level_shift",
          "HC-SR04 ECHO 5V verir; ESP32 3.3V oldugu icin gerilim bolucu gerekir.");
      }
      if (["dht_read", "lcd_i2c_print", "servo_sweep"].includes(a.module)) {
        add("info", "power_3v3",
          `${board.display_name} 3,3V lojik kullanir; 5V modullerde seviye/besleme uyumunu kontrol edin.`);
      }
    }
  }

  const errors = findings.filter((f) => f.level === "error");
  const warnings = findings.filter((f) => f.level === "warning");
  return { findings, errors, warnings, ok: errors.length === 0 };
}
