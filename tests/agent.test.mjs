import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AwuGokturkAgent, staticCheck, analyzeConflicts, extractUserCode,
} from "../runtime/core/agent.js";
import { LiteClassifier } from "../runtime/core/classifier.js";

const modelData = JSON.parse(fs.readFileSync(
  new URL("../runtime/model/classifier5k.json", import.meta.url), "utf8"));
const classifier = new LiteClassifier().loadFromObject(modelData);
const agent = new AwuGokturkAgent({ useClassifier: true });

test("selamlama kural tabanlı ve kısa devre", () => {
  const r = agent.handle("merhaba", { classifier });
  assert.equal(r.status, "greeting");
  assert.equal(r.intent, "greeting");
  assert.equal(r.category, "greeting");
  assert.match(r.message, /AwuGöktürk/);
  assert.equal(r.code, null);
});

test("kimlik yanıtı modeli genel amaçlı LLM olarak sunmaz", () => {
  const r = agent.handle("sen kimsin", { classifier });
  assert.equal(r.status, "info");
  assert.equal(r.intent, "identity");
  assert.match(r.message, /AwuGöktürk/);
  assert.match(r.message, /Genel amaçlı bir sohbet modeli değilim/i);
  assert.equal(r.code, null);
});

test("Uno LED blink gerçek kural tabanlı kod üretir", () => {
  const r = agent.handle("Arduino Uno'da 7. pindeki LED'i 500 ms aralıkla yakıp söndür.", { classifier });
  assert.equal(r.status, "ok");
  assert.equal(r.board, "Arduino Uno R3");
  assert.equal(r.framework, "arduino");
  assert.equal(r.intent, "code_generation");
  assert.equal(r.classifier_hint, "code_generation");
  assert.ok(r.code && r.code.includes("#include <Arduino.h>"));
  assert.match(r.code, /pinMode\(LED_PIN,\s*OUTPUT\)/);
  assert.match(r.code, /const int LED_PIN = 7;/);
  assert.match(r.code, /const unsigned long INTERVAL_MS = 500;/);
  assert.match(r.code, /void setup\(\)/);
  assert.match(r.code, /void loop\(\)/);
  assert.ok(r.tests.some((t) => t.module === "led_blink"));
  assert.ok(r.hardware_plan.length >= 3);
  assert.ok(r.wiring.some((w) => w.includes("LED")));
});

test("statik ön kontrol DERLEME olarak sunulmaz", () => {
  const r = agent.handle("Arduino Uno'da 7. pindeki LED'i yak.", { classifier });
  assert.equal(r.build.ran, true);
  assert.equal(r.build.tool, "js-static");
  assert.equal(r.build.kind, "static");
  assert.equal(r.build.ok, true);
  assert.match(r.build.note, /DERLEME DEĞİLDİR/);
  assert.match(r.build.note, /AVR\/ESP32 araç zinciri yoktur/);
  assert.doesNotMatch(r.message, /derlendi/i);
});

test("kart belirtilmezse kod üretmeden hedef kartı sorar", () => {
  const r = agent.handle("7. pindeki LED'i yak.", { classifier });
  assert.equal(r.status, "needs_info");
  assert.equal(r.code, null);
  assert.equal(r.board, null);
  assert.ok(r.questions.length >= 1);
  assert.match(r.questions.join(" "), /Hedef kart/i);
});

test("boardHint açıkça verilirse kartı çözer", () => {
  const r = agent.handle("7. pindeki LED'i yak.", { classifier, boardHint: "uno" });
  assert.equal(r.status, "ok");
  assert.equal(r.board, "Arduino Uno R3");
  assert.ok(r.code.includes("const int LED_PIN = 7;"));
});

test("bilinmeyen modülde API uydurmaz", () => {
  const r = agent.handle("Arduino Uno'da bilinmeyen sensörü oku", { classifier });
  assert.equal(r.status, "unsupported");
  assert.equal(r.code, null);
  assert.match(r.message, /UYDURMAYACAGIM/);
  assert.ok(r.questions.length >= 1);
});

test("negatif pin varsayılana çevrilmez, hata verir", () => {
  const r = agent.handle("Arduino Uno'da -1. pindeki LED'i yak", { classifier });
  assert.equal(r.status, "error");
  assert.equal(r.code, null);
  assert.match(r.message, /negatif pin kabul edilmez/i);
  assert.ok(r.guard.some((g) => g.level === "error" && g.message.includes("-1")));
});

test("Uno Wi-Fi istemez: kart uyumsuzluğu açık hata", () => {
  const r = agent.handle("Arduino Uno'da WiFi ile web sunucusu kur", { classifier });
  assert.equal(r.status, "error");
  assert.equal(r.code, null);
  assert.match(r.message, /Wi-Fi donanimina sahip DEGILDIR/);
  assert.match(r.message, /HTTP\/web SUNUCUSU/);
});

test("ESP32 HTTP sunucusu desteklenmiyor; sahte kod yok", () => {
  const r = agent.handle("ESP32'de HTTP web sunucusu kur", { classifier });
  assert.equal(r.status, "unsupported");
  assert.equal(r.code, null);
  assert.match(r.message, /HTTP\/web SUNUCUSU modulu bu sistemde yok/);
});

test("kod inceleme pin çakışmasını bulur", () => {
  const r = agent.handle(
    "Arduino Uno'da bu kodda pin cakismasi var mi? ```void setup(){pinMode(7,OUTPUT);digitalRead(7);} void loop(){}```",
    { classifier });
  assert.equal(r.intent, "debug");
  assert.equal(r.status, "info");
  assert.ok(r.guard.some((g) => g.level === "error" && g.message.includes("Pin 7")));
  assert.equal(r.code, null);
});

test("kavram sorusu yerel bilgi kaynağından gelir, 5K üretmez", () => {
  const r = agent.handle("CPU nedir?", { classifier });
  assert.equal(r.status, "info");
  assert.equal(r.intent, "concept_explanation");
  assert.match(r.message, /CPU/);
  assert.ok(r.notes.some((n) => n.includes("5K modeli kullanılmadı")));
});

test("kapsam dışı soruda cevap uydurmaz", () => {
  const r = agent.handle("Bana Mars'ta yaşam hakkında bilgi ver", { classifier });
  assert.equal(r.status, "unsupported");
  assert.equal(r.intent, "unsupported_or_unclear");
  assert.match(r.message, /emin olmadığım bir bilgi üretmek istemiyorum/);
  assert.equal(r.code, null);
});

test("5K yalnızca ipucudur: yanlış sınıflandırma kural tabanını değiştirmez", () => {
  const wrong = {
    predict: () => ({
      available: true, label: "hata_bulma", intent_hint: "debug",
      probs: { hata_bulma: 1 }, note: "test",
    }),
  };
  const r = agent.handle("Arduino Uno'da 7. pindeki LED'i 500 ms aralıkla yakıp söndür.",
    { classifier: wrong });
  assert.equal(r.intent, "code_generation");
  assert.equal(r.status, "ok");
  assert.equal(r.classifier_hint, "debug");
  assert.ok(r.code.includes("const int LED_PIN = 7;"));
});

test("model yokken ajan çalışmaya devam eder ve sahte ipucu üretmez", () => {
  const r = agent.handle("Arduino Uno'da 7. pindeki LED'i yak.", { classifier: null });
  assert.equal(r.status, "ok");
  assert.equal(r.classifier_hint, null);
  assert.ok(r.code.length > 0);
});

test("statik kontrol eksik setup/loop ve parantezi yakalar", () => {
  const bad = staticCheck("void loop() { if (true) { ");
  assert.equal(bad.ran, true);
  assert.equal(bad.ok, false);
  assert.match(bad.stderr, /setup/);
  assert.match(bad.stderr, /kapatılmayan/);
  assert.equal(bad.tool, "js-static");
});

test("analyzeConflicts giriş/çıkış çakışmasını bulur", () => {
  const findings = analyzeConflicts(null,
    "void setup(){pinMode(7,OUTPUT);digitalRead(7);} void loop(){}");
  assert.ok(findings.some(([level, msg]) => level === "error" && msg.includes("Pin 7")));
});

test("extractUserCode kod bloğunu ve satırları bulur", () => {
  assert.equal(extractUserCode("açıklama\n```cpp\nvoid setup(){}\nvoid loop(){}\n```"),
    "void setup(){}\nvoid loop(){}");
  assert.match(extractUserCode("void setup(){ pinMode(7, OUTPUT); }\nvoid loop(){}"),
    /pinMode/);
});

test("yanıtlar deterministik ve model adı sabit", () => {
  const a = agent.handle("Arduino Uno'da 7. pindeki LED'i yak.", { classifier });
  const b = agent.handle("Arduino Uno'da 7. pindeki LED'i yak.", { classifier });
  assert.deepEqual(a, b);
  assert.equal(a.model_name, "AwuGöktürk-Microcontroller:5K");
});

test("ESP32 kodunda 3,3V uyarısı donanım planında bulunur", () => {
  const r = agent.handle("ESP32'de GPIO 18'deki LED'i 1 saniye aralıkla yakıp söndür.",
    { classifier });
  assert.equal(r.status, "ok");
  assert.equal(r.board, "ESP32 (klasik, ESP32-D0WD/WROOM-32)");
  assert.ok(r.hardware_plan.some((p) => p.includes("3,3V")));
});
