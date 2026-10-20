/* AwuGöktürk-Web — ortak yardımcılar.
 * Python kaynağındaki davranışı birebir korumak için Türkçe normalizasyonu
 * (çğıöşü -> cgiosu) translate()+lower() sırasıyla uygular.
 */

const TR_MAP = {
  "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
  "Ç": "C", "Ğ": "G", "İ": "I", "Ö": "O", "Ş": "S", "Ü": "U",
  "â": "a", "Â": "A", "î": "i", "Î": "I", "û": "u", "Û": "U",
};

export function norm(text) {
  let out = "";
  for (const ch of String(text ?? "")) out += TR_MAP[ch] ?? ch;
  return out.toLowerCase();
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function uniq(list) {
  return [...new Set(list)];
}

export function round4(x) {
  return Math.round((x + Number.EPSILON) * 10000) / 10000;
}

export function pinEquals(a, b) {
  return !!a && !!b &&
    a.raw === b.raw && a.kind === b.kind &&
    a.number === b.number && a.channel === b.channel;
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
