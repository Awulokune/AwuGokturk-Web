# AwuGöktürk Web

**Sunucusuz, yerel, tarayıcıda çalışan gömülü sistem ajanı.**
Arduino Uno R3, Arduino Mega 2560 ve klasik ESP32 için kural tabanlı kod üretimi;
gerçek 4.893 parametreli 5K görev sınıflandırıcısı; sohbet geçmişi, PWA ve çevrimdışı çalışma.

> **NO SAY CAVAS.** Boş vaat yok: model gerçekten çalışır, çalışmadığında bunu söyler,
> üretilmeyen bir yanıtı üretilmiş gibi göstermez.

Bu proje, [`AwuGokturk-Android`](https://github.com/Awulokune/AwuGokturk-Android)
projesindeki yerel ajanın tarayıcı portudur. Android uygulamasındaki model ağırlıkları,
bilgi tabanı ve ajan boru hattı JavaScript'e taşınmıştır. Arka uç, API, hesap, API anahtarı
ve sunucu yoktur.

---

## 1. Ne çalışır, ne çalışmaz?

| Konu | Durum | Açıklama |
|---|---|---|
| HTML/CSS/JS arayüz | ✅ | GitHub Pages üzerinde statik olarak çalışır |
| 5K GRU sınıflandırıcı | ✅ | Tarayıcıda, Web Worker içinde, saf JavaScript ile gerçek çıkarım |
| Kural tabanlı ajan | ✅ | Intent router, gereksinim ayrıştırma, kart çözümleme, kod üretimi |
| Arduino/ESP32 kod üretimi | ✅ | Desteklenen modüller için şablon tabanlı, deterministik kod |
| AwuGuard denetimi | ✅ | Pin çakışması, PWM, gerilim ve kart uyumsuzluğu kontrolleri |
| Sohbet geçmişi | ✅ | IndexedDB; mümkün değilse localStorage yedeği |
| PWA / çevrimdışı | ✅ | Service Worker kabuğu + Cache Storage modeli |
| Güvenli Markdown | ✅ | Ham HTML çalıştırılmaz; yalnızca güvenli alt küme |
| **Genel amaçlı LLM sohbeti** | ❌ | Böyle bir model **yok**; 5K modeli yalnızca görev türü ipucu verir |
| **Gerçek AVR/ESP32 derlemesi** | ❌ | Tarayıcıda araç zinciri yok; yalnızca yapısal ön kontrol var |
| **Karta yükleme / seri port** | ❌ | Donanım erişimi yok; kullanıcı Arduino IDE'yi kullanır |
| **Donanım testi** | ❌ | Test planı ve beklenen davranış üretilir, fiziksel doğrulama yapılmaz |

**Önemli:** 5K modeli bir dil modeli değildir. Metin üretmez. Çıktısı yalnızca
`arduino_dijital`, `hata_bulma`, `kavram_sorusu` gibi bir görev etiketi ve olasılıklardır.
Kod ve sohbet yanıtları kural/şablon katmanından gelir. Modelin ipucu ile kural tabanı
çelişirse **kural tabanı kazanır**.

---

## 2. Gerçek model

| Alan | Değer |
|---|---|
| Ad | `AwuGöktürk-Microcontroller:5K` |
| Sürüm | `5K-1.0.0-web.1` |
| Mimari | `Embedding(103 → 8) → GRU(8 → 31) → Linear(31 → 8)` |
| Parametre | **4.893** |
| Girdi | Karakter düzeyinde sözlük (103 sembol) |
| Etiketler | `kod_cikti`, `kavram_sorusu`, `arduino_dijital`, `hata_bulma`, `sinif_uye_metot`, `arduino_analog`, `bellek_isaretci`, `sinif_tanimlama` |
| Dosya | `runtime/model/classifier5k.json` |
| Boyut | **99.663 bayt** (97,3 KB) |
| SHA-256 | `7e4346913c2aae4891495b6695d67d29e2eab3e8caa564d77b06e1be7990abc6` |
| Çalışma yeri | Web Worker, CPU, saf JavaScript |
| Lisans | GPL-3.0 (kaynak projeden) |

Model ilk açılışta **aynı kaynaktan** indirilir, boyutu ve SHA-256 özeti doğrulanır,
JSON yapısı ve parametre sayısı kontrol edilir; ancak bundan sonra Cache Storage'a yazılır.
Doğrulama başarısızsa dosya kullanılmaz ve önbelleğe alınmaz. Sonraki açılışlarda
model önbellekten okunur ve yine doğrulanır.

Modelin gerçek çıkarımı arayüzdeki **“Model testi”** bölümünden çalıştırılabilir.
Orada etiket ve tüm olasılıklar gösterilir; sahte bir yanıt üretilmez.

---

## 3. Mimari

```
index.html            Türkçe arayüz iskeleti
style.css             koyu/açık tema, masaüstü + mobil çekmece, erişilebilirlik
app.js                arayüz denetleyicisi; ağ API'si kullanmaz
sw.js                 Service Worker: uygulama kabuğu + çevrimdışı
manifest.json         PWA manifesti
assets/               logo ve PNG ikonlar

runtime/
  worker.js           Web Worker protokolü (init/message/predict/reload-model/clear-model)
  model-loader.js     aynı kaynaktan indirme, boyut + SHA-256 + parametre doğrulama
  model/              manifest + gerçek 5K model ağırlıkları
  markdown.js         güvenli Markdown alt kümesi + kod kopyalama
  storage.js          IndexedDB / localStorage sohbet deposu
  core/
    agent.js          ana boru hattı: router → kart → gereksinim → kod → AwuGuard
    classifier.js     GRU ileri hesabı (Python ile birebir)
    intent-router.js  kural tabanlı niyet yönlendirici
    requirement-parser.js
    board-resolver.js
    boards.js         Uno R3 / Mega 2560 / klasik ESP32 pin ve özellikleri
    code-generator.js modül kod şablonları
    awu-guard.js      güvenlik ve pin denetimleri
    test-generator.js önerilen testler + donanım planı
    knowledge.js      yerel, doğrulanmış bilgi kaynağı
    info.js           sürüm / yetenek bilgisi
    util.js

tests/                Node testleri + gerçek tarayıcı duman testi
```

### İstek akışı

```text
Kullanıcı metni
  → Intent Router (kural + 5K ipucu)
  → Board Resolver (Uno / Mega / ESP32)
  → Requirement Parser (modül, pin, süre, kütüphane)
  → Code Generator (şablon)
  → AwuGuard (pin/gerilim/PWM/uyumsuzluk)
  → statik ön kontrol (derleme DEĞİL)
  → test planı + donanım planı
  → güvenli Markdown yanıtı
```

---

## 4. Arayüz özellikleri

- Modern, koyu varsayılan, açık tema ve sistem teması.
- Masaüstünde kalıcı kenar çubuğu; mobilde erişilebilir çekmece.
- Sohbet oluşturma, arama, tek tek silme, tümünü silme, JSON dışa aktarma.
- Kalıcı sohbet geçmişi (IndexedDB; yedek olarak localStorage).
- Güvenli Markdown: başlık, liste, vurgu, bağlantı, kod; **ham HTML yok**.
- Kod blokları için kopyalama düğmesi ve panoya erişilemeyen ortamda yedek yol.
- Model durumu, indirme yüzdesi, boyut, SHA-256 ve gerçek çıkarım testi.
- Ağ çevrimiçi/çevrimdışı göstergesi ve dürüst hata bildirimleri.
- Hareketi azaltma, klavye kısayolları (`Enter`, `Shift+Enter`, `Ctrl/Cmd+Shift+N`),
  görünür odak halkaları, `aria-live` sohbet günlüğü, atlama bağlantısı.
- PWA kurulabilirlik, Service Worker güncelleme bildirimi ve çevrimdışı açılış.

---

## 5. Gizlilik ve güvenlik modeli

- **Arka uç yok.** Sunucu, API, veritabanı, hesap veya API anahtarı yoktur.
- **Analitik/çerez/reklam yok.**
- Kullanıcı mesajları hiçbir ağ isteğine eklenmez. `app.js` içinde `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource` veya `sendBeacon` yoktur.
- Tek ağ kullanımı, model manifesti ve model ağırlığının **aynı kaynaktan** indirilmesidir.
- CSP `connect-src 'self'` harici bağlantıları tarayıcı düzeyinde engeller.
  Model yükleyici ayrıca URL'nin aynı kaynakta olduğunu doğrular.
- Sohbetler yalnızca tarayıcı deposunda tutulur. Dışa aktarma yalnızca kullanıcı
  düğmeye bastığında, istemci tarafında dosya oluşturur.
- Model indirmesi ve Service Worker dışında ağ isteği yoktur. GitHub Pages/CDN
  sağlayıcısı yalnızca statik dosya isteklerini görür; mesaj içeriğini görmez.

**Sınırlar (dürüstçe):**

- GitHub Pages özel HTTP başlıklarına izin vermediği için CSP `<meta>` ile uygulanır.
  `frame-ancestors` meta üzerinden **uygulanmaz**; bu bilinen bir sınırdır. Mümkünse
  gerçek bir sunucuda `Content-Security-Policy` başlığı ve `frame-ancestors 'none'`
  kullanılmalıdır.
- Kötü niyetli bir tarayıcı eklentisi veya değiştirilmiş barındırma ortamı bu modeli
  aşabilir. Bu, tarayıcı tabanlı her uygulama için geçerlidir.
- Dış bağlantılar (Hakkında bölümündeki kaynak proje) yalnızca kullanıcı tıklamasıyla açılır.

---

## 6. Android projesinden aktarılanlar / aktarılmayanlar

### Aktarılan

- Python ajan boru hattının tamamı: intent router, requirement parser, board resolver,
  code generator, AwuGuard, test generator, knowledge.
- 5K sınıflandırıcı ve ağırlıkları; Python ile birebir çıkarım.
- Uno R3 / Mega 2560 / klasik ESP32 pin, PWM, analog ve gerilim kuralları.
- Desteklenen modül şablonları ve güvenlik kontrolleri.
- Türkçe, doğrulanmış bilgi kaynağı ve dürüst “bilmiyorum” davranışı.

### Aktarılmayan / farklı olan

- Android arayüzü ve Android'e özgü paylaşım/depolama: web arayüzü sıfırdan yazıldı.
- Python tarafındaki gerçek `g++`/AVR derleme denemesi: tarayıcıda araç zinciri yok.
  Yerine **yalnızca yapısal ön kontrol** (`js-static`) kondu. Bu bir derleme değildir.
- Karta yükleme, seri port, fiziksel donanım testi: tarayıcıdan yapılamaz.
- Android bildirimleri, dosya sistemi entegrasyonu, APK paketleme: kapsam dışı.
- Projede zaten var olmayan bir büyük dil modeli (WebLLM vb.) **eklenmedi**.
  Böyle bir model eklemek, “5K modeli gerçekten çalışıyor” iddiasını sulandırırdı;
  ayrıca hedef düşük donanımlı cihazlardır.

---

## 7. Yerel çalıştırma

ES modülleri, Service Worker ve CSP nedeniyle dosyayı çift tıklayarak açmayın.
Basit bir statik sunucu kullanın:

```bash
cd AwuGokturk-Web
python3 -m http.server 8080
# http://localhost:8080/
```

veya:

```bash
npm run serve
```

> `file://` ile açılışta tarayıcılar ES modüllerini ve Service Worker'ı engeller.
> HTTPS veya `localhost` gerekir. GitHub Pages HTTPS sağlar.

Node 20+ (testler için):

```bash
npm install
npm test              # 50 Node testi: ajan, parite, model, Markdown, statik güvenlik
npm run test:parity   # Python↔JS paritesi (56 senaryo)
npm run test:browser  # gerçek Chromium duman testi (playwright-core + Chromium gerekir)
```

Tarayıcı testi için Chromium/Chrome yolu:

```bash
CHROME_PATH=/usr/bin/chromium npm run test:browser
```

Chromium yoksa tarayıcı testi atlanır; diğer testler etkilenmez.

---

## 8. GitHub Pages dağıtımı

Depo kökü doğrudan yayınlanacak şekilde tasarlandı; derleme adımı yoktur.
Tüm yollar görecelidir, bu nedenle `https://kullanıcı.github.io/AwuGokturk-Web/`
alt yolunda da çalışır.

```bash
git init
git add .
git commit -m "AwuGöktürk Web: yerel, sunucusuz PWA"
gh repo create Awulokune/AwuGokturk-Web --public --source=. --remote=origin --push
```

Ardından GitHub'da:

1. **Settings → Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main` · **Folder:** `/ (root)`
4. Kaydet ve birkaç dakika bekle.

Yayın adresi:

```text
https://awulokune.github.io/AwuGokturk-Web/
```

`.nojekyll` dosyası Jekyll işlemeyi kapatır. Service Worker kapsamı `./` olduğu için
alt yolda da doğru çalışır.

Güncelleme yayınlarken `sw.js` içindeki `SHELL_CACHE` sürümünü artırın; aksi halde
eski kabuk önbelleği bir süre kullanılabilir. Uygulama yeni Service Worker'ı algılayınca
“Yeni bir sürüm hazır” bildirimi gösterir.

---

## 9. Testler ve doğrulama

Bu depoda çalıştırılan testler:

| Test | Sonuç |
|---|---|
| `node --test tests/*.test.mjs` | **50/50 geçti** |
| Python↔JS paritesi | **56 senaryo + 6 sınıflandırıcı örneği**, `build` alanı hariç birebir |
| Model doğrulama | 99.663 bayt, SHA-256 eşleşiyor, 4.893 parametre |
| Chromium duman testi | **Geçti** (aşağıdaki başlıklar) |
| Harici `fetch` denemesi | CSP tarafından **engellendi** |
| Çevrimdışı yeniden yükleme | Service Worker + model önbelleği ile **geçti** |
| Alt yol (`/AwuGokturk-Web/`) | **Geçti** |
| Mobil 390×844 | Yatay taşma yok, çekmece ve ayarlar çalışıyor |
| XSS | Kullanıcı metni HTML olarak çalışmadı |
| Dışa aktarma | Geçerli JSON indirildi |

Chromium testi şunları gerçekten yapar: alt yoldan yükleme, model indirme + SHA-256,
“Model testi”nde gerçek 5K çıkarımı, LED kodu üretimi, sohbetin yeniden yüklemede
korunması, modelin önbellekten doğrulanması, mobil düzen/çekmece, XSS denemesi,
JSON dışa aktarma, harici ağ engeli, çevrimdışı yeniden yükleme ve çevrimdışı mesaj.

Test ortamı: Linux, Node.js 22.14.0, Chromium 1248 (headless).

---

## 10. Bilinen sınırlar

- **Model bir sınıflandırıcıdır**, küçüktür ve hata yapabilir. Etiket olasılıkları
  “kanıt” değil, ipucudur. Kural tabanı her zaman önceliklidir.
- **Kod üretimi deterministik şablonlarla sınırlıdır.** Desteklenmeyen modüller,
  karmaşık projeler veya serbest biçimli yazılım mimarileri kapsam dışıdır.
- **Derleme yoktur.** `js-static` yalnızca parantez dengesi ve `setup`/`loop`
  varlığını kontrol eder; gerçek derleme ve donanım doğrulaması kullanıcıya aittir.
- **Kod çalıştırılmaz.** Tarayıcıda AVR/ESP32 emülatörü veya araç zinciri yoktur.
- **İlk açılışta internet gerekir.** Model bir kez indirildikten sonra çevrimdışı
  çalışabilir. Tarayıcı önbelleği temizlenirse yeniden indirme gerekir.
- **Depolama kotası** tarayıcıya bağlıdır. Gizli mod veya katı ayarlarda IndexedDB
  kullanılamazsa localStorage'a geçilir; bu yedek en fazla 50 sohbet tutar.
- **Arayüz Türkçedir.** Kod ve teknik terimler İngilizce olabilir.
- **GitHub Pages başlık kısıtı** nedeniyle `frame-ancestors` meta ile uygulanamaz.
- **Safari/iOS** sürümleri Service Worker, depolama ve PWA davranışında farklılık
  gösterebilir; test ortamı Chromium'dur.
- **Dışa aktarma** tarayıcının indirme davranışına bağlıdır; bazı mobil tarayıcılar
  `blob:` indirmeyi engelleyebilir.
- **Model testi** 500 karakterle sınırlıdır; sohbet mesajı 12.000 karaktere kadar
  kabul edilir.

---

## 11. Lisans ve atıf

- Bu depo: **GPL-3.0** (`LICENSE`).
- Model ağırlıkları ve ajan mantığı:
  [`Awulokune/AwuGokturk-Android`](https://github.com/Awulokune/AwuGokturk-Android),
  GPL-3.0.
- Model adı: `AwuGöktürk-Microcontroller:5K`.

Kaynak proje olmadan bu port mümkün olmazdı. Model ağırlıkları ve türetilmiş kod
aynı lisans altında paylaşılır.

---

## 12. Kısa SSS

**Bu bir ChatGPT/LLM mi?**
Hayır. 4.893 parametreli bir GRU görev sınıflandırıcısı ve kural tabanlı bir ajan var.
Metin üretimi modelden değil, yerel şablonlardan gelir.

**Mesajlarım sunucuya gidiyor mu?**
Hayır. `app.js` hiçbir ağ API'si kullanmaz. CSP harici bağlantıyı engeller. Yalnızca
model dosyası aynı kaynaktan indirilir.

**Neden gerçek derleme yok?**
Tarayıcıda AVR/ESP32 araç zinciri ve dosya sistemi yoktur. Derleme yapılmış gibi
göstermek yerine yalnızca dürüst bir yapısal ön kontrol sunulur.

**Model çalışmazsa ne olur?**
Sohbet ve kod üretimi kural tabanlı olarak devam eder. 5K ipucu gösterilmez;
“model hazır” denmez ve sahte olasılık üretilmez.

**Neden daha büyük bir model eklenmedi?**
Bu proje, mevcut Android ajanının gerçek davranışını port eder. Orada büyük bir dil
modeli yoktur. Sahte bir “LLM” katmanı eklemek mimariyi ve gizlilik iddialarını
bozardı. 5K modeli düşük donanımlı cihazlarda CPU'da çalışacak şekilde seçilmiştir.
