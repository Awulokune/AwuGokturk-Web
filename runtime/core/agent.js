/* AwuGöktürk ajan çekirdeği — Python `agent.py` birebir portu.
 *
 * Boru hattı: Intent Router -> Board Resolver -> Requirement Parser ->
 * Code Generator -> AwuGuard -> statik ön kontrol -> Test Generator -> Response.
 * Sohbet ve kod üretimi kural/şablon tabanlıdır; 5K modeli yalnızca ipucudur.
 */

import * as IR from "./intent-router.js";
import * as CK from "./knowledge.js";
import * as RP from "./requirement-parser.js";
import { resolve as resolveBoard } from "./board-resolver.js";
import { generate, fillDefaults, makeContext, pinStr } from "./code-generator.js";
import { guardCheck } from "./awu-guard.js";
import { buildTests, logicTests, hardwarePlan } from "./test-generator.js";
import { MODEL_NAME } from "./knowledge.js";

const CODE_FENCE = /```(?:cpp|c\+\+|arduino|ino)?\s*([\s\S]*?)```/g;

export function extractUserCode(text) {
  const blocks = [];
  CODE_FENCE.lastIndex = 0;
  let m;
  while ((m = CODE_FENCE.exec(text)) !== null) blocks.push(m[1].trim());
  if (blocks.length) return blocks.filter(Boolean).join("\n").trim();
  const lines = [];
  for (const ln of String(text).split(/\r?\n/)) {
    if ([";", "pinMode", "digitalWrite", "analogRead", "analogWrite", "digitalRead",
      "void setup", "void loop"].some((t) => ln.includes(t))) lines.push(ln);
  }
  return lines.join("\n").trim();
}

export function analyzeConflicts(board, code) {
  const findings = [];
  const uses = new Map();
  const modes = new Map();
  const addUse = (pin, role) => {
    if (!uses.has(pin)) uses.set(pin, new Set());
    uses.get(pin).add(role);
  };
  const addMode = (pin, mode) => {
    if (!modes.has(pin)) modes.set(pin, []);
    modes.get(pin).push(mode);
  };

  let m;
  const modeRe = /pinMode\s*\(\s*([A-Za-z]?\d+)\s*,\s*(\w+)\s*\)/g;
  while ((m = modeRe.exec(code)) !== null) addMode(m[1], m[2]);
  const outRe = /(digitalWrite|analogWrite)\s*\(\s*([A-Za-z]?\d+)/g;
  while ((m = outRe.exec(code)) !== null) addUse(m[2], "out");
  const inRe = /(digitalRead|analogRead)\s*\(\s*([A-Za-z]?\d+)/g;
  while ((m = inRe.exec(code)) !== null) addUse(m[2], "in");
  const pwmRe = /analogWrite\s*\(\s*([A-Za-z]?\d+)/g;
  while ((m = pwmRe.exec(code)) !== null) addUse(m[1], "pwm");

  for (const [pin, mlist] of modes) {
    const out = mlist.some((x) => x === "OUTPUT");
    const inp = mlist.some((x) => x === "INPUT" || x === "INPUT_PULLUP");
    if (out && inp) {
      findings.push(["error", `Pin ${pin} ayni kodda hem OUTPUT hem INPUT olarak ` +
        `tanimlanmis -> pin cakismasi (${mlist.join(", ")}).`]);
    }
  }
  for (const [pin, roles] of uses) {
    if (roles.has("out") && roles.has("in")) {
      findings.push(["error", `Pin ${pin} hem giris hem cikis olarak kullaniliyor (pin cakismasi).`]);
    }
  }
  for (const [pin, mlist] of modes) {
    const roles = uses.get(pin) || new Set();
    if (mlist.includes("OUTPUT") && roles.has("in")) {
      findings.push(["error", `Pin ${pin} OUTPUT tanimli ama okuma icin kullaniliyor.`]);
    }
    if ((mlist.includes("INPUT") || mlist.includes("INPUT_PULLUP")) && roles.has("out")) {
      findings.push(["error", `Pin ${pin} giris (INPUT) tanimli ama yazma icin kullaniliyor.`]);
    }
  }

  if (board) {
    const allPins = [...new Set([...uses.keys(), ...modes.keys()])];
    for (const pin of allPins) {
      const spec = board.resolvePin(pin);
      if (spec === null) {
        findings.push(["warning", `Pin '${pin}' cozumlenemedi.`]);
        continue;
      }
      const [ok, err] = board.checkPin(spec, "any");
      if (!ok) findings.push(["error", `${board.display_name} icin ${err}`]);
    }
    const awRe = /analogWrite\s*\(\s*(\d+)/g;
    while ((m = awRe.exec(code)) !== null) {
      const num = Number(m[1]);
      if (!board.isPwm(num)) {
        findings.push(["error", `analogWrite pin ${num}: ${board.display_name} ` +
          `PWM desteklemiyor (PWM: ${[...board.pwm_pins].sort((a, b) => a - b).join(", ")}).`]);
      }
    }
  }
  return findings;
}

/* Gerçek derleme DEĞİL: yalnızca yapısal ön kontrol. Bu sonuç asla "derlendi"
 * olarak sunulmaz. Tarayıcıda AVR/ESP32 araç zinciri yoktur. */
export function staticCheck(code) {
  const issues = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  let i = 0;
  let line = 1;
  let state = "code";
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === "\n") line++;
    if (state === "code") {
      if (ch === "/" && next === "/") { state = "line-comment"; i += 2; continue; }
      if (ch === "/" && next === "*") { state = "block-comment"; i += 2; continue; }
      if (ch === '"') { state = "string"; i++; continue; }
      if (ch === "'") { state = "char"; i++; continue; }
      if ("([{".includes(ch)) stack.push([ch, line]);
      else if (")]}".includes(ch)) {
        const top = stack.pop();
        if (!top || top[0] !== pairs[ch]) issues.push(`Satır ${line}: eşleşmeyen '${ch}'.`);
      }
    } else if (state === "line-comment") {
      if (ch === "\n") state = "code";
    } else if (state === "block-comment") {
      if (ch === "*" && next === "/") { state = "code"; i += 2; continue; }
    } else if (state === "string" || state === "char") {
      if (ch === "\\") { i += 2; continue; }
      if ((state === "string" && ch === '"') || (state === "char" && ch === "'")) state = "code";
    }
    i++;
  }
  for (const [ch, ln] of stack) issues.push(`Satır ${ln}: kapatılmayan '${ch}'.`);
  if (!/void\s+setup\s*\(/.test(code)) issues.push("'void setup()' bulunamadı.");
  if (!/void\s+loop\s*\(/.test(code)) issues.push("'void loop()' bulunamadı.");
  return {
    ran: true,
    ok: issues.length === 0,
    tool: "js-static",
    kind: "static",
    returncode: issues.length ? 1 : 0,
    stderr: issues.join("\n"),
    note: "Bu bir DERLEME DEĞİLDİR. Tarayıcıda AVR/ESP32 araç zinciri yoktur; yalnızca " +
      "parantez dengesi ve setup/loop varlığı kontrol edildi. Gerçek hedef derleme ve " +
      "donanım testi kullanıcıya aittir.",
  };
}

function response(props = {}) {
  return {
    status: "info", message: "", board: null, framework: null, code: null,
    intent: null, modules: [], libraries: [], wiring: [], assumptions: [],
    guard: [], build: {}, tests: [], hardware_plan: [], questions: [], notes: [],
    classifier_hint: null,
    ...props,
  };
}

function mask(text, secrets) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("***");
  return out;
}

export class AwuGokturkAgent {
  constructor({ useClassifier = true } = {}) {
    this.useClassifier = useClassifier;
  }

  _identityResponse(intentRes, text) {
    const n = CK.norm(text);
    let subtype;
    if (CK.isNameOnly(text)) subtype = "name";
    else if (["bilmedig", "bilmiyor", "uydur", "emin degil", "yanlis bilgi", "halusinasyon",
      "guvenilir", "cevap vermeye calis"].some((w) => n.includes(w))) subtype = "honesty";
    else if (["neler yapabilir", "ne yapabilir", "yetenek", "neler yapsin", "neler yaparsin"]
      .some((w) => n.includes(w))) subtype = "capabilities";
    else if (n.includes("gorevim") || n.includes("gorevin")) subtype = "role";
    else subtype = "who";
    return response({
      status: "info", intent: IR.IDENTITY, message: CK.identityAnswer(subtype),
      notes: ["Yanıt yerel bilgi kaynağından üretilir; 5K modeli genel sohbet için kullanılmaz."],
      classifier_hint: intentRes.classifier_hint,
    });
  }

  _smalltalkResponse(intentRes, text) {
    const n = CK.norm(text);
    let msg;
    if (["tesekkur", "sagol", "sag ol", "rica ederim"].some((w) => n.includes(w))) {
      msg = "Rica ederim! Yardımcı olabileceğim başka bir şey olursa buradayım.";
    } else if (["gorusuruz", "hosca kal", "hosca", "iyi geceler", "iyi aksamlar", "gule gule",
      "kendine iyi bak"].some((w) => n.includes(w))) {
      msg = "Görüşmek üzere! İhtiyaç duyduğunuzda buradayım.";
    } else {
      msg = "Anladım. Ne konuşmak isterseniz buradayım.";
    }
    return response({
      status: "info", intent: IR.GENERAL_CHAT, message: msg,
      classifier_hint: intentRes.classifier_hint,
    });
  }

  _creativeResponse(intentRes, text) {
    const [message] = CK.creativeAnswer(text);
    return response({
      status: "info", intent: IR.CREATIVE_WRITING, message,
      notes: ["Yaratıcı yazarlık yalnızca kısa, sabit örneklerle karşılanır; genel amaçlı bir dil modeli DEĞİLİM."],
      classifier_hint: intentRes.classifier_hint,
    });
  }

  _factsResponse(intentRes, text) {
    const fact = CK.lookupFact(text);
    if (fact === null) {
      return response({
        status: "unsupported", intent: IR.FACTS, message: CK.unsupportedMessage(),
        classifier_hint: intentRes.classifier_hint,
      });
    }
    return response({
      status: "info", intent: IR.FACTS, message: fact.answer,
      notes: ["Bu bilgi, yerel ve elle doğrulanmış genel bilgi kaynağından gelir; 5K modeli kullanılmadı."],
      classifier_hint: intentRes.classifier_hint,
    });
  }

  _conceptResponse(intentRes, text) {
    const topic = CK.lookupTopic(text);
    if (topic !== null) {
      const notes = ["Bu yanıt yerel, doğrulanmış Türkçe bilgi kaynağından gelir; 5K modeli kullanılmadı."];
      if (topic.related && topic.related.length) {
        notes.push("İlgili konular: " + topic.related.join(", ") + ".");
      }
      return response({
        status: "info", intent: IR.CONCEPT, message: topic.answer, notes,
        classifier_hint: intentRes.classifier_hint,
      });
    }
    const n = CK.norm(text);
    for (const [key, ans] of Object.entries(CK.CONCEPTS)) {
      if (n.includes(key)) {
        return response({
          status: "info", intent: IR.CONCEPT, message: ans,
          classifier_hint: intentRes.classifier_hint,
          notes: ["Bu yanıt yerel (kural tabanlı) bilgi kaynağından gelir; 5K modeli kullanılmadı."],
        });
      }
    }
    return response({
      status: "needs_info", intent: IR.CONCEPT,
      classifier_hint: intentRes.classifier_hint,
      message: CK.conceptMissMessage(),
      questions: ["Konuyu kapsam dahilindeki bir başlıkla (ör. CPU, RAM, ADC, PWM, I2C, HTTP sunucu/istemci) yeniden ifade eder misiniz?"],
    });
  }

  _capabilityProblems(board, req) {
    const problems = [];
    let boardIncompat = false;
    const usesWifi = req.unsupported_features.includes("http_server") ||
      req.actions.some((a) => a.module === "wifi_connect" || a.module === "wifi_http_get");
    if (usesWifi && board && !board.supports("wifi")) {
      boardIncompat = true;
      problems.push(`${board.display_name} Wi-Fi donanimina sahip DEGILDIR; Wi-Fi/HTTP gorevleri ` +
        `yalnizca ESP32'de desteklenir. Kart degistirilmedi (${board.display_name}).`);
    }
    if (req.unsupported_features.includes("http_server")) {
      problems.push("HTTP/web SUNUCUSU modulu bu sistemde yok; Wi-Fi istemcisi (HTTPClient) " +
        "kodu sunucu olarak SUNULMAZ.");
    }
    return [problems, boardIncompat];
  }

  _generate(text, intentRes, boardHint = null) {
    const req = RP.parse(text);

    const neg = req.user_pins.filter((p) => p.number !== null && p.number < 0);
    if (neg.length) {
      return response({
        status: "error", intent: intentRes.intent,
        message: "Gecersiz pin numarasi: negatif pin kabul edilmez ve varsayilana cevrilmez. " +
          "Lutfen gecerli bir pin numarasi verin.",
        guard: neg.map((p) => ["error", `Gecersiz (negatif) pin: ${p.raw}`]),
        questions: ["Gecerli bir pin numarasi belirtin (or. Uno icin 0-13 / A0-A5)."],
        classifier_hint: intentRes.classifier_hint,
      });
    }

    if (req.unknown_modules.length) {
      return response({
        status: "unsupported", intent: intentRes.intent,
        message: "Isteginiz taninmayan bir sensor/modul iceriyor. Var olmayan API veya kutuphane UYDURMAYACAGIM.",
        questions: ["Sensor/modulun tam adini, veri sayfasini veya kullandigi kutuphaneyi paylasir misiniz?",
          "Baglanti arayuzu (I2C/SPI/analog/dijital) nedir?"],
        classifier_hint: intentRes.classifier_hint,
      });
    }

    const br = resolveBoard(boardHint || text, true);
    if (br.unsupported) {
      return response({
        status: "unsupported", intent: intentRes.intent, message: br.unsupported,
        classifier_hint: intentRes.classifier_hint,
      });
    }
    if (br.needs_board && br.board === null) {
      return response({
        status: "needs_info", intent: intentRes.intent,
        message: "Kod uretmeden once hedef karti netlestirmem gerekiyor; pinler ve donanim " +
          "ozellikleri karta gore degisir.",
        questions: br.question ? [br.question] : [],
        classifier_hint: intentRes.classifier_hint,
      });
    }

    const [problems, boardIncompat] = this._capabilityProblems(br.board, req);
    if (problems.length) {
      return response({
        status: boardIncompat ? "error" : "unsupported",
        intent: intentRes.intent,
        board: br.board ? br.board.display_name : null, framework: br.framework,
        message: "Istek desteklenmiyor (kod uretilmedi): " + problems.join(" "),
        guard: problems.map((p) => ["error", p]),
        notes: [...req.notes],
        classifier_hint: intentRes.classifier_hint,
      });
    }

    if (!req.actions.length) {
      return response({
        status: "needs_info", intent: intentRes.intent,
        board: br.board.display_name, framework: br.framework,
        message: "Istekten somut bir modul/eylem cikaramadim.",
        questions: ["Hangi modulu nasil kullanmak istiyorsunuz?"],
        notes: req.ambiguous,
        classifier_hint: intentRes.classifier_hint,
      });
    }

    const board = br.board;
    const assumptions = [...(br.assumed || [])];
    const [defaulted, unresolved] = fillDefaults(board, req.actions);
    for (const [mod, role, p] of defaulted) {
      assumptions.push(`${mod}: '${role}' pini belirtilmedi -> guvenli varsayilan pin ${p} (kullanildi).`);
    }
    if (unresolved.length) {
      return response({
        status: "needs_info", intent: intentRes.intent,
        board: board.display_name, framework: br.framework,
        message: "Bazi roller icin guvenli varsayilan pin bulunamadi; lutfen pin belirtin.",
        questions: unresolved.map(([mod, r]) => `${mod} / ${r} icin pin belirtin.`),
        assumptions,
      });
    }

    const ctx = makeContext();
    let code;
    let parts;
    try {
      [code, parts] = generate(board, req.actions, ctx);
    } catch (e) {
      return response({
        status: "error", intent: intentRes.intent,
        board: board.display_name, framework: br.framework,
        message: `Kod uretilemedi: ${e.message || e}`,
        classifier_hint: intentRes.classifier_hint,
      });
    }

    const guard = guardCheck(board, req, req.actions, code, parts);
    const guardPairs = guard.findings.map((f) => [f.level, f.message]);

    let wiring = [];
    let notes = [];
    for (const p of parts) { wiring.push(...p.wiring); notes.push(...p.notes); }
    wiring = [...new Set(wiring)];
    notes = [...new Set(notes)];
    if (br.notes) notes.push(...br.notes);

    const questions = [...req.missing];
    let status = "ok";
    if (guard.errors.length) status = "error";
    else if (questions.length || notes.some((n) => n.includes("placeholder"))) status = "needs_info";

    const resp = response({
      status, intent: intentRes.intent, board: board.display_name,
      framework: br.framework, modules: req.actions.map((a) => a.module),
      libraries: req.libraries, wiring, assumptions,
      guard: guardPairs, questions, notes,
      classifier_hint: intentRes.classifier_hint,
      message: status === "ok"
        ? "Kod uretildi ve AwuGuard'dan gecti."
        : (status === "error"
          ? "AwuGuard hata buldu; kod GUVENILIR sayilmaz."
          : "Kod uretildi ancak bazi bilgiler eksik/asSUMED; asagiya bakin."),
    });

    const secrets = req.actions.map((a) => a.params.password).filter(Boolean);
    if (secrets.length) {
      resp.notes = resp.notes.map((x) => mask(x, secrets));
      resp.questions = resp.questions.map((x) => mask(x, secrets));
      resp.assumptions = resp.assumptions.map((x) => mask(x, secrets));
      resp.message = mask(resp.message, secrets);
      resp.guard = resp.guard.map(([lvl, msg]) => [lvl, mask(msg, secrets)]);
    }

    if (status === "error") return resp;
    resp.code = code;
    resp.build = staticCheck(code);
    resp.tests = [...buildTests(), ...logicTests(board, req.actions)];
    resp.hardware_plan = hardwarePlan(board, req.actions);
    return resp;
  }

  _debugOrTransform(text, intentRes) {
    const code = extractUserCode(text);
    if (!code) {
      return response({
        status: "needs_info", intent: intentRes.intent,
        message: "Inceleyebilmem icin kodu paylasmaniz gerekiyor.",
        questions: ["Hata ayiklanacak kodu ```...``` blogu icinde veya satirlar halinde paylasin.",
          "Hedef kart nedir? (pin dogrulamasi icin)"],
        classifier_hint: intentRes.classifier_hint,
      });
    }
    const br = resolveBoard(text, false);
    const board = br.board;
    const findings = analyzeConflicts(board, code);
    const status = "info";
    let msg = "Kod incelendi. " + (findings.length
      ? "Pin cakismasi/gecersiz kullanim BULUNDU."
      : "Belirgin bir pin cakismasi bulunmadi.");
    if (board === null) {
      msg += " (Kart belirtilmedi; pin araligi/ozellik dogrulamasi yapilamadi.)";
    }
    return response({
      status, intent: intentRes.intent,
      board: board ? board.display_name : null,
      message: msg,
      guard: findings,
      questions: board ? [] : ["Tam pin dogrulamasi icin hedef karti belirtin (Uno/Mega/ESP32)."],
      classifier_hint: intentRes.classifier_hint,
      notes: ["Bu analiz kural tabanlidir; gercek derleme/calistirma dogrulamasi degildir."],
    });
  }

  handleRaw(text, { boardHint = null, classifier = null, useClassifier = null } = {}) {
    const useClf = useClassifier === null ? this.useClassifier : !!useClassifier;
    const intentRes = IR.route(text, { useClassifier: useClf, classifier });
    const intent = intentRes.intent;

    if (intent === IR.GREETING) {
      const n = CK.norm(text);
      const msg = n.includes("nasilsin")
        ? "İyiyim, teşekkür ederim! Ben AwuGöktürk; Arduino Uno R3, Mega 2560 ve klasik ESP32 " +
          "için gömülü kod üretebilirim. Siz nasılsınız, yardımcı olabileceğim bir şey var mı?"
        : "Merhaba! Ben AwuGöktürk. Arduino Uno R3, Arduino Mega 2560 ve klasik ESP32 için " +
          "desteklenen gömülü kodları üretebilir, mevcut kodu inceleyebilir ve gereksinimleri " +
          "netleştirebilirim. Örneğin: 'Arduino Uno'da 7. pin'deki LED'i yak.'";
      return response({
        status: "greeting", intent, message: msg,
        notes: ["Kod isteyeceğinizde kartı belirtmeniz yeterli; sohbette kart şart değil."],
      });
    }
    if (intent === IR.IDENTITY) return this._identityResponse(intentRes, text);
    if (intent === IR.GENERAL_CHAT) return this._smalltalkResponse(intentRes, text);
    if (intent === IR.CREATIVE_WRITING) return this._creativeResponse(intentRes, text);
    if (intent === IR.FACTS) return this._factsResponse(intentRes, text);
    if (intent === IR.CONCEPT) return this._conceptResponse(intentRes, text);
    if (intent === IR.DEBUG || intent === IR.TRANSFORM) return this._debugOrTransform(text, intentRes);
    if (intent === IR.UNSUPPORTED) {
      return response({
        status: "unsupported", intent, message: CK.unsupportedMessage(),
        notes: ["Emin olmadığım bir konuda cevap üretmedim."],
      });
    }
    return this._generate(text, intentRes, boardHint);
  }

  handle(text, opts = {}) {
    const r = this.handleRaw(text, opts);
    return {
      status: r.status,
      category: r.intent ? IR.categoryFor(r.intent) : null,
      intent: r.intent,
      message: r.message,
      board: r.board,
      framework: r.framework,
      code: r.code,
      modules: [...r.modules],
      libraries: [...r.libraries],
      wiring: [...r.wiring],
      assumptions: [...r.assumptions],
      guard: r.guard.map(([level, message]) => ({ level, message })),
      build: r.build,
      tests: [...r.tests],
      hardware_plan: [...r.hardware_plan],
      questions: [...r.questions],
      notes: [...r.notes],
      classifier_hint: r.classifier_hint,
      model_name: MODEL_NAME,
    };
  }
}
