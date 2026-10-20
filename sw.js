/* AwuGöktürk Web — Service Worker
 *
 * Amaç: uygulama kabuğunu (HTML/CSS/JS) ve model manifestini çevrimdışı
 * kullanılabilir tutmak. Model ağırlıkları `runtime/model-loader.js` tarafından
 * ayrı bir Cache Storage kovasında, SHA-256 doğrulandıktan sonra saklanır.
 *
 * Hiçbir harici kaynak önbelleğe alınmaz; yalnızca aynı kaynak (GitHub Pages
 * alt yolu dahil) istekleri ele alınır.
 */

const SHELL_CACHE = "awu-web-1.0.0-r1";
const CACHE_PREFIX = "awu-web-";
const MODEL_FILE = "classifier5k.json";

const SHELL = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png",
  "./runtime/worker.js",
  "./runtime/model-loader.js",
  "./runtime/markdown.js",
  "./runtime/storage.js",
  "./runtime/model/manifest.json",
  "./runtime/core/agent.js",
  "./runtime/core/awu-guard.js",
  "./runtime/core/board-resolver.js",
  "./runtime/core/boards.js",
  "./runtime/core/classifier.js",
  "./runtime/core/code-generator.js",
  "./runtime/core/info.js",
  "./runtime/core/intent-router.js",
  "./runtime/core/knowledge.js",
  "./runtime/core/requirement-parser.js",
  "./runtime/core/test-generator.js",
  "./runtime/core/util.js",
];

const scopeUrl = () => new URL(self.registration.scope);
const indexUrl = () => new URL("./index.html", scopeUrl()).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const requests = SHELL.map((path) => new Request(new URL(path, scopeUrl()).href, {
      cache: "reload",
      credentials: "same-origin",
    }));
    await cache.addAll(requests);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch { /* yok say */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function timeoutFetch(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) {
    try { await cache.put(request, response.clone()); } catch { /* kota */ }
  }
  return response;
}

async function networkFirst(request, { navigation = false } = {}) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await timeoutFetch(request, navigation ? 6000 : 9000);
    if (response && response.ok && !(new URL(request.url).pathname.endsWith(`/${MODEL_FILE}`))) {
      try { await cache.put(request, response.clone()); } catch { /* kota */ }
    }
    if (navigation && !response.ok) {
      const fallback = await cache.match(indexUrl());
      if (fallback) return fallback;
    }
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (navigation) {
      const fallback = await cache.match(indexUrl());
      if (fallback) return fallback;
    }
    return new Response("Çevrimdışısınız ve bu kaynak önbellekte yok.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // Model ağırlıkları kendi Cache Storage kovasında tutulur; SW araya girmez.
  if (url.pathname.endsWith(`/${MODEL_FILE}`)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, { navigation: true }));
    return;
  }

  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
