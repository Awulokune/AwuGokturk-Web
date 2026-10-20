import test from "node:test";
import assert from "node:assert/strict";
import { runParity } from "./parity.mjs";

test("Python↔JS ajan paritesi tüm senaryolarda birebir", () => {
  const result = runParity({ verbose: false });
  assert.equal(result.classifierFailures.length, 0,
    "sınıflandırıcı farkları: " + JSON.stringify(result.classifierFailures, null, 2));
  assert.equal(result.failures.length, 0,
    "ajan alan farkları: " + JSON.stringify(result.failures.slice(0, 5), null, 2));
  assert.equal(result.cases, 56);
  assert.equal(result.clfCases, 6);
});
