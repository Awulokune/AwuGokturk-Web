/* AwuGöktürk Web — arayüz denetleyicisi.
 *
 * Tüm çıkarım `runtime/worker.js` içinde, kullanıcı cihazında yapılır.
 * Bu dosyadan hiçbir ağ isteği gönderilmez; model indirme de worker'ın
 * kendi modülünde, yalnızca aynı kaynaktan yapılır.
 */

import { store, newId } from "./runtime/storage.js";
import { renderMarkdown, renderPlain, codeBlock } from "./runtime/markdown.js";

const APP_VERSION = "1.0.0-web";
const MAX_INPUT = 12000;
const CHAT_TIMEOUT_MS = 30000;
const PREDICT_TIMEOUT_MS = 10000;

const $ = (id) => document.getElementById(id);

const STATUS_LABELS = {
  ok: "Tamam",
  error: "Hata",
  needs_info: "Bilgi gerekli",
  unsupported: "Desteklenmiyor",
  info: "Bilgi",
  greeting: "Selamlama",
};

const CATEGORY_LABELS = {
  greeting: "Selamlama",
  identity: "Kimlik",
  general_chat: "Sohbet",
  creative_writing: "Yaratıcı yazı",
  general_knowledge: "Bilgi",
  concept_explanation: "Kavram",
  embedded_coding: "Gömülü kod",
  unsupported: "Kapsam dışı",
};

const MODEL_STATUS_LABELS = {
  idle: "Model yüklenmedi",
  loading: "Model yükleniyor",
  ready: "Model hazır",
  error: "Model yüklenemedi",
};

const ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';

const state = {
  worker: null,
  workerReady: false,
  workerFailed: false,
  model: {
    status: "loading",
    progress: { stage: "start", label: "Model hazırlanıyor", percent: 0 },
    info: null,
    error: null,
  },
  modelFirstReady: false,
  modelReloadRequested: false,
  sessions: [],
  currentId: null,
  settings: {
    theme: "dark",
    reducedMotion: false,
    board: "",
    lastSession: null,
  },
  online: navigator.onLine,
  busy: false,
  busySessionId: null,
  pendingMessage: null,
  pendingPredict: null,
  noticeKey: null,
  storageFailed: false,
  toastTimer: null,
  confirmResolver: null,
  swReg: null,
  updateWorker: null,
  reloadingForUpdate: false,
};

/* --------------------------------------------------------------------------
   Küçük yardımcılar
   -------------------------------------------------------------------------- */

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function setText(id, text) {
  const node = $(id);
  if (node) node.textContent = text;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function formatNumber(n) {
  const value = Number(n);
  return Number.isFinite(value) ? value.toLocaleString("tr-TR") : "—";
}

function formatPercent(fraction, digits = 0) {
  const n = Number(fraction);
  if (!Number.isFinite(n)) return "—";
  return `%${(n * 100).toLocaleString("tr-TR", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })}`;
}

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn`;
}

function timeLabel(ts) {
  const date = new Date(Number(ts) || Date.now());
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function titleFromText(text) {
  const plain = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Kod isteği";
  return plain.length > 62 ? `${plain.slice(0, 59)}…` : plain;
}

function isNearBottom() {
  const scroller = $("chatScroll");
  if (!scroller) return true;
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
}

function scrollToBottom(smooth = false) {
  const scroller = $("chatScroll");
  if (!scroller) return;
  const reduce = state.settings.reducedMotion ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
}

function toast(message, kind = "") {
  const node = $("toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast${kind ? ` ${kind}` : ""}`;
  node.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { node.hidden = true; }, kind === "error" ? 4600 : 3000);
}

function showNotice(message, kind = "warn", key = "general") {
  const node = $("notice");
  if (!node) return;
  setText("noticeText", message);
  node.className = `notice${kind === "error" ? " error" : ""}`;
  node.hidden = false;
  state.noticeKey = key;
}

function hideNotice() {
  const node = $("notice");
  if (node) node.hidden = true;
  state.noticeKey = null;
}

function dialogOpen(dialog) {
  if (!dialog) return;
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  const body = dialog.querySelector(".dialog-body");
  if (body) body.scrollTop = 0;
}

function dialogClose(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Kopyalama başarısız");
}

/* --------------------------------------------------------------------------
   Ayar ve tema
   -------------------------------------------------------------------------- */

function loadSettings() {
  let saved = {};
  try { saved = store.getSettings() || {}; } catch { saved = {}; }
  state.settings = { ...state.settings, ...saved };
  if (!["dark", "light", "system"].includes(state.settings.theme)) state.settings.theme = "dark";
  state.settings.reducedMotion = state.settings.reducedMotion === true;
  if (!["", "uno", "mega2560", "esp32"].includes(state.settings.board)) state.settings.board = "";
}

function persistSettings() {
  const ok = store.setSettings(state.settings);
  if (!ok) {
    showNotice("Tarayıcı yerel ayarları saklamaya izin vermiyor. Ayarlar bu oturumda geçerli olacak.",
      "warn", "settings");
  }
}

function resolvedTheme() {
  if (state.settings.theme === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return state.settings.theme;
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#eef2f8" : "#070b12");
}

function applyMotion() {
  document.documentElement.dataset.motion = state.settings.reducedMotion ? "reduce" : "auto";
  const toggle = $("motionToggle");
  if (toggle) toggle.checked = state.settings.reducedMotion;
}

function syncSettingsForm() {
  const themeSelect = $("themeSelect");
  if (themeSelect) themeSelect.value = state.settings.theme;
  const boardSelect = $("boardSelect");
  if (boardSelect) boardSelect.value = state.settings.board;
  applyTheme();
  applyMotion();
}

/* --------------------------------------------------------------------------
   Sohbet deposu
   -------------------------------------------------------------------------- */

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        id: typeof m.id === "string" ? m.id : newId(),
        role: m.role,
        text: typeof m.text === "string" ? m.text : "",
        ts: Number(m.ts) || Date.now(),
        response: m.response && typeof m.response === "object" ? m.response : null,
        classifier: m.classifier && typeof m.classifier === "object" ? m.classifier : null,
        elapsed_ms: Number(m.elapsed_ms) || null,
      }))
    : [];
  return {
    id: typeof raw.id === "string" ? raw.id : newId(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Yeni sohbet",
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    messages,
  };
}

async function initStorage() {
  let backend = "memory";
  try {
    backend = await store.init();
    const raw = await store.listSessions();
    state.sessions = raw.map(normalizeSession).filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    state.storageFailed = true;
    state.sessions = [];
    showNotice("Sohbet geçmişi bu tarayıcıda kalıcı olarak saklanamıyor. " +
      "Uygulama bu oturumda çalışmaya devam eder. Ayrıntı: " + (err.message || err),
    "warn", "storage");
  }
  const backendLabel = backend === "idb" ? "IndexedDB (yerel)"
    : backend === "local" ? "localStorage (yerel)" : "Bellek (kalıcı değil)";
  setText("storageBackend", backendLabel);

  const last = state.settings.lastSession;
  if (last && state.sessions.some((s) => s.id === last)) state.currentId = last;
}

async function saveSession(session) {
  session.updatedAt = Date.now();
  let result;
  try {
    result = await store.saveSession(session);
  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }
  if (!result.ok && !state.storageFailed) {
    state.storageFailed = true;
    showNotice("Sohbet kaydedilemedi. Tarayıcı depolaması dolu veya izin yok. " +
      "Mesajlar yalnızca bu sekmede kalabilir.", "warn", "storage");
  }
  if (result.backend === "local") setText("storageBackend", "localStorage (yerel)");
  state.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  renderHistory();
  refreshStorageInfo();
}

function ensureSession() {
  let session = state.sessions.find((s) => s.id === state.currentId);
  if (session) return session;
  const now = Date.now();
  session = {
    id: newId(), title: "Yeni sohbet", createdAt: now, updatedAt: now, messages: [],
  };
  state.sessions.unshift(session);
  state.currentId = session.id;
  state.settings.lastSession = session.id;
  persistSettings();
  renderHistory();
  return session;
}

function addUserMessage(session, text) {
  session.messages.push({
    id: newId(), role: "user", text, ts: Date.now(), response: null,
    classifier: null, elapsed_ms: null,
  });
  if (session.messages.filter((m) => m.role === "user").length === 1) {
    session.title = titleFromText(text);
  }
}

function addAssistantMessage(session, text, response, classifier = null, elapsedMs = null) {
  session.messages.push({
    id: newId(), role: "assistant", text, ts: Date.now(),
    response: response || null, classifier: classifier || null,
    elapsed_ms: elapsedMs,
  });
}

/* --------------------------------------------------------------------------
   Geçmiş listesi
   -------------------------------------------------------------------------- */

function sessionMatches(session, query) {
  if (!query) return true;
  const q = query.toLocaleLowerCase("tr-TR");
  if (session.title.toLocaleLowerCase("tr-TR").includes(q)) return true;
  return session.messages.some((m) =>
    String(m.text || "").toLocaleLowerCase("tr-TR").includes(q) ||
    String(m.response?.message || "").toLocaleLowerCase("tr-TR").includes(q));
}

function renderHistory() {
  const list = $("historyList");
  const empty = $("historyEmpty");
  if (!list || !empty) return;
  list.replaceChildren();
  const query = String($("historySearch")?.value || "").trim();
  const sessions = state.sessions.filter((s) => sessionMatches(s, query));

  for (const session of sessions) {
    const item = el("div", `history-item${session.id === state.currentId ? " active" : ""}`);
    const open = el("button", "history-open");
    open.type = "button";
    open.title = session.title;
    open.setAttribute("aria-current", session.id === state.currentId ? "true" : "false");

    const title = el("span", "history-title", session.title);
    const lastMessage = session.messages[session.messages.length - 1];
    const time = el("span", "history-time",
      `${timeLabel(session.updatedAt)}${lastMessage?.role === "assistant" ? " · yanıtlandı" : ""}`);
    open.append(title, time);
    open.addEventListener("click", () => loadSession(session.id));

    const del = el("button", "history-delete");
    del.type = "button";
    del.innerHTML = ICON_TRASH;
    del.setAttribute("aria-label", `${session.title} sohbetini sil`);
    del.title = "Sohbeti sil";
    del.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await deleteSession(session.id);
    });

    item.append(open, del);
    list.appendChild(item);
  }

  empty.hidden = sessions.length > 0;
  if (!sessions.length) {
    empty.textContent = query
      ? "Aramanızla eşleşen sohbet yok."
      : "Henüz kayıtlı sohbet yok.";
  }
}

function loadSession(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return;
  state.currentId = id;
  state.settings.lastSession = id;
  persistSettings();
  renderChat(true);
  renderHistory();
  closeDrawer();
  $("input")?.focus({ preventScroll: true });
}

async function deleteSession(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return;
  if (state.busySessionId === id) abortCurrent({ silent: true });
  const ok = await askConfirm({
    title: "Sohbet silinsin mi?",
    text: `“${session.title}” sohbeti bu tarayıcıdan kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    okLabel: "Sohbeti sil",
  });
  if (!ok) return;
  try { await store.deleteSession(id); } catch { /* yerel liste yine güncellenir */ }
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (state.currentId === id) {
    state.currentId = null;
    state.settings.lastSession = null;
    persistSettings();
    renderChat(true);
  }
  renderHistory();
  toast("Sohbet silindi.", "ok");
}

/* --------------------------------------------------------------------------
   Sohbet çizimi
   -------------------------------------------------------------------------- */

function renderChat(forceScroll = false) {
  const session = state.sessions.find((s) => s.id === state.currentId) || null;
  const welcome = $("welcome");
  const messages = $("messages");
  if (!messages) return;
  const stick = forceScroll || isNearBottom();

  messages.replaceChildren();
  const hasMessages = !!session && session.messages.length > 0;
  if (welcome) welcome.hidden = hasMessages;
  if (!session) {
    setText("chatTitle", "AwuGöktürk");
    setText("chatSubtitle", "Yerel ajan · sunucusuz");
  } else {
    setText("chatTitle", session.title);
    setText("chatSubtitle", `${session.messages.length} mesaj · yerel · sunucusuz`);
  }

  if (session) {
    const fragment = document.createDocumentFragment();
    for (const message of session.messages) {
      fragment.appendChild(message.role === "user"
        ? renderUserMessage(message)
        : renderAssistantMessage(message));
    }
    messages.appendChild(fragment);
  }

  showTyping(state.busy && state.busySessionId === state.currentId && !!session);
  updateScrollButton();
  if (!hasMessages) {
    requestAnimationFrame(() => { const scroller = $("chatScroll"); if (scroller) scroller.scrollTop = 0; });
  } else if (stick) {
    requestAnimationFrame(() => scrollToBottom(forceScroll === "smooth"));
  }
}

function renderUserMessage(message) {
  const article = el("article", "message user");
  article.dataset.id = message.id;
  const bubble = el("div", "bubble", message.text);
  bubble.title = timeLabel(message.ts);
  article.appendChild(bubble);
  return article;
}

function statusBadge(status) {
  const label = STATUS_LABELS[status] || "Yanıt";
  const kind = status === "ok" ? "ok"
    : status === "error" ? "error"
      : status === "needs_info" || status === "unsupported" ? "warn" : "info";
  return el("span", `badge badge-${kind}`, label);
}

function renderAssistantMessage(message) {
  const response = message.response;
  const article = el("article", "message assistant");
  article.dataset.id = message.id;

  const avatar = el("span", "avatar avatar-agent");
  avatar.setAttribute("aria-hidden", "true");
  const img = document.createElement("img");
  img.src = "./assets/logo.svg";
  img.alt = "";
  avatar.appendChild(img);

  const column = el("div", "msg-column");
  const head = el("div", "msg-head");
  head.appendChild(el("span", "msg-author", "AwuGöktürk"));
  head.appendChild(el("span", "msg-dot", "·"));
  head.appendChild(el("span", "msg-meta", timeLabel(message.ts)));
  if (response && response.status) head.appendChild(statusBadge(response.status));
  if (response && response.category && CATEGORY_LABELS[response.category]) {
    head.appendChild(el("span", "badge", CATEGORY_LABELS[response.category]));
  }
  if (message.elapsed_ms) {
    head.appendChild(el("span", "msg-meta", `${Math.round(message.elapsed_ms)} ms`));
  }

  const card = el("div", "agent-card");
  const md = el("div", "md");
  md.innerHTML = renderMarkdown(response?.message || message.text || "");
  card.appendChild(md);

  if (response) renderResponseDetails(card, response, message);

  column.appendChild(head);
  column.appendChild(card);
  column.appendChild(renderMessageFooter(message));
  article.append(avatar, column);
  return article;
}

function detailsBlock(title, content, { open = false } = {}) {
  const details = document.createElement("details");
  details.className = "answer-details";
  details.open = open;
  const summary = el("summary", "", title);
  const body = el("div", "details-body");
  if (typeof content === "string") body.textContent = content;
  else body.appendChild(content);
  details.append(summary, body);
  return details;
}

function textList(items, ordered = false) {
  const list = el(ordered ? "ol" : "ul", "clean-list");
  for (const item of items) list.appendChild(el("li", "", String(item)));
  return list;
}

function renderResponseDetails(card, response, message) {
  const struct = el("div", "struct");

  const chips = el("div", "chips");
  if (response.board) chips.appendChild(el("span", "chip chip-strong", response.board));
  if (response.framework) {
    const fw = response.framework === "arduino-esp32" ? "Arduino-ESP32" : "Arduino C++";
    chips.appendChild(el("span", "chip", fw));
  }
  if (Array.isArray(response.libraries)) {
    for (const lib of response.libraries) chips.appendChild(el("span", "chip", lib));
  }
  if (Array.isArray(response.modules)) {
    for (const mod of response.modules) chips.appendChild(el("span", "chip", mod));
  }
  if (chips.childElementCount) struct.appendChild(chips);

  if (Array.isArray(response.guard) && response.guard.length) {
    const box = el("div");
    for (const finding of response.guard) {
      const level = finding.level === "error" ? "error" : "warning";
      const row = el("div", `guard-item ${level}`);
      row.appendChild(el("span", "g-level", level === "error" ? "HATA" : "UYARI"));
      row.appendChild(el("span", "", finding.message));
      box.appendChild(row);
    }
    const hasError = response.guard.some((g) => g.level === "error");
    struct.appendChild(detailsBlock(`AwuGuard · ${response.guard.length} bulgu`, box, { open: hasError }));
  }

  if (response.build && response.build.ran) {
    const ok = !!response.build.ok;
    const line = el("div", `build-line ${ok ? "ok" : "bad"}`);
    line.appendChild(el("span", "", ok ? "✓" : "!"));
    const body = el("div");
    body.appendChild(el("strong", "", ok ? "Statik ön kontrol: yapısal sorun yok" : "Statik ön kontrol: sorun bulundu"));
    const note = el("small", "", "Derleme değil · " + (response.build.tool || "js-static") +
      " · gerçek AVR/ESP32 derlemesi yapılmadı");
    body.appendChild(note);
    line.appendChild(body);
    struct.appendChild(line);

    const detailWrap = el("div");
    if (response.build.note) detailWrap.appendChild(el("p", "", response.build.note));
    if (response.build.stderr) {
      const pre = el("pre", "md-code");
      const code = el("code", "", response.build.stderr);
      pre.appendChild(code);
      detailWrap.appendChild(pre);
    }
    const buildDetails = detailsBlock("Ön kontrol ayrıntısı", detailWrap, { open: !ok });
    struct.appendChild(buildDetails);
  }

  if (Array.isArray(response.questions) && response.questions.length) {
    const box = el("div", "question-box");
    box.appendChild(el("h4", "", "Yanıt için eksik bilgi"));
    box.appendChild(textList(response.questions));
    struct.appendChild(box);
  }

  if (response.code) {
    struct.appendChild(codeBlock(response.code, {
      language: "Arduino C++",
      label: response.board ? `${response.board} · Arduino C++` : "Arduino C++",
    }));
  }

  if (Array.isArray(response.wiring) && response.wiring.length) {
    struct.appendChild(detailsBlock("Bağlantı şeması", textList(response.wiring), { open: true }));
  }

  if (Array.isArray(response.assumptions) && response.assumptions.length) {
    struct.appendChild(detailsBlock("Varsayımlar", textList(response.assumptions), { open: true }));
  }

  if (Array.isArray(response.tests) && response.tests.length) {
    const list = el("ul", "clean-list");
    for (const test of response.tests) {
      const li = el("li");
      const parts = [];
      if (test.type) parts.push(`[${test.type}]`);
      if (test.expect) parts.push(test.expect);
      if (test.note) parts.push(`(${test.note})`);
      li.textContent = parts.join(" ");
      list.appendChild(li);
    }
    struct.appendChild(detailsBlock("Önerilen testler", list));
  }

  if (Array.isArray(response.hardware_plan) && response.hardware_plan.length) {
    struct.appendChild(detailsBlock("Donanım planı", textList(response.hardware_plan, true)));
  }

  if (Array.isArray(response.notes) && response.notes.length) {
    const hasClassifierNote = response.notes.some((n) => String(n).includes("5K"));
    struct.appendChild(detailsBlock("Notlar", textList(response.notes), { open: hasClassifierNote }));
  }

  if (struct.childElementCount) card.appendChild(struct);
}

function renderMessageFooter(message) {
  const foot = el("div", "msg-foot");
  const classifier = message.classifier;

  if (classifier && classifier.available) {
    const top = classifier.probs?.[classifier.label];
    const badge = el("span", "badge badge-model",
      `5K ipucu: ${classifier.label}${top !== undefined ? ` · ${formatPercent(top)}` : ""}`);
    badge.title = "5K GRU sınıflandırıcı yalnızca görev türü tahmini üretir; yanıtı üretmez. " +
      (classifier.note || "Kanıt değildir.");
    foot.appendChild(badge);
  } else {
    const badge = el("span", "badge", "5K ipucu yok");
    badge.title = "5K sınıflandırıcı hazır değil. Bu yanıt yalnızca kural/şablon katmanından üretildi.";
    foot.appendChild(badge);
  }

  if (message.response?.intent && !message.response?.classifier_hint) {
    foot.appendChild(el("span", "msg-note", "kural tabanı"));
  }

  const tools = el("div", "msg-tools");
  const copy = el("button", "tool-btn", "Yanıtı kopyala");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    const response = message.response;
    const text = [
      response?.message || message.text || "",
      response?.code ? "\n```cpp\n" + response.code + "\n```" : "",
    ].filter(Boolean).join("\n");
    try {
      await copyText(text);
      copy.textContent = "Kopyalandı";
      setTimeout(() => { copy.textContent = "Yanıtı kopyala"; }, 1700);
    } catch {
      copy.textContent = "Kopyalanamadı";
      setTimeout(() => { copy.textContent = "Yanıtı kopyala"; }, 2200);
    }
  });
  tools.appendChild(copy);
  foot.appendChild(tools);
  return foot;
}

function showTyping(show) {
  const typing = $("typing");
  if (!typing) return;
  typing.hidden = !show;
  const messages = $("messages");
  if (messages) messages.setAttribute("aria-busy", show ? "true" : "false");
}

/* --------------------------------------------------------------------------
   Worker
   -------------------------------------------------------------------------- */

function startWorker() {
  if (typeof Worker === "undefined") {
    state.workerFailed = true;
    state.model.status = "error";
    state.model.error = "Tarayıcı Web Worker desteklemiyor; yerel ajan başlatılamadı.";
    renderModelState();
    showNotice("Tarayıcınız Web Worker desteklemiyor. Bu uygulama için modern bir tarayıcı gerekir.",
      "error", "worker");
    updateComposerState();
    return;
  }
  try {
    state.worker = new Worker(new URL("./runtime/worker.js", document.baseURI), {
      type: "module",
      name: "awu-agent",
    });
  } catch (err) {
    state.workerFailed = true;
    state.model.status = "error";
    state.model.error = err.message || String(err);
    renderModelState();
    showNotice("Yerel ajan başlatılamadı. Ayrıntı: " + state.model.error, "error", "worker");
    updateComposerState();
    return;
  }

  state.worker.addEventListener("message", handleWorkerMessage);
  state.worker.addEventListener("error", (ev) => {
    state.workerFailed = true;
    state.workerReady = false;
    const message = ev.message || "Worker betiği yüklenemedi.";
    showNotice("Yerel ajan çalışırken hata oluştu: " + message, "error", "worker");
    state.model.status = "error";
    state.model.error = message;
    renderModelState();
    rejectPending(new Error(message));
    updateComposerState();
  });
  state.worker.addEventListener("messageerror", () => {
    showNotice("Worker mesajı çözümlenemedi; sayfayı yenileyin.", "error", "worker");
  });

  state.worker.postMessage({ type: "init" });
}

function rejectPending(err) {
  const p = state.pendingMessage;
  if (p) {
    clearTimeout(p.timer);
    state.pendingMessage = null;
    p.reject(err);
  }
  const pred = state.pendingPredict;
  if (pred) {
    clearTimeout(pred.timer);
    state.pendingPredict = null;
    pred.reject(err);
  }
}

function handleWorkerMessage(ev) {
  const msg = ev.data;
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "model-status") {
    applyModelState(msg.state);
    return;
  }
  if (msg.type === "model-progress") {
    const progress = msg.progress || { label: "Model hazırlanıyor", percent: 0 };
    state.model.progress = progress;
    if (state.model.status !== "ready" && state.model.status !== "error") state.model.status = "loading";
    renderModelState();
    return;
  }
  if (msg.type === "model-ready") {
    applyModelState(msg.state);
    if (state.model.status === "ready") {
      if (!state.modelFirstReady) {
        state.modelFirstReady = true;
      } else if (state.modelReloadRequested) {
        toast("5K modeli yeniden yüklendi ve doğrulandı.", "ok");
      }
      if (state.noticeKey === "model-error") hideNotice();
    }
    state.modelReloadRequested = false;
    renderModelState();
    return;
  }
  if (msg.type === "model-error") {
    applyModelState(msg.state);
    state.modelReloadRequested = false;
    const detail = msg.state?.error || "Bilinmeyen model hatası.";
    showNotice("5K sınıflandırıcı yüklenemedi. Sohbet ve kod üretimi kural tabanlı olarak çalışmaya devam eder. Ayrıntı: " +
      detail, "warn", "model-error");
    renderModelState();
    return;
  }
  if (msg.type === "ready") {
    state.workerReady = true;
    applyModelState(msg.state);
    if (!msg.ok && state.model.status !== "ready") {
      const detail = state.model.error || "Model yüklenemedi.";
      showNotice("5K sınıflandırıcı kullanılamıyor. Kural tabanlı sohbet ve kod üretimi çalışır. Ayrıntı: " + detail,
        "warn", "model-error");
    }
    renderCapabilities();
    renderModelState();
    updateComposerState();
    return;
  }
  if (msg.type === "response") {
    const pending = state.pendingMessage;
    if (!pending || pending.id !== msg.id) return; // durdurulmuş/eski istek
    clearTimeout(pending.timer);
    state.pendingMessage = null;
    pending.resolve(msg);
    return;
  }
  if (msg.type === "response-error") {
    const pending = state.pendingMessage;
    if (!pending || pending.id !== msg.id) return;
    clearTimeout(pending.timer);
    state.pendingMessage = null;
    pending.reject(new Error(msg.error || "Yerel ajan yanıt üretemedi."));
    return;
  }
  if (msg.type === "predict-result") {
    const pending = state.pendingPredict;
    if (!pending || pending.id !== msg.id) return;
    clearTimeout(pending.timer);
    state.pendingPredict = null;
    pending.resolve(msg.prediction);
    return;
  }
  if (msg.type === "cache-cleared") {
    state.model = {
      status: "idle",
      progress: { stage: "idle", label: "Model önbelleği temizlendi", percent: 0 },
      info: null,
      error: null,
    };
    renderModelState();
    toast(msg.ok ? "Model önbelleği ve bellek temizlendi." : "Model önbelleği temizlenemedi.",
      msg.ok ? "ok" : "error");
    return;
  }
  if (msg.type === "worker-error") {
    showNotice("Yerel ajan hatası: " + (msg.error || "bilinmeyen hata"), "error", "worker");
  }
}

function applyModelState(next) {
  if (!next) return;
  state.model = {
    status: next.status || "loading",
    progress: next.progress || state.model.progress,
    info: next.info || null,
    error: next.error || null,
  };
  renderModelState();
}

function requestChat(text, boardHint) {
  return new Promise((resolve, reject) => {
    const id = newId();
    const timer = setTimeout(() => {
      if (state.pendingMessage?.id === id) {
        state.pendingMessage = null;
        reject(new Error("Yerel ajan 30 saniye içinde yanıt vermedi. İşlem iptal edildi; sahte yanıt üretilmedi."));
      }
    }, CHAT_TIMEOUT_MS);
    state.pendingMessage = { id, resolve, reject, timer };
    state.worker.postMessage({ type: "message", id, text, boardHint: boardHint || null });
  });
}

function requestPrediction(text) {
  return new Promise((resolve, reject) => {
    const id = newId();
    const timer = setTimeout(() => {
      if (state.pendingPredict?.id === id) {
        state.pendingPredict = null;
        reject(new Error("Model testi zaman aşımına uğradı."));
      }
    }, PREDICT_TIMEOUT_MS);
    state.pendingPredict = { id, resolve, reject, timer };
    state.worker.postMessage({ type: "predict", id, text });
  });
}

/* --------------------------------------------------------------------------
   Mesaj gönderme / durdurma
   -------------------------------------------------------------------------- */

async function sendMessage(text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  if (clean.length > MAX_INPUT) {
    toast(`Mesaj çok uzun (en fazla ${formatNumber(MAX_INPUT)} karakter).`, "error");
    return;
  }
  if (state.busy) {
    toast("Önce süren yanıtı durdurun.", "error");
    return;
  }
  if (!state.worker || state.workerFailed) {
    toast("Yerel ajan başlatılamadı; mesaj gönderilemiyor.", "error");
    return;
  }

  const session = ensureSession();
  addUserMessage(session, clean);
  state.busy = true;
  state.busySessionId = session.id;
  updateComposerState();
  renderChat(true);
  renderHistory();

  const input = $("input");
  if (input) { input.value = ""; autoResize(); updateCharCount(); }
  updateComposerState();

  try {
    const data = await requestChat(clean, state.settings.board);
    const result = data.result;
    addAssistantMessage(session, result.message || "", result, data.classifier, data.elapsed_ms);
    await saveSession(session);
  } catch (err) {
    if (err && err.aborted) {
      toast("Yanıt durduruldu. Sahte veya eksik yanıt eklenmedi.", "ok");
      return;
    }
    const detail = err && err.message ? err.message : String(err);
    const errorResponse = {
      status: "error",
      message: "Yerel ajan bu isteği tamamlayamadı: " + detail +
        "\n\nBunun yerine uydurma bir yanıt üretilmedi. Dilerseniz tekrar deneyin.",
      category: null,
      intent: null,
      classifier_hint: null,
    };
    addAssistantMessage(session, errorResponse.message, errorResponse, null, null);
    await saveSession(session);
    showNotice("Yerel ajan hatası: " + detail, "error", "worker");
  } finally {
    state.busy = false;
    state.busySessionId = null;
    state.pendingMessage = null;
    showTyping(false);
    updateComposerState();
    if (state.currentId === session.id) renderChat();
    renderHistory();
  }
}

function abortCurrent({ silent = false } = {}) {
  if (!state.busy) return;
  const pending = state.pendingMessage;
  state.busy = false;
  state.busySessionId = null;
  state.pendingMessage = null;
  if (pending) {
    clearTimeout(pending.timer);
    const err = new Error("Kullanıcı durdurdu.");
    err.aborted = true;
    pending.reject(err);
  }
  showTyping(false);
  updateComposerState();
  if (!silent) toast("Durduruldu. Yanıt eklenmedi.", "ok");
  if (state.currentId) renderChat();
}

function updateComposerState() {
  const input = $("input");
  const send = $("sendBtn");
  const stop = $("stopBtn");
  if (input) input.setAttribute("aria-busy", state.busy ? "true" : "false");
  if (send) send.disabled = state.busy || !state.worker || state.workerFailed ||
    !String(input?.value || "").trim();
  if (stop) stop.hidden = !state.busy;
}

/* --------------------------------------------------------------------------
   Model paneli
   -------------------------------------------------------------------------- */

function renderModelState() {
  const status = state.model.status || "loading";
  const progress = state.model.progress || {};
  const info = state.model.info;
  const error = state.model.error;

  const chipText = status === "ready" ? "Model hazır"
    : status === "loading" ? "Model yükleniyor…"
      : status === "error" ? "Model yok" : "Model yüklenmedi";
  setText("modelChipText", chipText);
  const dot = $("modelDot");
  if (dot) dot.className = "dot " + (status === "ready" ? "ok"
    : status === "loading" ? "loading"
      : status === "error" ? "err" : "idle");
  const chip = $("modelChip");
  if (chip) {
    chip.title = `Yerel model: ${MODEL_STATUS_LABELS[status] || status}` +
      (info?.params ? ` · ${formatNumber(info.params)} parametre` : "");
    chip.setAttribute("aria-label", chip.title);
  }

  const orb = $("modelOrb");
  if (orb) orb.className = `status-orb ${status === "loading" ? "loading"
    : status === "ready" ? "ready" : status === "error" ? "error" : ""}`;

  setText("modelStatusTitle", MODEL_STATUS_LABELS[status] || "Model");
  let detail = "Ağırlıklar aynı kaynaktan indirilip SHA-256 ile doğrulanacak.";
  if (status === "loading") {
    detail = progress.label || "Model hazırlanıyor";
    if (Number.isFinite(progress.percent) && progress.percent > 0 && progress.percent < 100) {
      detail += ` · %${progress.percent}`;
    }
  } else if (status === "ready") {
    detail = `SHA-256 doğrulandı · ${info?.from_cache ? "önbellekten" : "indirildi"} · ` +
      `${formatMs(info?.duration_ms)} · ${formatNumber(info?.params)} parametre`;
  } else if (status === "error") {
    detail = "Model kullanılamıyor; sohbet ve kod üretimi kural tabanlı devam ediyor.";
  } else if (status === "idle") {
    detail = "Model önbellekte yok. Yeniden indirip doğrulayabilirsiniz.";
  }
  setText("modelStatusDetail", detail);

  const progressWrap = $("modelProgress");
  const loading = status === "loading";
  if (progressWrap) progressWrap.hidden = !loading;
  if (loading) {
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    const bar = $("modelProgressBar");
    if (bar) bar.style.width = `${percent}%`;
    setText("modelProgressText", `%${percent}`);
    const total = Number(progress.total) || 0;
    const loaded = Number(progress.loaded) || 0;
    setText("modelProgressBytes",
      total ? `${formatBytes(loaded)} / ${formatBytes(total)}` : loaded ? formatBytes(loaded) : "");
  }

  const errorEl = $("modelError");
  if (errorEl) {
    errorEl.hidden = !error;
    errorEl.textContent = error || "";
  }

  const reload = $("modelReloadBtn");
  if (reload) {
    reload.disabled = loading;
    reload.textContent = loading ? "İndiriliyor…" : "Yeniden indir ve doğrula";
  }
  const clear = $("modelClearBtn");
  if (clear) clear.disabled = loading;
  const test = $("modelTestBtn");
  if (test) test.disabled = loading || !state.worker || state.workerFailed;

  setText("settingsModelState", status === "ready"
    ? `Hazır · ${formatNumber(info?.params)} parametre`
    : loading ? "Yükleniyor…" : status === "error" ? "Kullanılamıyor" : "Yüklenmedi");
  setText("settingsModelParams", info?.params ? formatNumber(info.params) : "—");

  setText("modelVersion", info?.model_version || "—");
  setText("modelArch", info?.architecture || "—");
  setText("modelParams", info?.params ? formatNumber(info.params) : "—");
  setText("modelLabels", Array.isArray(info?.labels) && info.labels.length
    ? info.labels.join(", ") : "—");
  setText("modelSha", info?.sha256 || "—");
  setText("modelBytes", info?.bytes
    ? `${formatBytes(info.bytes)} · ${formatNumber(info.bytes)} bayt` : "—");

  if (status === "ready" || status === "error" || status === "idle") {
    updatePrivacyStatus();
  }
  renderModelTestState();
}

function renderModelTestState() {
  const btn = $("modelTestBtn");
  if (!btn) return;
  btn.disabled = state.model.status !== "ready" || !state.worker || state.workerFailed ||
    !!state.pendingPredict;
  const input = $("modelTestInput");
  if (input) input.setAttribute("aria-busy", state.pendingPredict ? "true" : "false");
}

async function runModelTest() {
  const input = $("modelTestInput");
  const result = $("modelTestResult");
  const text = String(input?.value || "").trim();
  if (!result) return;
  if (!text) {
    result.hidden = false;
    result.replaceChildren(el("p", "error-text", "Test için bir metin girin."));
    return;
  }
  if (state.model.status !== "ready") {
    result.hidden = false;
    result.replaceChildren(el("p", "error-text",
      "5K modeli şu anda hazır değil. Gerçek çıkarım çalıştırılamadı; sahte sonuç gösterilmedi. " +
      "Modeli yeniden indirip doğrulayın."));
    return;
  }
  if (!state.worker || state.workerFailed) {
    result.hidden = false;
    result.replaceChildren(el("p", "error-text", "Yerel ajan çalışmıyor; test çalıştırılamadı."));
    return;
  }

  result.hidden = false;
  result.replaceChildren(el("p", "muted", "Gerçek 5K çıkarımı CPU üzerinde çalıştırılıyor…"));
  renderModelTestState();
  try {
    const prediction = await requestPrediction(text);
    renderPrediction(result, prediction);
  } catch (err) {
    result.replaceChildren(el("p", "error-text", err.message || String(err)));
  } finally {
    renderModelTestState();
  }
}

function renderPrediction(container, prediction) {
  container.replaceChildren();
  if (!prediction || !prediction.available) {
    container.appendChild(el("p", "error-text",
      prediction?.note || "5K modeli kullanılamıyor; tahmin üretilmedi."));
    return;
  }
  const sorted = Object.entries(prediction.probs || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const top = prediction.probs?.[prediction.label];

  const labelLine = el("div", "test-label");
  labelLine.appendChild(el("span", "badge badge-model", "5K çıkarımı"));
  labelLine.appendChild(el("strong", "", prediction.label));
  if (top !== undefined) labelLine.appendChild(el("span", "badge", formatPercent(top, 1)));
  container.appendChild(labelLine);

  for (const [label, prob] of sorted) {
    const row = el("div", `prob-row${label === prediction.label ? " top" : ""}`);
    row.appendChild(el("span", "prob-name", label));
    const track = el("span", "prob-track");
    const fill = el("span", "prob-fill");
    fill.style.width = `${Math.max(0, Math.min(100, Number(prob) * 100))}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "prob-val", formatPercent(prob, 1)));
    container.appendChild(row);
  }

  const note = "Bu bir görev türü sınıflandırmasıdır; metin üretmez ve yanıt kanıtı değildir. " +
    "Yönlendirici kural tabanı birincildir.";
  container.appendChild(el("p", "test-note", note));
}

/* --------------------------------------------------------------------------
   Yetenekler ve depolama bilgisi
   -------------------------------------------------------------------------- */

function hasCrypto() {
  return !!(window.crypto && window.crypto.subtle);
}

function capabilityItems() {
  const secure = window.isSecureContext;
  const sw = "serviceWorker" in navigator;
  return [
    { name: "JavaScript (ES modülleri)", ok: true, note: "gerekli" },
    { name: "Web Worker", ok: typeof Worker === "function", note: "ajanı ana iş parçacığından ayırır" },
    { name: "IndexedDB", ok: "indexedDB" in window, note: "sohbet geçmişi" },
    { name: "Cache Storage", ok: "caches" in window, note: "model + çevrimdışı önbellek" },
    { name: "Service Worker", ok: sw && secure, note: secure ? "çevrimdışı PWA" : "HTTPS/localhost gerekir" },
    { name: "SHA-256 (crypto.subtle)", ok: hasCrypto(), note: "model doğrulama" },
    { name: "WebAssembly", ok: typeof WebAssembly === "object", note: "bu sürümde kullanılmıyor" },
    { name: "WebGPU", ok: !!navigator.gpu, note: "bu sürümde kullanılmıyor; CPU yeterli" },
    { name: "Pano API", ok: !!(navigator.clipboard && secure), note: "kod kopyalama" },
    { name: "Çevrimdışı çalışma", ok: sw && secure && "caches" in window, note: "ilk model indirmesinden sonra" },
  ];
}

function renderCapabilities() {
  const items = capabilityItems();
  for (const id of ["capabilityList", "modelCompat"]) {
    const list = $(id);
    if (!list) continue;
    list.replaceChildren();
    for (const item of items) {
      const li = el("li");
      const mark = el("span", `cap-mark ${item.ok ? "yes" : "no"}`, item.ok ? "✓" : "×");
      mark.setAttribute("aria-hidden", "true");
      li.appendChild(mark);
      const text = el("span");
      text.appendChild(document.createTextNode(item.name));
      if (item.note) text.appendChild(el("span", "cap-note", ` ${item.note}`));
      li.appendChild(text);
      li.title = `${item.name}: ${item.ok ? "destekleniyor" : "desteklenmiyor / kullanılamıyor"}` +
        (item.note ? ` — ${item.note}` : "");
      list.appendChild(li);
    }
  }
}

async function refreshStorageInfo() {
  const node = $("storageInfo");
  if (!node) return;
  const count = state.sessions.length;
  const messages = state.sessions.reduce((n, s) => n + s.messages.length, 0);
  const backend = store.backend;
  let usageText = "";
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est && est.usage) usageText = ` · yaklaşık ${formatBytes(est.usage)} kullanılıyor`;
    }
  } catch { /* desteklenmiyorsa sessizce atla */ }
  const backendNote = backend === "local"
    ? " IndexedDB kullanılamadığı için localStorage kullanılıyor."
    : backend === "memory" ? " Kalıcı depolama kullanılamıyor." : "";
  node.textContent = `${count} sohbet · ${messages} mesaj bu tarayıcıda saklanıyor${usageText}.` +
    backendNote + " Hiçbir sohbet harici sunucuya gönderilmez.";
}

/* --------------------------------------------------------------------------
   Ağ / gizlilik / çevrimdışı
   -------------------------------------------------------------------------- */

function updateNetworkStatus() {
  state.online = navigator.onLine;
  const chip = $("netChip");
  if (chip) {
    chip.className = "net-chip";
    const dot = chip.querySelector(".dot");
    if (dot) dot.className = `dot ${state.online ? "online" : "offline"}`;
    setText("netChipText", state.online ? "Çevrimiçi" : "Çevrimdışı");
    chip.title = state.online
      ? "Ağ var. Uygulama yine de yalnızca aynı kaynaktan model dosyası ister."
      : "Çevrimdışı. Sohbet, kod üretimi ve önbellekteki model çalışır.";
  }
  if (!state.online) {
    showNotice("Çevrimdışısınız. Sohbet ve kod üretimi çalışmaya devam eder. " +
      "5K modeli daha önce önbelleğe alınmadıysa ipucu kullanılamaz; harici istek yapılmaz.",
    "warn", "offline");
  } else if (state.noticeKey === "offline") {
    hideNotice();
  }
  updatePrivacyStatus();
  renderCapabilities();
}

function updatePrivacyStatus() {
  const node = $("privacyStatus");
  if (!node) return;
  if (!navigator.onLine) {
    node.textContent = "Çevrimdışı: hiçbir ağ isteği yapılmıyor. Tüm işlem cihazda.";
  } else {
    node.textContent = "İnternet: yalnızca aynı kaynaktaki model dosyası için kullanılır. " +
      "Mesajlar hiçbir ağ isteğine eklenmez; CSP connect-src 'self' harici bağlantıyı engeller.";
  }
}

/* --------------------------------------------------------------------------
   PWA
   -------------------------------------------------------------------------- */

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    showNotice("Tarayıcı Service Worker desteklemiyor; çevrimdışı önbellek kullanılamaz. " +
      "Sohbet yine yerel çalışır.", "warn", "sw");
    return;
  }
  if (!window.isSecureContext) {
    showNotice("Çevrimdışı PWA için HTTPS veya localhost gerekir. " +
      "Bu sayfa güvenli bağlamda değil.", "warn", "sw");
    return;
  }
  try {
    state.swReg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    if (state.swReg.waiting && navigator.serviceWorker.controller) showUpdateBanner(state.swReg.waiting);
    state.swReg.addEventListener("updatefound", () => {
      const installing = state.swReg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(installing);
        }
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (state.reloadingForUpdate) window.location.reload();
    });
  } catch (err) {
    showNotice("Çevrimdışı önbellek kaydı başarısız: " + (err.message || err) +
      ". Uygulama çevrimiçi olarak çalışmaya devam eder.", "warn", "sw");
  }
}

function showUpdateBanner(worker) {
  state.updateWorker = worker;
  const banner = $("updateBanner");
  if (banner) banner.hidden = false;
}

function applyUpdate() {
  const banner = $("updateBanner");
  if (banner) banner.hidden = true;
  state.reloadingForUpdate = true;
  if (state.updateWorker) {
    state.updateWorker.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => window.location.reload(), 1200);
  } else {
    window.location.reload();
  }
}

/* --------------------------------------------------------------------------
   Onay diyaloğu
   -------------------------------------------------------------------------- */

function askConfirm({ title, text, okLabel = "Sil" }) {
  const dialog = $("confirmDialog");
  if (!dialog) return Promise.resolve(false);
  if (state.confirmResolver) return Promise.resolve(false);
  setText("confirmTitle", title);
  setText("confirmText", text);
  setText("confirmOk", okLabel);
  dialogOpen(dialog);
  return new Promise((resolve) => { state.confirmResolver = resolve; });
}

function settleConfirm(value) {
  const resolver = state.confirmResolver;
  state.confirmResolver = null;
  const dialog = $("confirmDialog");
  if (dialog && dialog.open) dialogClose(dialog);
  if (resolver) resolver(value);
}

/* --------------------------------------------------------------------------
   Dışa aktarma / geçmiş temizleme
   -------------------------------------------------------------------------- */

function exportSessions() {
  if (!state.sessions.length) {
    toast("Dışa aktarılacak sohbet yok.", "error");
    return;
  }
  const payload = {
    app: "AwuGöktürk Web",
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    schema: 1,
    privacy: "Bu dosya yalnızca kullanıcı isteğiyle, tarayıcıda oluşturuldu. Hiçbir veri sunucuya gönderilmedi.",
    sessions: state.sessions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `awugokturk-sohbetler-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${state.sessions.length} sohbet dışa aktarıldı.`, "ok");
}

async function clearHistory() {
  if (state.busy) abortCurrent({ silent: true });
  const ok = await askConfirm({
    title: "Tüm geçmiş silinsin mi?",
    text: "Bu tarayıcıdaki tüm sohbetler kalıcı olarak silinecek. Model önbelleği silinmez. " +
      "Bu işlem geri alınamaz.",
    okLabel: "Tümünü sil",
  });
  if (!ok) return;
  try { await store.clearAll(); } catch { /* durum yine sıfırlanır */ }
  state.sessions = [];
  state.currentId = null;
  state.settings.lastSession = null;
  persistSettings();
  renderChat(true);
  renderHistory();
  refreshStorageInfo();
  toast("Sohbet geçmişi silindi.", "ok");
}

/* --------------------------------------------------------------------------
   Mobil çekmece
   -------------------------------------------------------------------------- */

function openDrawer() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  const menu = $("menuBtn");
  if (!sidebar) return;
  sidebar.classList.add("open");
  if (overlay) overlay.hidden = false;
  if (menu) menu.setAttribute("aria-expanded", "true");
  document.body.classList.add("drawer-open");
  $("sidebarCloseBtn")?.focus({ preventScroll: true });
}

function closeDrawer() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  const menu = $("menuBtn");
  if (!sidebar) return;
  sidebar.classList.remove("open");
  if (overlay) overlay.hidden = true;
  if (menu) menu.setAttribute("aria-expanded", "false");
  document.body.classList.remove("drawer-open");
}

function drawerOpen() {
  const sidebar = $("sidebar");
  return !!sidebar && sidebar.classList.contains("open");
}

/* --------------------------------------------------------------------------
   Olay bağlama
   -------------------------------------------------------------------------- */

function bindEvents() {
  $("menuBtn")?.addEventListener("click", openDrawer);
  $("sidebarCloseBtn")?.addEventListener("click", closeDrawer);
  $("sidebarOverlay")?.addEventListener("click", closeDrawer);

  $("newChatBtn")?.addEventListener("click", () => {
    if (state.busy) abortCurrent({ silent: true });
    state.currentId = null;
    state.settings.lastSession = null;
    persistSettings();
    renderChat(true);
    renderHistory();
    closeDrawer();
    $("input")?.focus({ preventScroll: true });
    updateComposerState();
  });

  $("historySearch")?.addEventListener("input", renderHistory);

  $("composer")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    sendMessage($("input")?.value || "");
  });

  const input = $("input");
  input?.addEventListener("input", () => {
    autoResize();
    updateCharCount();
    updateComposerState();
  });
  input?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      if (!state.busy) sendMessage(input.value);
      else toast("Önce süren yanıtı durdurun.", "error");
    }
  });

  $("stopBtn")?.addEventListener("click", () => abortCurrent());

  $("boardSelect")?.addEventListener("change", (ev) => {
    state.settings.board = ev.target.value;
    persistSettings();
    const label = ev.target.options[ev.target.selectedIndex]?.textContent || "otomatik";
    toast(`Hedef kart: ${label}`, "ok");
  });

  for (const btn of document.querySelectorAll(".suggestion")) {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt") || "";
      if (!prompt) return;
      const field = $("input");
      if (field) { field.value = prompt; autoResize(); updateCharCount(); }
      sendMessage(prompt);
    });
  }

  // Diyaloglar
  for (const btn of document.querySelectorAll("[data-close]")) {
    btn.addEventListener("click", () => {
      const dialog = $(btn.getAttribute("data-close"));
      if (dialog?.id === "confirmDialog") settleConfirm(false);
      else dialogClose(dialog);
    });
  }
  for (const dialog of document.querySelectorAll("dialog.dialog")) {
    dialog.addEventListener("click", (ev) => {
      if (ev.target !== dialog) return;
      if (dialog.id === "confirmDialog") settleConfirm(false);
      else dialogClose(dialog);
    });
    dialog.addEventListener("close", () => {
      if (dialog.id === "confirmDialog" && state.confirmResolver) {
        const resolver = state.confirmResolver;
        state.confirmResolver = null;
        resolver(false);
      }
    });
  }

  $("confirmOk")?.addEventListener("click", () => settleConfirm(true));
  $("confirmCancel")?.addEventListener("click", () => settleConfirm(false));

  $("settingsBtn")?.addEventListener("click", openSettings);
  $("sidebarSettingsBtn")?.addEventListener("click", openSettings);
  $("settingsModelBtn")?.addEventListener("click", () => {
    const settings = $("settingsDialog");
    if (settings?.open) dialogClose(settings);
    setTimeout(openModelDialog, 30);
  });
  $("modelChip")?.addEventListener("click", openModelDialog);
  $("sidebarModelBtn")?.addEventListener("click", openModelDialog);

  $("themeSelect")?.addEventListener("change", (ev) => {
    state.settings.theme = ev.target.value;
    persistSettings();
    applyTheme();
  });
  $("motionToggle")?.addEventListener("change", (ev) => {
    state.settings.reducedMotion = ev.target.checked;
    persistSettings();
    applyMotion();
  });

  $("exportBtn")?.addEventListener("click", exportSessions);
  $("clearHistoryBtn")?.addEventListener("click", clearHistory);

  $("modelReloadBtn")?.addEventListener("click", () => {
    if (!state.worker || state.workerFailed) {
      toast("Yerel ajan çalışmıyor; model indirilemiyor.", "error");
      return;
    }
    state.modelReloadRequested = true;
    state.model = {
      status: "loading",
      progress: { stage: "start", label: "Model yeniden indiriliyor", percent: 0 },
      info: state.model.info,
      error: null,
    };
    renderModelState();
    state.worker.postMessage({ type: "reload-model" });
  });

  $("modelClearBtn")?.addEventListener("click", async () => {
    if (!state.worker || state.workerFailed) return;
    const ok = await askConfirm({
      title: "Model önbelleği silinsin mi?",
      text: "İndirilmiş 5K modeli, doğrulama kaydı ve bellek içindeki model kaldırılır. " +
        "Sohbet geçmişiniz silinmez. Model tekrar indirilene kadar 5K ipucu gösterilmez.",
      okLabel: "Modeli temizle",
    });
    if (!ok) return;
    state.worker.postMessage({ type: "clear-model" });
  });

  $("modelTestBtn")?.addEventListener("click", runModelTest);
  $("modelTestInput")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); runModelTest(); }
  });

  $("scrollBottomBtn")?.addEventListener("click", () => scrollToBottom(true));
  $("chatScroll")?.addEventListener("scroll", updateScrollButton, { passive: true });

  $("noticeClose")?.addEventListener("click", hideNotice);
  $("reloadBtn")?.addEventListener("click", applyUpdate);
  $("dismissUpdateBtn")?.addEventListener("click", () => {
    const banner = $("updateBanner");
    if (banner) banner.hidden = true;
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && drawerOpen()) {
      closeDrawer();
      $("menuBtn")?.focus({ preventScroll: true });
    }
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.shiftKey && ev.key.toLowerCase() === "n") {
      ev.preventDefault();
      $("newChatBtn")?.click();
    }
  });

  const scheme = window.matchMedia("(prefers-color-scheme: light)");
  const onSchemeChange = () => { if (state.settings.theme === "system") applyTheme(); };
  if (scheme.addEventListener) scheme.addEventListener("change", onSchemeChange);
  else if (scheme.addListener) scheme.addListener(onSchemeChange);

}

function updateScrollButton() {
  const btn = $("scrollBottomBtn");
  if (!btn) return;
  const session = state.sessions.find((s) => s.id === state.currentId);
  const has = !!session && session.messages.length > 0;
  btn.hidden = !has || isNearBottom();
}

function autoResize() {
  const input = $("input");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 190)}px`;
}

function updateCharCount() {
  const input = $("input");
  const node = $("charCount");
  if (!input || !node) return;
  const len = input.value.length;
  node.textContent = len ? `${formatNumber(len)} / ${formatNumber(MAX_INPUT)}` : "";
  node.classList.toggle("near", len > MAX_INPUT * 0.92);
}

function openSettings() {
  syncSettingsForm();
  renderCapabilities();
  refreshStorageInfo();
  setText("settingsModelState", state.model.status === "ready"
    ? `Hazır · ${formatNumber(state.model.info?.params)} parametre`
    : state.model.status === "loading" ? "Yükleniyor…"
      : state.model.status === "error" ? "Kullanılamıyor" : "Yüklenmedi");
  setText("settingsModelParams", state.model.info?.params
    ? formatNumber(state.model.info.params) : "—");
  setText("aboutVersion", APP_VERSION);
  dialogOpen($("settingsDialog"));
}

function openModelDialog() {
  renderModelState();
  renderCapabilities();
  dialogOpen($("modelDialog"));
}

/* --------------------------------------------------------------------------
   Başlangıç
   -------------------------------------------------------------------------- */

async function init() {
  setText("aboutVersion", APP_VERSION);
  loadSettings();
  applyTheme();
  applyMotion();
  syncSettingsForm();

  await initStorage();

  // URL'deki #sohbet kimliği yok; son oturum ayardan gelir.
  renderChat(true);
  renderHistory();
  updateNetworkStatus();
  renderCapabilities();
  refreshStorageInfo();
  updateCharCount();
  autoResize();
  bindEvents();
  updateComposerState();

  startWorker();
  registerServiceWorker();

  // Masaüstünde yazmaya hazır başla; dokunmatik cihazda klavyeyi kendiliğinden açma.
  const input = $("input");
  if (input && window.matchMedia("(pointer: fine)").matches) {
    input.focus({ preventScroll: true });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error("AwuGöktürk başlatılamadı", err);
    const messages = $("messages");
    if (messages) {
      messages.replaceChildren(el("p", "error-text",
        "Uygulama başlatılırken beklenmeyen bir hata oluştu: " + (err.message || err)));
    }
    showNotice("Uygulama başlatılamadı: " + (err.message || err), "error", "init");
  });
});
