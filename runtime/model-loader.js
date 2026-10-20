/* Model indirme + SHA-256 doğrulama + Cache Storage.
 * Yalnızca aynı kaynaktan (GitHub Pages alt yolu) indirir. Kullanıcı mesajı
 * hiçbir zaman bu modülden geçmez.
 */

const MODEL_CACHE = "awu-model-5k-v1";

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchManifest(url) {
  const t = withTimeout(12000);
  try {
    const res = await fetch(url, { cache: "no-cache", signal: t.signal });
    if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
    return await res.json();
  } finally {
    t.clear();
  }
}

export async function loadModel({
  manifestUrl = new URL("./manifest.json", import.meta.url).href,
  modelUrl = null,
  onProgress = () => {},
  force = false,
} = {}) {
  const started = performance.now();
  let manifest;
  try {
    onProgress({ stage: "manifest", label: "Model manifesti okunuyor", percent: 2 });
    manifest = await fetchManifest(manifestUrl);
    if (manifest.manifest_version !== 1) throw new Error("Desteklenmeyen manifest sürümü.");
    if (manifest.format !== "awugokturk-mcu-5k-lite-v1") throw new Error("Desteklenmeyen model biçimi.");
    if (manifest.architecture !== "lite-json-v1") throw new Error("Desteklenmeyen model mimarisi.");
    if (!modelUrl) modelUrl = new URL(manifest.artifact.url, manifestUrl).href;
    // Savunma katmanı: manifest değiştirilse bile model yalnızca aynı kaynaktan
    // indirilebilir. CSP connect-src 'self' bunu ayrıca tarayıcıda engeller.
    if (new URL(modelUrl).origin !== self.location.origin) {
      throw new Error("Model URL'si aynı kaynakta değil; indirme reddedildi.");
    }
  } catch (err) {
    onProgress({ stage: "error", label: "Model manifesti okunamadı", percent: 0, error: String(err) });
    throw new Error("Model manifesti okunamadı. Uygulama kural tabanlı olarak çalışmaya devam eder. " +
      "Ayrıntı: " + (err && err.message ? err.message : err));
  }

  const expectedHash = String(manifest.artifact.sha256 || "").toLowerCase();
  const expectedSize = Number(manifest.artifact.size || 0);

  let cache = null;
  try { cache = await caches.open(MODEL_CACHE); } catch { cache = null; }

  const finish = async (bytes, fromCache) => {
    onProgress({ stage: "verify", label: "SHA-256 doğrulanıyor", percent: 92 });
    if (expectedSize && bytes.byteLength !== expectedSize) {
      throw new Error(`Model boyutu uyuşmuyor (beklenen ${expectedSize}, gelen ${bytes.byteLength}).`);
    }
    const actualHash = await sha256(bytes);
    if (expectedHash && actualHash !== expectedHash) {
      throw new Error(`SHA-256 uyuşmuyor. Beklenen ${expectedHash.slice(0, 12)}…, gelen ${actualHash.slice(0, 12)}…. ` +
        "Dosya kullanılmadı.");
    }
    onProgress({ stage: "parse", label: "Model ağırlıkları çözümleniyor", percent: 96 });
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch (err) {
      throw new Error("Model JSON çözümlenemedi: " + err.message);
    }
    if (manifest.params && data && data.config) {
      const expectedParams = Number(manifest.params);
      const cfg = data.config;
      const actualParams = cfg.vocab_size * cfg.emb + 3 * cfg.hidden * cfg.emb +
        3 * cfg.hidden * cfg.hidden + 6 * cfg.hidden + data.labels.length * cfg.hidden +
        data.labels.length;
      if (actualParams !== expectedParams) {
        throw new Error(`Model parametre sayısı manifest ile uyuşmuyor (${actualParams} ≠ ${expectedParams}).`);
      }
    }
    return {
      data, bytes: bytes.byteLength, sha256: actualHash, manifest,
      fromCache, durationMs: Math.round(performance.now() - started),
    };
  };

  if (cache && !force) {
    onProgress({ stage: "cache-check", label: "Önbellek kontrol ediliyor", percent: 5 });
    const hit = await cache.match(modelUrl);
    if (hit) {
      try {
        const bytes = await hit.arrayBuffer();
        onProgress({ stage: "cache-verify", label: "Önbellekteki model doğrulanıyor", percent: 85 });
        const result = await finish(bytes, true);
        onProgress({ stage: "ready", label: "Model hazır (önbellekten)", percent: 100 });
        return result;
      } catch {
        await cache.delete(modelUrl);
      }
    }
  }

  onProgress({ stage: "download", label: "Model indiriliyor", percent: 8, loaded: 0, total: expectedSize || null });
  const t = withTimeout(60000);
  let res;
  try {
    res = await fetch(modelUrl, { cache: "no-store", signal: t.signal });
  } catch (err) {
    throw new Error("Model indirilemedi (çevrimdışı olabilirsiniz). " +
      "Sohbet ve kod üretimi kural tabanlı olarak çalışmaya devam eder. Ayrıntı: " +
      (err && err.message ? err.message : err));
  } finally {
    t.clear();
  }
  if (!res.ok) throw new Error(`Model indirme başarısız: HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length") || expectedSize || 0) || null;
  const chunks = [];
  let loaded = 0;
  let lastTick = 0;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      const now = performance.now();
      if (now - lastTick > 80 || (total && loaded >= total)) {
        lastTick = now;
        const percent = total ? Math.min(90, 8 + Math.round((loaded / total) * 82)) : 50;
        onProgress({ stage: "download", label: "Model indiriliyor", percent, loaded, total });
      }
    }
  } else {
    const value = new Uint8Array(await res.arrayBuffer());
    chunks.push(value);
    loaded = value.byteLength;
  }

  const merged = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.byteLength; }

  // Önce boyut, SHA-256 ve JSON/parametre doğrulaması yapılır; ancak
  // doğrulanmış model önbelleğe yazılır. Böylece bozuk bir indirme
  // sonraki açılışta "önbellekten hazır" gibi görünmez.
  const result = await finish(merged.buffer, false);

  if (cache) {
    try {
      const copy = new Response(merged.slice(0), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Awu-Sha256": result.sha256,
          "X-Awu-Model": String(manifest.model_version || ""),
        },
      });
      await cache.put(modelUrl, copy);
    } catch {
      /* Cache başarısız olsa da doğrulanmış model kullanılabilir. */
    }
  }

  onProgress({ stage: "ready", label: "Model hazır", percent: 100 });
  return result;
}

export async function clearModelCache() {
  try {
    await caches.delete(MODEL_CACHE);
    return true;
  } catch {
    return false;
  }
}

export { MODEL_CACHE };
