/* Güvenli, bağımlılıksız Markdown alt kümesi.
 * Önce tüm metin HTML'e kaçırılır; yalnızca aşağıdaki etiketler üretilir.
 * Ham HTML asla çalıştırılmaz. Bağlantılar yalnızca http/https olabilir.
 */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

function safeUrl(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return null;
  // Boşluk, kontrol karakteri ve tırnak içeren URL'leri reddet.
  if (/[\s"'<>`]/.test(u)) return null;
  return u;
}

function inline(escaped) {
  const codeSpans = [];
  let s = escaped.replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `\u0000C${codeSpans.length}\u0000`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });

  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
    const safe = safeUrl(url.replace(/&amp;/g, "&"));
    if (!safe) return whole;
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });

  // Otomatik bağlantı (yalnızca http/https)
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (whole, pre, url) => {
    const safe = safeUrl(url);
    if (!safe) return whole;
    return `${pre}<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });

  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  s = s.replace(/\n/g, "<br>");

  s = s.replace(/\u0000C(\d+)\u0000/g, (_, i) => codeSpans[Number(i)]);
  return s;
}

/**
 * Güvenli HTML üretir. Kod blokları `code` sınıfıyla, satır içi kod `<code>` ile.
 * @param {string} text
 * @returns {string}
 */
export function renderMarkdown(text) {
  const src = String(text ?? "");
  const fence = /```([A-Za-z0-9_+-]*)\r?\n([\s\S]*?)```/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = fence.exec(src)) !== null) {
    out += inline(escapeHtml(src.slice(last, m.index)));
    const lang = m[1] ? ` class="language-${escapeHtml(m[1])}"` : "";
    out += `<pre class="md-code"><code${lang}>${escapeHtml(m[2].replace(/\n$/, ""))}</code></pre>`;
    last = m.index + m[0].length;
  }
  out += inline(escapeHtml(src.slice(last)));
  return out;
}

/** Düz metni güvenli biçimde satır sonlarını koruyarak gösterir. */
export function renderPlain(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/** Kod bloğunu kopyalama düğmesiyle birlikte DOM düğümü olarak üretir. */
export function codeBlock(code, { language = "Arduino C++", label = null } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "code-block";
  const head = document.createElement("div");
  head.className = "code-head";
  const title = document.createElement("span");
  title.className = "code-lang";
  title.textContent = label || language;
  head.appendChild(title);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "code-copy";
  btn.textContent = "Kopyala";
  btn.setAttribute("aria-label", "Kodu panoya kopyala");
  btn.addEventListener("click", async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) throw new Error("copy failed");
      }
      btn.textContent = "Kopyalandı";
      btn.classList.add("copied");
      setTimeout(() => { btn.textContent = "Kopyala"; btn.classList.remove("copied"); }, 1600);
    } catch {
      btn.textContent = "Kopyalanamadı";
      setTimeout(() => { btn.textContent = "Kopyala"; }, 2200);
    }
  });
  head.appendChild(btn);
  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  wrap.appendChild(head);
  wrap.appendChild(pre);
  return wrap;
}
