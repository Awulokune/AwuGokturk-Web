/* AwuGöktürk Web Worker — ajan ve 5K çıkarımı ana iş parçacığından ayrı çalışır.
 * Mesajlaşma yalnızca yereldir; hiçbir ağ isteği kullanıcı metni içermez.
 */

import { AwuGokturkAgent } from "./core/agent.js";
import { LiteClassifier } from "./core/classifier.js";
import { appInfo } from "./core/info.js";
import { loadModel, clearModelCache, MODEL_CACHE } from "./model-loader.js";

const classifier = new LiteClassifier();
const agent = new AwuGokturkAgent({ useClassifier: true });
let modelState = {
  status: "idle", // idle | loading | ready | error
  progress: null,
  info: null,
  error: null,
};
let loadPromise = null;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function publishStatus() {
  post("model-status", {
    state: modelState,
    classifier: classifier.status(),
    info: appInfo(classifier.status()),
  });
}

async function load(force = false) {
  if (loadPromise && !force) return loadPromise;
  // Zorunlu yeniden indirmede eski model bellekte tutulmaz; indirme başarısız
  // olursa arayüz "model var" diyerek yanıltıcı ipucu üretmez.
  if (force) classifier.reset();
  modelState = { status: "loading", progress: { stage: "start", label: "Model hazırlanıyor", percent: 0 },
    info: force ? null : modelState.info, error: null };
  publishStatus();
  loadPromise = (async () => {
    try {
      const result = await loadModel({
        manifestUrl: new URL("./model/manifest.json", import.meta.url).href,
        force,
        onProgress: (p) => {
          modelState.progress = p;
          post("model-progress", { progress: p });
        },
      });
      const loaded = classifier.loadFromObject(result.data);
      if (!loaded.available) throw new Error(loaded.error || "Model doğrulandı ancak yüklenemedi.");
      modelState = {
        status: "ready",
        progress: { stage: "ready", label: "Model hazır", percent: 100 },
        info: {
          model_version: result.manifest.model_version,
          model_name: result.manifest.model_name,
          architecture: result.manifest.architecture,
          sha256: result.sha256,
          bytes: result.bytes,
          from_cache: result.fromCache,
          params: classifier.paramCount(),
          labels: classifier.labels,
          duration_ms: result.durationMs,
        },
        error: null,
      };
      post("model-ready", { state: modelState, classifier: classifier.status() });
      return true;
    } catch (err) {
      modelState = {
        status: "error",
        progress: { stage: "error", label: "Model yüklenemedi", percent: 0 },
        info: null,
        error: err && err.message ? err.message : String(err),
      };
      post("model-error", { state: modelState, classifier: classifier.status() });
      return false;
    } finally {
      publishStatus();
      loadPromise = null;
    }
  })();
  return loadPromise;
}

async function reload(force) {
  await clearModelCache();
  return load(force);
}

self.onmessage = async (ev) => {
  const { type, id, text, boardHint } = ev.data || {};
  try {
    if (type === "init") {
      publishStatus();
      const ok = await load(false);
      post("ready", { ok, state: modelState, info: appInfo(classifier.status()),
        classifier: classifier.status() });
      return;
    }
    if (type === "message") {
      if (typeof text !== "string" || !text.trim()) throw new Error("Boş mesaj.");
      const started = performance.now();
      const result = agent.handle(text, { boardHint: boardHint || null, classifier });
      const hint = classifier.predict(text);
      post("response", {
        id,
        result,
        classifier: {
          available: hint.available,
          label: hint.label,
          probs: hint.probs,
          note: hint.note,
        },
        elapsed_ms: Math.round(performance.now() - started),
        state: modelState,
      });
      return;
    }
    if (type === "reload-model") {
      const ok = await reload(true);
      post("ready", { ok, state: modelState, info: appInfo(classifier.status()),
        classifier: classifier.status() });
      return;
    }
    if (type === "predict") {
      if (typeof text !== "string" || !text.trim()) {
        post("predict-result", {
          id,
          prediction: {
            available: false, label: null, intent_hint: null, probs: null,
            note: "Test için boş olmayan bir metin gerekli.",
          },
        });
        return;
      }
      const prediction = classifier.predict(text);
      post("predict-result", { id, prediction });
      return;
    }
    if (type === "status") {
      publishStatus();
      return;
    }
    if (type === "clear-model") {
      const ok = await clearModelCache();
      classifier.reset();
      modelState = {
        status: "idle",
        progress: { stage: "idle", label: "Model önbelleği temizlendi", percent: 0 },
        info: null, error: null,
      };
      publishStatus();
      post("cache-cleared", { ok, cache: MODEL_CACHE });
      return;
    }
    throw new Error(`Bilinmeyen worker mesajı: ${type}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (type === "message") post("response-error", { id, error: message });
    else if (type === "predict") post("predict-result", {
      id,
      prediction: {
        available: false, label: null, intent_hint: null, probs: null,
        note: "Tahmin çalıştırılamadı: " + message,
      },
    });
    else post("worker-error", { error: message });
  }
};

load(false);
