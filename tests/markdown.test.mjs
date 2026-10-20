import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, renderPlain, escapeHtml } from "../runtime/markdown.js";

test("ham HTML daima kaçırılır", () => {
  const out = renderMarkdown('<script>alert("x")</script><img src=x onerror=alert(1)>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /<img/i);
  assert.match(out, /&lt;script&gt;/);
  assert.match(out, /&lt;img/);
});

test("javascript: ve veri: bağlantıları bağlantıya dönüşmez", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>x</script>", "vbscript:msgbox(1)"]) {
    const out = renderMarkdown(`[tıkla](${url})`);
    assert.doesNotMatch(out, /href=/i, url);
    assert.doesNotMatch(out, /<a\s/i, url);
  }
});

test("yalnızca http/https bağlantıları güvenli rel ile üretilir", () => {
  const out = renderMarkdown("[örnek](https://example.com/yol?q=1)");
  assert.match(out, /<a href="https:\/\/example\.com\/yol\?q=1"/);
  assert.match(out, /rel="noopener noreferrer nofollow"/);
  assert.match(out, /target="_blank"/);
});

test("tırnak/boşluk içeren URL enjeksiyonu reddedilir", () => {
  const out = renderMarkdown('[x](https://example.com/" onmouseover="alert(1))');
  assert.doesNotMatch(out, /onmouseover="/i);
  assert.doesNotMatch(out, /href="[^"]*onmouseover/i);
  assert.match(out, /&quot;/);
});

test("kod blokları kaçırılır ve dil sınıfı güvenli", () => {
  const out = renderMarkdown("```js\nif (a < b) { console.log(\"</code>\"); }\n```");
  assert.match(out, /<pre class="md-code"><code class="language-js">/);
  assert.match(out, /if \(a &lt; b\)/);
  assert.doesNotMatch(out, /<\/code>\\n/);
  assert.doesNotMatch(out, /<script/i);
});

test("satır içi kod ve vurgu biçimlendirmesi", () => {
  const out = renderMarkdown("**kalın** ve *eğik* ve `x < y`");
  assert.match(out, /<strong>kalın<\/strong>/);
  assert.match(out, /<em>eğik<\/em>/);
  assert.match(out, /<code>x &lt; y<\/code>/);
});

test("satır sonları <br> olur, satır içi kod korunur", () => {
  const out = renderMarkdown("bir\niki `a b` üç");
  assert.match(out, /bir<br>iki/);
  assert.match(out, /<code>a b<\/code>/);
});

test("renderPlain kaçırır ve satır sonlarını korur", () => {
  assert.equal(renderPlain("<b>x</b>\ny"), "&lt;b&gt;x&lt;/b&gt;<br>y");
});

test("escapeHtml tüm zorunlu karakterleri kaçırır", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("boş ve null girdi güvenli", () => {
  assert.equal(renderMarkdown(null), "");
  assert.equal(renderPlain(undefined), "");
});
