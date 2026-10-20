import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { LiteClassifier, LABEL_TO_INTENT } from "../runtime/core/classifier.js";
import { loadManifestForTest } from "./helpers.mjs";

const bytes = fs.readFileSync(new URL("../runtime/model/classifier5k.json", import.meta.url));
const data = JSON.parse(bytes.toString("utf8"));
const manifest = loadManifestForTest();

test("model dosyası manifest boyutu ve SHA-256 ile eşleşir", () => {
  assert.equal(bytes.byteLength, manifest.artifact.size);
  assert.equal(manifest.artifact.size, 99663);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash, manifest.artifact.sha256);
  assert.equal(hash, "7e4346913c2aae4891495b6695d67d29e2eab3e8caa564d77b06e1be7990abc6");
});

test("model mimarisi ve parametre sayısı gerçek 5K modelidir", () => {
  const c = new LiteClassifier().loadFromObject(data);
  assert.equal(c.available, true);
  assert.equal(c.error, null);
  assert.equal(c.paramCount(), 4893);
  assert.equal(manifest.params, 4893);
  assert.equal(c.labels.length, 8);
  assert.equal(c.vocab.length, 103);
  assert.equal(data.config.emb, 8);
  assert.equal(data.config.hidden, 31);
  assert.deepEqual(c.labels, data.labels);
});

test("çıkarım gerçek olasılık dağılımı üretir ve deterministiktir", () => {
  const c = new LiteClassifier().loadFromObject(data);
  const text = "Arduino Uno'da 7. pindeki LED'i 500 ms aralıkla yakıp söndür.";
  const a = c.predict(text);
  const b = c.predict(text);
  assert.equal(a.available, true);
  assert.equal(a.label, "arduino_dijital");
  assert.equal(a.intent_hint, "code_generation");
  assert.deepEqual(a, b);
  const sum = Object.values(a.probs).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, `olasılık toplamı ${sum}`);
  assert.ok(a.probs[a.label] > 0.9);
});

test("model metin üretmez; yalnızca etiket/olasılık döndürür", () => {
  const c = new LiteClassifier().loadFromObject(data);
  const p = c.predict("CPU nedir?");
  assert.deepEqual(Object.keys(p).sort(),
    ["available", "intent_hint", "label", "note", "probs"].sort());
  assert.equal(typeof p.label, "string");
  assert.equal(typeof p.probs, "object");
});

test("reset modeli bellekten kaldırır ve sahte tahmin üretmez", () => {
  const c = new LiteClassifier().loadFromObject(data);
  c.reset();
  assert.equal(c.available, false);
  assert.equal(c.paramCount(), 0);
  const p = c.predict("Arduino");
  assert.equal(p.available, false);
  assert.equal(p.label, null);
  assert.equal(p.probs, null);
  assert.match(p.note, /bulunamadi/);
});

test("bozuk/eksik model reddedilir", () => {
  const c = new LiteClassifier().loadFromObject({ labels: ["x"] });
  assert.equal(c.available, false);
  assert.match(c.error, /eksik|uyuşmuyor/i);
  assert.equal(c.predict("x").available, false);
});

test("tüm etiketler güvenli bir niyet ipucuna eşlenir", () => {
  assert.equal(Object.keys(LABEL_TO_INTENT).length, 8);
  for (const label of data.labels) {
    assert.ok(LABEL_TO_INTENT[label], label);
  }
});
