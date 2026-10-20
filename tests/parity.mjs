#!/usr/bin/env node
/* Python (Android) referansı ile JavaScript ajan çıktısını karşılaştırır.
 * `build` alanı hariç tutulur: Python host'ta g++ dener, tarayıcıda gerçek
 * derleme yoktur. Diğer tüm kullanıcıya görünen alanlar birebir olmalıdır.
 */

import fs from "node:fs";
import assert from "node:assert/strict";
import { AwuGokturkAgent } from "../runtime/core/agent.js";
import { LiteClassifier } from "../runtime/core/classifier.js";

const root = new URL("../", import.meta.url);
const ref = JSON.parse(fs.readFileSync(new URL("tests/fixtures/python_reference.json", root), "utf8"));
const modelData = JSON.parse(fs.readFileSync(new URL("runtime/model/classifier5k.json", root), "utf8"));

export function runParity({ verbose = true } = {}) {
  const classifier = new LiteClassifier().loadFromObject(modelData);
  assert.equal(classifier.available, true, "JS sınıflandırıcı yüklenemedi");
  assert.equal(classifier.paramCount(), ref.classifier.params, "parametre sayısı");

  const clfFailures = [];
  for (const [text, expected] of Object.entries(ref.classifier.predictions)) {
    const got = classifier.predict(text);
    if (got.label !== expected.label) {
      clfFailures.push(`${text}: etiket ${got.label} ≠ ${expected.label}`);
    }
    for (const [label, p] of Object.entries(expected.probs)) {
      if (Math.abs(got.probs[label] - p) > 1e-3) {
        clfFailures.push(`${text}: ${label} olasılık ${got.probs[label]} ≠ ${p}`);
      }
    }
  }

  const agent = new AwuGokturkAgent({ useClassifier: true });
  const failures = [];
  const keys = ["status", "category", "intent", "message", "board", "framework", "code",
    "modules", "libraries", "wiring", "assumptions", "guard", "tests", "hardware_plan",
    "questions", "notes", "classifier_hint", "model_name"];
  for (const c of ref.cases) {
    const got = agent.handle(c.text, { boardHint: c.board_hint, classifier });
    for (const k of keys) {
      let actual = got[k];
      let expected = c.response[k];
      if (k === "tests") {
        actual = actual.filter((t) => t.type !== "build");
        expected = expected.filter((t) => t.type !== "build");
      }
      try {
        assert.deepEqual(actual, expected);
      } catch {
        failures.push({
          text: c.text, field: k,
          expected: c.response[k], got: got[k],
        });
      }
    }
  }

  if (verbose) {
    for (const f of clfFailures) console.error("CLF FARK:", f);
    for (const f of failures.slice(0, 40)) {
      console.error(`\nFARK: ${JSON.stringify(f.text)} [${f.field}]`);
      console.error("  Python:", JSON.stringify(f.expected).slice(0, 900));
      console.error("  JS    :", JSON.stringify(f.got).slice(0, 900));
    }
  }
  return {
    classifierFailures: clfFailures, failures,
    cases: ref.cases.length,
    clfCases: Object.keys(ref.classifier.predictions).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runParity();
  console.log(`\nPython↔JS parite: ${r.cases} senaryo, ${r.clfCases} sınıflandırıcı örneği`);
  if (r.classifierFailures.length || r.failures.length) {
    console.error(`BAŞARISIZ: ${r.failures.length} alan farkı, ${r.classifierFailures.length} sınıflandırıcı farkı`);
    process.exit(1);
  }
  console.log("TÜMÜ BİREBİR EŞLEŞTİ (build hariç).");
}
