import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readText, readJson } from "./helpers.mjs";

const index = readText("index.html");
const app = readText("app.js");
const sw = readText("sw.js");
const manifest = readJson("manifest.json");
const modelManifest = readJson("runtime/model/manifest.json");

const REQUIRED = [
  "index.html", "style.css", "app.js", "sw.js", "manifest.json", "LICENSE",
  "assets/awu-gokturk-logo.jpg", "assets/favicon-32.png",
  "assets/icon-192.png", "assets/icon-512.png",
  "assets/icon-maskable-512.png", "assets/apple-touch-icon.png",
  "runtime/worker.js", "runtime/model-loader.js", "runtime/markdown.js",
  "runtime/storage.js", "runtime/model/manifest.json", "runtime/model/classifier5k.json",
  "runtime/core/agent.js", "runtime/core/awu-guard.js", "runtime/core/board-resolver.js",
  "runtime/core/boards.js", "runtime/core/classifier.js", "runtime/core/code-generator.js",
  "runtime/core/info.js", "runtime/core/intent-router.js", "runtime/core/knowledge.js",
  "runtime/core/requirement-parser.js", "runtime/core/test-generator.js", "runtime/core/util.js",
];

test("gerekli statik dosyalar mevcut", () => {
  for (const rel of REQUIRED) {
    const stat = fs.statSync(path.join(ROOT, rel));
    assert.ok(stat.isFile(), rel);
    assert.ok(stat.size > 0, rel);
  }
});

test("CSP harici bağlantıyı ve satır içi betiği engeller", () => {
  const csp = index.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(csp, "CSP meta etiketi yok");
  const policy = csp[1];
  for (const directive of [
    "default-src 'self'", "script-src 'self'", "style-src 'self'",
    "connect-src 'self'", "worker-src 'self'", "img-src 'self' data:",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) {
    assert.ok(policy.includes(directive), directive);
  }
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(policy, /connect-src[^;]*\*/);
});

test("index yalnızca yerel betik/stil yükler, satır içi kod içermez", () => {
  const scripts = [...index.matchAll(/<script\b([^>]*)>/gi)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0][1], /src="\.\/app\.js"/);
  assert.doesNotMatch(index, /<style\b/i);
  assert.doesNotMatch(index, /on(?:click|load|error|submit|change)=/i);
  assert.doesNotMatch(index, /javascript:/i);
});

test("tüm yerel src/href başvuruları gerçek dosyalara gider", () => {
  const refs = [...index.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 6);
  for (const ref of refs) {
    const rel = ref.replace(/^\.\//, "");
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `eksik dosya: ${ref}`);
  }
});

test("app.js ağ API'si kullanmaz; mesaj göndermez", () => {
  assert.doesNotMatch(app, /\bfetch\s*\(/);
  assert.doesNotMatch(app, /XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  assert.doesNotMatch(app, /https?:\/\//);
});

test("model yükleyici yalnızca aynı kaynaktan indirir ve doğrular", () => {
  const loader = readText("runtime/model-loader.js");
  assert.match(loader, /fetch\(modelUrl/);
  assert.match(loader, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(loader, /expectedSize/);
  assert.match(loader, /expectedHash/);
  assert.match(loader, /SHA-256 uyuşmuyor/);
  assert.doesNotMatch(loader, /https?:\/\//);
  assert.match(loader, /origin !== self\.location\.origin/);
  const verifyAt = loader.indexOf("const result = await finish(merged.buffer, false)");
  const cacheAt = loader.indexOf("cache.put(modelUrl");
  assert.ok(verifyAt > 0 && cacheAt > verifyAt,
    "model önbelleğe yazılmadan önce doğrulanmalı");
});

test("Service Worker kabuğu tamdır ve model ağırlığını önbelleklemez", () => {
  const match = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(match, "SHELL listesi yok");
  const shell = [...match[1].matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(shell.length >= 20);
  for (const rel of shell) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `SW'de eksik dosya: ${rel}`);
  }
  assert.ok(!shell.some((rel) => rel.endsWith("classifier5k.json")),
    "model ağırlığı SW kabuğuna eklenmemeli");
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /request\.mode === "navigate"/);
});

test("manifest PWA alanları ve ikon boyutları tutarlı", () => {
  assert.equal(manifest.lang, "tr");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
  assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512"));
  for (const icon of manifest.icons) {
    const file = path.join(ROOT, icon.src.replace(/^\.\//, ""));
    assert.ok(fs.existsSync(file), icon.src);
    const buf = fs.readFileSync(file);
    assert.equal(buf.slice(1, 4).toString("ascii"), "PNG");
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
  }
});

test("model manifesti model dosyasıyla tutarlı", () => {
  assert.equal(modelManifest.params, 4893);
  assert.equal(modelManifest.artifact.size, 99663);
  assert.equal(modelManifest.artifact.sha256,
    "7e4346913c2aae4891495b6695d67d29e2eab3e8caa564d77b06e1be7990abc6");
  assert.match(modelManifest.notes, /metin üretmez/i);
});

test("arayüz Türkçe, erişilebilir ve gerekli kimliklere sahip", () => {
  assert.match(index, /<html lang="tr"/);
  assert.match(index, /class="skip-link"/);
  assert.match(index, /aria-label="Sohbet"/);
  assert.match(index, /role="log"/);
  assert.match(index, /aria-live="polite"/);
  const ids = new Set([...index.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ["input", "sendBtn", "stopBtn", "messages", "welcome", "historyList",
    "settingsDialog", "modelDialog", "confirmDialog", "modelChip", "modelProgressBar",
    "modelTestBtn", "capabilityList", "toast", "notice", "updateBanner"]) {
    assert.ok(ids.has(id), id);
  }
  const usedIds = [...new Set([...app.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]))];
  const missing = usedIds.filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], "app.js'de tanımsız kimlikler: " + missing.join(", "));
});

test("5K modeli arayüzde açıkça sınıflandırıcı olarak tanıtılır", () => {
  const text = index + "\n" + app;
  assert.match(text, /5K modeli yalnızca görev türü ipucu verir/i);
  assert.match(text, /genel amaçlı bir dil modeli değildir/i);
  assert.match(text, /metin üretmez/i);
  assert.match(text, /sahte model/i);
});

test("gizlilik iddiaları tutarlı: analitik/çerez/API anahtarı yok", () => {
  assert.doesNotMatch(app, /gtag\(|googletagmanager|analytics|mixpanel|sentry/);
  assert.doesNotMatch(index, /gtag\(|googletagmanager|analytics|mixpanel|sentry/);
  assert.doesNotMatch(index, /<iframe\b/i);
  assert.match(index, /connect-src 'self'/);
});

test("resmî AwuGöktürk logosu tutarlı kullanılır", () => {
  const logo = path.join(ROOT, "assets/awu-gokturk-logo.jpg");
  const buf = fs.readFileSync(logo);
  assert.equal(buf.subarray(0, 2).toString("hex"), "ffd8", "logo JPEG değil");
  assert.match(index, /rel="icon"[^>]+favicon-32\.png/);
  assert.ok((index.match(/assets\/awu-gokturk-logo\.jpg/g) || []).length >= 3,
    "logo üst çubuk, karşılama ve diyalog başlıklarında kullanılmalı");
  assert.match(app, /assets\/awu-gokturk-logo\.jpg/);
  assert.doesNotMatch(index + app + sw, /assets\/logo\.svg/);
  assert.match(index, /class="mobile-tabbar"/);
  assert.match(index, /data-tab="sohbet"/);
  assert.match(index, /data-tab="kod"/);
  assert.match(index, /data-tab="ayarlar"/);
});

test("logo en-boy oranı korunur ve koyu/açık temada çerçevelenir", () => {
  const css = readText("style.css");
  for (const selector of [".brand-logo", ".topbar-logo", ".welcome-logo", ".avatar img"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(escaped + "[^}]*object-fit: cover"));
  }
  assert.match(css, /html\[data-theme="light"\] \.topbar/);
  for (const tag of index.matchAll(/<img\b[^>]*>/g)) {
    const w = tag[0].match(/width="(\d+)"/);
    const h = tag[0].match(/height="(\d+)"/);
    if (w && h) assert.equal(w[1], h[1], "logo kare olmayan boyutlandırılmış: " + tag[0]);
  }
});
