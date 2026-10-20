/* Intent Router — Python `intent_router.py` birebir portu.
 * Kural tabanlı sinyaller birincildir; 5K sınıflandırıcı yalnızca ipucudur.
 */

import { norm, escapeRegExp } from "./util.js";
import { isNameOnly, lookupFact } from "./knowledge.js";

export const CODE_GENERATION = "code_generation";
export const CONCEPT = "concept_explanation";
export const DEBUG = "debug";
export const TRANSFORM = "code_transform";
export const PROJECT = "project_scaffold";
export const CONCEPT_OR_INFO = "info";
export const GREETING = "greeting";
export const IDENTITY = "identity";
export const GENERAL_CHAT = "general_chat";
export const CREATIVE_WRITING = "creative_writing";
export const FACTS = "general_knowledge";
export const UNSUPPORTED = "unsupported_or_unclear";
export const NEEDS_INFO = "needs_info";

export const CAT_GREETING = "greeting";
export const CAT_IDENTITY = "identity";
export const CAT_GENERAL_CHAT = "general_chat";
export const CAT_CREATIVE = "creative_writing";
export const CAT_KNOWLEDGE = "general_knowledge";
export const CAT_CONCEPT = "concept_explanation";
export const CAT_EMBEDDED = "embedded_coding";
export const CAT_UNSUPPORTED = "unsupported";

const CATEGORY = {
  [GREETING]: CAT_GREETING,
  [IDENTITY]: CAT_IDENTITY,
  [GENERAL_CHAT]: CAT_GENERAL_CHAT,
  [CREATIVE_WRITING]: CAT_CREATIVE,
  [FACTS]: CAT_KNOWLEDGE,
  [CONCEPT]: CAT_CONCEPT,
  [CODE_GENERATION]: CAT_EMBEDDED,
  [DEBUG]: CAT_EMBEDDED,
  [TRANSFORM]: CAT_EMBEDDED,
  [PROJECT]: CAT_EMBEDDED,
  [CONCEPT_OR_INFO]: CAT_EMBEDDED,
  [NEEDS_INFO]: CAT_EMBEDDED,
  [UNSUPPORTED]: CAT_UNSUPPORTED,
};

export function categoryFor(intent) {
  return CATEGORY[intent] || CAT_UNSUPPORTED;
}

const GREETINGS = new Set(["merhaba", "selam", "selamlar", "gunaydin", "iyi gunler", "hey", "hi",
  "hello", "slm", "mrb", "nasilsin", "nasilsiniz"]);

const IDENTITY_WORDS = ["sen kimsin", "kimsin", "sen nesin", "sen kim", "kim oldugun",
  "gorevin ne", "goreviniz ne", "gorevin", "gorevimiz",
  "neler yapabilirsin", "neler yapabilir", "ne yapabilirsin", "ne yapabilir",
  "ne yaparsin", "yeteneklerin", "neler yaparsin", "kendini tanit",
  "adin ne", "ismin ne", "adini soyle",
  "bilmiyorsan", "bilmiyorsan bile", "cevap vermeye calis", "uydur"];

const SMALLTALK_WORDS = ["tesekkur", "sagol", "sag ol", "gorusuruz", "hosca kal", "hosca",
  "iyi geceler", "iyi aksamlar", "kendine iyi bak", "rica ederim", "gule gule", "naber"];

const CREATIVE_WORDS = ["hikaye", "masal", "siir", "bilim kurgu", "bilimkurgu", "roman", "oyku",
  "fabl", "senaryo", "hikaye anlat", "hikaye yaz"];

const DEBUG_WORDS = ["hata", "yanlis", "cakis", "calismi", "neden calism", "duzelt", "debug",
  "problem", "sorun", "hatali", "duzeltir misin", "bozuk"];
const CONCEPT_WORDS = ["nedir", "ne ise yarar", "ne yapar", "ne demek", "farki nedir", "acikla",
  "aciklar misin", "ornek ver", "nasil calisir", "ne anlama", "ne ise yarıyor"];
const TRANSFORM_WORDS = ["cevir", "donustur", "refactor", "yeniden duzenle", "iyilestir",
  "optimize", "modernize", "port et", "uyarla"];
const PROJECT_WORDS = ["proje", "iskelet", "birden fazla", "hepsini", "tam sistem", "kur"];
const GEN_VERBS = ["yaz", "yak", "sondur", "oku", "uret", "kontrol et", "olustur", "kullan",
  "baslat", "ekle", "goster", "yazdir", "baglan", "gonder", "cevir"];
const HW_WORDS = ["led", "buton", "potansiyometre", "ldr", "sicaklik", "nem", "dht", "servo",
  "motor", "ultrasonik", "mesafe", "buzzer", "hoparlor", "lcd", "oled", "ekran",
  "pwm", "analog", "dijital", "pin", "gpio", "i2c", "spi", "uart", "seri",
  "wifi", "wi-fi", "bluetooth", "http", "mqtt", "role", "mosfet", "step motor",
  "adc", "sensor", "kesme", "interrupt", "zamanlayici", "timer", "eeprom", "sd"];
const BOARD_WORDS = ["arduino", "uno", "mega", "esp32", "esp-32", "wroom", "rp2040", "pico",
  "nano", "leonardo", "micro", "esp8266", "d1 mini"];

export function route(text, { useClassifier = true, classifier = null } = {}) {
  const n = norm(text);
  const signals = [];
  const notes = [];

  const stripped = n.trim().replace(/^[.!? ]+|[.!? ]+$/g, "");
  if (!stripped || GREETINGS.has(stripped) ||
      /^(merhaba|selam|hi|hello|hey)[!. ]*$/.test(stripped)) {
    return {
      intent: GREETING, needs_board: false, rule_signals: ["greeting"],
      classifier_label: null, classifier_hint: null, disagree: false, notes: [],
      category: CAT_GREETING,
    };
  }

  const hasHw = HW_WORDS.some((w) => n.includes(w));
  const hasBoard = BOARD_WORDS.some((w) => n.includes(w));
  const isDebug = DEBUG_WORDS.some((w) => n.includes(w)) || /\bbug\b/.test(n);
  const isConcept = CONCEPT_WORDS.some((w) => n.includes(w));
  const isTransform = TRANSFORM_WORDS.some((w) => n.includes(w));
  const isProject = PROJECT_WORDS.some((w) => n.includes(w));
  const isGen = GEN_VERBS.some((w) => n.includes(w));
  const isNameOnlyText = isNameOnly(text);
  const isIdentity = isNameOnlyText || IDENTITY_WORDS.some((w) => n.includes(w));
  const isSmalltalk = SMALLTALK_WORDS.some((w) => n.includes(w));
  const isCreative = CREATIVE_WORDS.some((w) => n.includes(w));

  const hasGreetTok = /\b(merhaba|selam|selamlar|gunaydin|gunaydinlar|iyi gunler|hey|hello|hi|slm|mrb)\b/.test(n);
  const hasPoliteness = n.includes("nasilsin") || n.includes("nasilsiniz");
  const isGreetingSoft = (hasGreetTok || hasPoliteness) &&
    !(hasHw || isGen || isDebug || isProject || isTransform);

  const fact = lookupFact(text);

  let intent;
  if (isIdentity) {
    intent = IDENTITY;
    signals.push("identity:isim/kimlik");
  } else if (isCreative) {
    intent = CREATIVE_WRITING;
    signals.push("creative_writing:anahtar kelime");
  } else if (isGreetingSoft) {
    intent = GREETING;
    signals.push("greeting:selamlama+nezaket");
  } else if (isSmalltalk) {
    intent = GENERAL_CHAT;
    signals.push("general_chat:nezaket kalibi");
  } else if (fact !== null) {
    intent = FACTS;
    signals.push("general_knowledge:dogrulanmis kayit");
  } else if (isDebug && (n.includes("kod") || n.includes("pin") || n.includes("cakis") ||
      n.includes("bu ") || n.includes("su "))) {
    intent = DEBUG;
    signals.push("debug:anahtar kelime");
  } else if (isTransform) {
    intent = TRANSFORM;
    signals.push("transform:anahtar kelime");
  } else if (isConcept && !isGen) {
    intent = CONCEPT;
    signals.push("concept:soru kaliplari");
  } else if (isProject && hasHw) {
    intent = PROJECT;
    signals.push("project:anahtar kelime");
  } else if (hasHw) {
    intent = CODE_GENERATION;
    signals.push("code_generation:donanim+eylem");
  } else if (isGen) {
    intent = CODE_GENERATION;
    signals.push("code_generation:eylem");
  } else {
    intent = UNSUPPORTED;
    signals.push("belirsiz");
  }

  const needsBoard = (intent === CODE_GENERATION || intent === PROJECT) && !hasBoard;

  let clfLabel = null;
  let clfHint = null;
  let disagree = false;
  if (useClassifier && [CODE_GENERATION, PROJECT, DEBUG, TRANSFORM, CONCEPT].includes(intent)) {
    const cres = classifier ? classifier.predict(text) : { available: false, note: "5K (lite) agirliklari bulunamadi." };
    if (cres.available) {
      clfLabel = cres.label;
      clfHint = cres.intent_hint;
      const compat = [
        clfHint === "code_generation" && (intent === CODE_GENERATION || intent === PROJECT),
        clfHint === intent,
      ];
      if (!compat.some(Boolean)) {
        disagree = true;
        notes.push(`5K ipucu '${clfLabel}' farkli; kural tabani kullanildi.`);
      }
    } else {
      notes.push(cres.note || "5K (lite) agirliklari bulunamadi.");
    }
  }

  return {
    intent, needs_board: needsBoard, rule_signals: signals,
    classifier_label: clfLabel, classifier_hint: clfHint,
    disagree, notes, category: categoryFor(intent),
  };
}

export { escapeRegExp };
