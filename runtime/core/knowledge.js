/* Doğrulanmış yerel bilgi kaynağı, modül/kütüphane kayıt defteri ve kimlik
 * metinleri — Python `chat_knowledge.py`, `knowledge_registry.py` ve
 * `agent.py::_CONCEPTS` portu. Bu katman model kullanmaz; uydurma yapmaz.
 */

import { norm } from "./util.js";
import { listBoards } from "./boards.js";

export { norm };

export const T_DIGITAL_OUT = "digital_out";
export const T_DIGITAL_IN = "digital_in";
export const T_ANALOG_IN = "analog_in";
export const T_PWM = "pwm";

export const FAM_AVR = new Set(["avr"]);
export const FAM_ESP = new Set(["esp32"]);
export const FAM_ALL = new Set(["avr", "esp32"]);

export const MODULES = new Map();

function defModule(m) { MODULES.set(m.key, m); return m; }

defModule({
  key: "led_on", name_tr: "LED yakma (sabit)", category: "digital", families: FAM_ALL,
  roles: { led: { role_type: T_DIGITAL_OUT, label_tr: "LED pini" } },
  params: {}, libraries: [], descr: "Belirtilen dijital pini surekli HIGH yapar.",
});
defModule({
  key: "led_off", name_tr: "LED sondurme (sabit)", category: "digital", families: FAM_ALL,
  roles: { led: { role_type: T_DIGITAL_OUT, label_tr: "LED pini" } },
  params: {}, libraries: [], descr: "Belirtilen dijital pini surekli LOW yapar.",
});
defModule({
  key: "led_blink", name_tr: "LED yakip sondurme (blink)", category: "digital", families: FAM_ALL,
  roles: { led: { role_type: T_DIGITAL_OUT, label_tr: "LED pini" } },
  params: { interval_ms: { name: "interval_ms", label_tr: "Yanip sonme araligi", kind: "int", required: false, default: 500, unit: "ms" } },
  libraries: [], descr: "LED'i verilen araliklarla yakip sondurur.",
});
defModule({
  key: "button_led", name_tr: "Buton ile LED kontrolu (debounce)", category: "digital", families: FAM_ALL,
  roles: {
    button: { role_type: T_DIGITAL_IN, label_tr: "Buton pini" },
    led: { role_type: T_DIGITAL_OUT, label_tr: "LED pini" },
  },
  params: { debounce_ms: { name: "debounce_ms", label_tr: "Debounce suresi", kind: "int", required: false, default: 50, unit: "ms" } },
  libraries: [], descr: "Butona basildiginda LED'i yakar (yazilimsal debounce ile).",
});
defModule({
  key: "two_buttons_two_leds", name_tr: "Iki buton ile iki LED", category: "digital", families: FAM_ALL,
  roles: {
    button1: { role_type: T_DIGITAL_IN, label_tr: "1. buton pini" },
    button2: { role_type: T_DIGITAL_IN, label_tr: "2. buton pini" },
    led1: { role_type: T_DIGITAL_OUT, label_tr: "1. LED pini" },
    led2: { role_type: T_DIGITAL_OUT, label_tr: "2. LED pini" },
  },
  params: { debounce_ms: { name: "debounce_ms", label_tr: "Debounce suresi", kind: "int", required: false, default: 50, unit: "ms" } },
  libraries: [], descr: "Her buton kendi LED'ini kontrol eder.",
});
defModule({
  key: "two_leds", name_tr: "Iki LED yakma (sabit)", category: "digital", families: FAM_ALL,
  roles: {
    led1: { role_type: T_DIGITAL_OUT, label_tr: "1. LED pini" },
    led2: { role_type: T_DIGITAL_OUT, label_tr: "2. LED pini" },
  },
  params: {}, libraries: [], descr: "Iki LED'i surekli yakar.",
});
defModule({
  key: "analog_read_serial", name_tr: "Analog okuma -> seri port", category: "analog", families: FAM_ALL,
  roles: { pot: { role_type: T_ANALOG_IN, label_tr: "Analog giris pini" } },
  params: {
    baud: { name: "baud", label_tr: "Seri hiz", kind: "int", required: false, default: 9600, unit: "bps" },
    interval_ms: { name: "interval_ms", label_tr: "Okuma araligi", kind: "int", required: false, default: 200, unit: "ms" },
  },
  libraries: [], descr: "Analog girişi okuyup seri porta yazdirir.",
});
defModule({
  key: "pwm_fade", name_tr: "PWM ile parlaklik (fade)", category: "pwm", families: FAM_ALL,
  roles: { pwm_led: { role_type: T_PWM, label_tr: "PWM pini" } },
  params: { step: { name: "step", label_tr: "Adim", kind: "int", required: false, default: 5, unit: "" } },
  libraries: [], descr: "PWM pininde parlakligi kademeli artirip azaltir.",
});
defModule({
  key: "pwm_write", name_tr: "PWM degeri yazma", category: "pwm", families: FAM_ALL,
  roles: { pwm_led: { role_type: T_PWM, label_tr: "PWM pini" } },
  params: { value: { name: "value", label_tr: "PWM degeri", kind: "int", required: true, default: null, unit: "0-255 (ESP32 LEDC 0-255)" } },
  libraries: [], descr: "PWM pinine sabit bir gorev dongusu degeri yazar.",
});
defModule({
  key: "servo_sweep", name_tr: "Servo motor supurme", category: "motor", families: FAM_ALL,
  roles: { servo: { role_type: T_PWM, label_tr: "Servo sinyal pini" } },
  params: {
    min_angle: { name: "min_angle", label_tr: "Alt aci", kind: "int", required: false, default: 0, unit: "derece" },
    max_angle: { name: "max_angle", label_tr: "Ust aci", kind: "int", required: false, default: 180, unit: "derece" },
    step_delay: { name: "step_delay", label_tr: "Adim gecikmesi", kind: "int", required: false, default: 15, unit: "ms" },
  },
  libraries: ["Servo"], descr: "Servo motoru 0-180 derece arasinda supurur.",
});
defModule({
  key: "ultrasonic_distance", name_tr: "HC-SR04 ultrasonik mesafe", category: "sensor", families: FAM_ALL,
  roles: {
    trig: { role_type: T_DIGITAL_OUT, label_tr: "TRIG pini" },
    echo: { role_type: T_DIGITAL_IN, label_tr: "ECHO pini" },
  },
  params: { interval_ms: { name: "interval_ms", label_tr: "Olcum araligi", kind: "int", required: false, default: 200, unit: "ms" } },
  libraries: [], descr: "HC-SR04 ile mesafe olcup seri porta yazdirir (pulseIn).",
});
defModule({
  key: "buzzer_tone", name_tr: "Buzzer ile ton uretme", category: "sound", families: FAM_ALL,
  roles: { buzzer: { role_type: T_DIGITAL_OUT, label_tr: "Buzzer pini" } },
  params: { freq: { name: "freq", label_tr: "Frekans", kind: "int", required: false, default: 1000, unit: "Hz" } },
  libraries: [], descr: "Buzzer'da tone() ile ses uretir.",
});
defModule({
  key: "dht_read", name_tr: "DHT11/DHT22 sicaklik-nem", category: "sensor", families: FAM_ALL,
  roles: { dht: { role_type: T_DIGITAL_IN, label_tr: "DHT veri pini" } },
  params: {
    sensor_type: { name: "sensor_type", label_tr: "Sensor tipi", kind: "str", required: false, default: "DHT11", unit: "" },
    interval_ms: { name: "interval_ms", label_tr: "Olcum araligi", kind: "int", required: false, default: 2000, unit: "ms" },
  },
  libraries: ["DHT"], descr: "DHT sensorunden sicaklik ve nem okur.",
});
defModule({
  key: "lcd_i2c_print", name_tr: "I2C LCD metin yazdirma", category: "display", families: FAM_ALL,
  roles: {},
  params: {
    address: { name: "address", label_tr: "I2C adresi", kind: "str", required: false, default: "0x27", unit: "" },
    cols: { name: "cols", label_tr: "Sutun", kind: "int", required: false, default: 16, unit: "" },
    rows: { name: "rows", label_tr: "Satir", kind: "int", required: false, default: 2, unit: "" },
    text: { name: "text", label_tr: "Yazilacak metin", kind: "str", required: false, default: "Merhaba", unit: "" },
  },
  libraries: ["Wire", "LiquidCrystal_I2C"], descr: "I2C LCD'ye metin yazdirir.",
});
defModule({
  key: "i2c_scan", name_tr: "I2C tarayici", category: "protocol", families: FAM_ALL,
  roles: {}, params: {}, libraries: ["Wire"], descr: "I2C hattindaki cihazlari tarar.",
});
defModule({
  key: "wifi_connect", name_tr: "Wi-Fi baglantisi (ESP32)", category: "network", families: FAM_ESP,
  roles: {},
  params: {
    ssid: { name: "ssid", label_tr: "Ag adi (SSID)", kind: "str", required: true, default: null, unit: "" },
    password: { name: "password", label_tr: "Sifre", kind: "str", required: true, default: null, unit: "" },
  },
  libraries: ["WiFi"], descr: "ESP32'yi bir Wi-Fi agina baglar.",
});
defModule({
  key: "wifi_http_get", name_tr: "HTTP GET istegi (ESP32)", category: "network", families: FAM_ESP,
  roles: {},
  params: {
    url: { name: "url", label_tr: "Istek URL'i", kind: "str", required: true, default: null, unit: "" },
    interval_ms: { name: "interval_ms", label_tr: "Istek araligi", kind: "int", required: false, default: 10000, unit: "ms" },
  },
  libraries: ["WiFi", "HTTPClient"], descr: "ESP32 ile bir URL'e HTTP GET istegi yapar.",
});

export const LIBRARIES = {
  Servo: {
    headers: ["Servo.h"], families: ["avr", "esp32"],
    api: ["Servo", "attach", "write", "writeMicroseconds", "detach", "read"],
    notes: "ESP32'de Servo kutuphanesi vardir ancak ayni anda cok servo LEDC kanali kullanir; pin secimi dikkatli yapilmalidir.",
  },
  DHT: {
    headers: ["DHT.h"], families: ["avr", "esp32"],
    api: ["DHT", "begin", "readTemperature", "readHumidity"], notes: "",
  },
  Wire: {
    headers: ["Wire.h"], families: ["avr", "esp32"],
    api: ["Wire", "begin", "beginTransmission", "endTransmission", "requestFrom", "write", "read", "available"],
    notes: "",
  },
  SPI: { headers: ["SPI.h"], families: ["avr", "esp32"], api: ["SPI", "begin"], notes: "" },
  EEPROM: {
    headers: ["EEPROM.h"], families: ["avr"], api: ["EEPROM", "read", "write"],
    notes: "Sadece AVR kartlarda dahili EEPROM kutuphanesi boyle adlandirilir.",
  },
  LiquidCrystal_I2C: {
    headers: ["LiquidCrystal_I2C.h", "Wire.h"], families: ["avr", "esp32"],
    api: ["LiquidCrystal_I2C", "init", "backlight", "setCursor", "print", "clear"], notes: "",
  },
  WiFi: {
    headers: ["WiFi.h"], families: ["esp32"],
    api: ["WiFi", "begin", "status", "localIP", "WL_CONNECTED"],
    notes: "Yalnizca ESP32. Uno/Mega icin Wi-Fi kalkan (shield) gerekir; desteklenmiyor.",
  },
  HTTPClient: {
    headers: ["HTTPClient.h", "WiFi.h"], families: ["esp32"],
    api: ["HTTPClient", "begin", "GET", "POST", "getString", "end", "addHeader"],
    notes: "Yalnizca ESP32.",
  },
};

export function getModule(key) { return MODULES.get(key) || null; }
export function moduleKeys() { return [...MODULES.keys()]; }
export function libraryInfo(name) { return LIBRARIES[name] || null; }

export function supportMatrix() {
  const rows = [];
  for (const b of listBoards()) {
    for (const [key, mod] of MODULES) {
      const ok = mod.families.has(b.family);
      const libOk = mod.libraries.every((l) => b.supportsLibrary(l));
      rows.push({
        board: b.display_name, module: key, name: mod.name_tr,
        supported: !!(ok && libOk),
        reason: ok && libOk ? null : (!ok ? "kart ailesi desteklenmiyor" : "kutuphane uyumsuz"),
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------------- */
/* Doğrulanmış kavramlar                                                     */
/* ------------------------------------------------------------------------- */

export const TOPICS = [
  {
    key: "cpu", title: "Islemci (CPU)",
    keywords: ["cpu", "islemci", "mikroislemci", "merkezi islem birimi"],
    answer: "İşlemci (CPU – Merkezî İşlem Birimi), bir bilgisayarın komutları yürüten ana " +
      "birimidir. Çalışması kısaca şu döngüye dayanır: komutu bellekten getirir " +
      "(fetch), çözümler (decode) ve yürütür (execute); sonucu gerekirse yazmaçlara ya " +
      "da belleğe yazar. Saat frekansı (örneğin 3 GHz) saniyedeki çevrim sayısını, " +
      "çekirdek sayısı ise aynı anda yürütülebilen bağımsız iş akışı sayısını belirtir. " +
      "Arduino/ESP32 gibi gömülü sistemlerde de benzer bir işlemci çekirdeği bulunur " +
      "(Uno/Mega'da AVR, klasik ESP32'de Xtensa); ancak bellek ve saat hızı çok daha " +
      "küçüktür.",
    related: ["RAM", "işletim sistemi"],
  },
  {
    key: "ram", title: "Bellek (RAM)",
    keywords: ["ram", "rastgele erisimli bellek", "ana bellek", "gecici bellek"],
    answer: "RAM (Rastgele Erişimli Bellek), işlemcinin çalışma sırasında geçici olarak veri " +
      "ve program tuttuğu hızlı bellektir. Uçucudur: güç kesildiğinde içeriği silinir. " +
      "Kalıcı veri için disk/SSD (ya da Arduino'da EEPROM/flash) kullanılır. RAM " +
      "büyüklüğü, aynı anda çalıştırılabilecek program ve veri miktarını sınırlar. " +
      "Örneğin Arduino Uno'da yalnızca 2 KB SRAM vardır; bu yüzden büyük dizilerden ve " +
      "String birleştirmelerden kaçınılmalıdır.",
    related: ["CPU", "işletim sistemi"],
  },
  {
    key: "gpu", title: "Grafik islemci (GPU)",
    keywords: ["gpu", "ekran karti", "grafik islemci", "grafik birimi"],
    answer: "GPU (Grafik İşlem Birimi / ekran kartı), görüntü ve matris işlemlerini çok " +
      "sayıda küçük çekirdekle aynı anda (paralel) yapan birimdir. CPU az sayıda güçlü " +
      "çekirdekle sıralı işlere, GPU ise binlerce basit çekirdekle paralel işlere " +
      "uygundur. Bu nedenle görüntü işleme ve yapay zekâ gibi yoğun hesaplarda tercih " +
      "edilir. Arduino/ESP32 sınıfı kartlarda ayrı GPU bulunmaz.",
    related: ["CPU", "RAM"],
  },
  {
    key: "os", title: "Isletim sistemi",
    keywords: ["isletim sistemi", "operating system", "windows", "linux", "macos", "isletim"],
    answer: "İşletim sistemi (OS), donanım ile uygulamalar arasında aracı olan yazılımdır. " +
      "İşlemci zamanını (süreç/zamanlama), belleği, dosyaları ve çevre birimlerini " +
      "(sürücüler aracılığıyla) yönetir. Örnekler: Windows, Linux, macOS. " +
      "Arduino/ESP32 gibi kartlarda genellikle tam bir işletim sistemi yoktur; kod " +
      "doğrudan donanım üzerinde (bare-metal) ya da FreeRTOS gibi hafif bir çekirdekle " +
      "çalışır.",
    related: ["CPU", "RAM"],
  },
  {
    key: "arduino_vs_esp32", title: "Arduino ve ESP32 farki",
    keywords: ["arduino ve esp32", "arduino ile esp32", "esp32 ve arduino",
      "arduino-esp32", "arduino ile esp32 arasindaki fark"],
    answer: "Arduino ve ESP32 farklı sınıflardır. Arduino Uno R3 (ATmega328P) 8 bit, 16 MHz, " +
      "yaklaşık 2 KB SRAM ve 14 dijital / 6 analog girişe sahiptir; dahili Wi-Fi veya " +
      "Bluetooth yoktur. Arduino Mega 2560 (ATmega2560) daha çok pin ve bellek sunar. " +
      "Klasik ESP32 ise 32 bit çift çekirdeklidir, çok daha yüksek hızda çalışır ve " +
      "dahili Wi-Fi + Bluetooth içerir; lojik seviyesi 3,3 V'tur. Kısaca: basit " +
      "giriş/çıkış işleri için Uno/Mega yeterlidir; ağ (Wi-Fi/BLE) veya daha fazla " +
      "işlem gücü gerektiğinde klasik ESP32 uygundur. Pin numaraları ve gerilim " +
      "seviyeleri kartlar arasında farklıdır.",
    related: ["dijital giriş/çıkış", "ADC", "PWM"],
  },
  {
    key: "digital_io", title: "Dijital giris/cikis",
    keywords: ["dijital giris/cikis", "dijital giris-cikis", "dijital giris cikis",
      "dijital giris", "dijital cikis", "dijital sinyal", "dijital pin"],
    answer: "Dijital giriş/çıkış, bir pinin iki durumundan (LOW = 0 veya HIGH = 1) yararlanır. " +
      "Çıkış olarak kullanıldığında pin, bağlı elemana gerilim uygular (örneğin LED " +
      "yakmak için HIGH). Giriş olarak kullanıldığında pin, dışarıdan gelen 0/1 " +
      "seviyesini okur (örneğin buton). Arduino'da yön `pinMode(pin, OUTPUT / INPUT / " +
      "INPUT_PULLUP)` ile belirlenir; `digitalWrite` yazar, `digitalRead` okur.",
    related: ["ADC", "PWM"],
  },
  {
    key: "adc", title: "ADC (Analog-Dijital Cevirici)",
    keywords: ["adc", "analog-dijital", "analog dijital cevirici", "analog okuma",
      "analogread", "analog giris"],
    answer: "ADC (Analog-Dijital Çevirici), sürekli bir analog gerilimi sayısal bir değere " +
      "dönüştürür. Arduino Uno'da `analogRead` 0–1023 arası (10 bit) değer verir ve " +
      "genelde 0–5 V ölçülür; klasik ESP32'de ise 0–4095 (12 bit) ve referans gerilimi " +
      "yaklaşık 3,3 V'tur. Örnek: 5 V referansta ölçülen 2,5 V, Uno'da yaklaşık 512 " +
      "değerine karşılık gelir. Bazı ESP32 pinleri yalnızca giriş (input-only) olarak " +
      "kullanılabilir.",
    related: ["dijital giriş/çıkış", "PWM"],
  },
  {
    key: "pwm", title: "PWM (Darbe Genisligi Modulasyonu)",
    keywords: ["pwm", "darbe genisligi", "analogwrite", "parlaklik kontrolu"],
    answer: "PWM (Darbe Genişliği Modülasyonu), bir dijital çıkışı çok hızlı açıp kapatarak " +
      "ortalama gerilimi ayarlar. Görev döngüsü (duty cycle) arttıkça ortalama gerilim, " +
      "dolayısıyla LED parlaklığı veya motor hızı artar. AVR tabanlı Arduino'larda " +
      "`analogWrite` 0–255 arası değer alır ve yalnızca PWM destekli pinlerde çalışır " +
      "(Uno: 3, 5, 6, 9, 10, 11). Klasik ESP32'de PWM, LEDC donanımıyla " +
      "(`ledcSetup`/`ledcWrite`) üretilir ve neredeyse tüm çıkış pinlerinde " +
      "kullanılabilir.",
    related: ["ADC", "dijital giriş/çıkış"],
  },
  {
    key: "i2c", title: "I2C",
    keywords: ["i2c", "twi", "sda", "scl"],
    answer: "I2C, iki hatlı (SDA = veri, SCL = saat) senkron seri haberleşme protokolüdür. " +
      "Aynı hatta bir ana (master) ve birden çok köle (slave) cihaz bağlanabilir; her " +
      "cihazın 7 bitlik bir adresi vardır. Az kablo gerektirir, hızı görece düşüktür " +
      "(tipik 100–400 kbit/s). Arduino Uno'da SDA = A4, SCL = A5; Mega 2560'ta SDA = 20, " +
      "SCL = 21'dir. LCD, RTC ve birçok sensör I2C kullanır.",
    related: ["SPI", "UART"],
  },
  {
    key: "spi", title: "SPI",
    keywords: ["spi", "miso", "mosi", "sck", "ss hatti"],
    answer: "SPI, dört hatlı (SCK = saat, MOSI = ana→köle, MISO = köle→ana, SS/CS = seçim) " +
      "senkron seri protokolüdür. I2C'ye göre daha hızlıdır ve tam çift yönlüdür; ancak " +
      "her köle için ayrı bir SS hattı gerekir. Ekranlar, SD kartlar ve yüksek hızlı " +
      "sensörlerde sık kullanılır.",
    related: ["I2C", "UART"],
  },
  {
    key: "uart", title: "UART",
    keywords: ["uart", "seri haberlesme", "seri port", "seri iletisim", "baud"],
    answer: "UART, iki hatlı (TX = gönderim, RX = alım) asenkron seri haberleşmedir. Ortak " +
      "bir saat hattı yoktur; iki taraf önceden aynı baud hızını (örneğin 9600 veya " +
      "115200) kullanmalıdır. Arduino'da bilgisayarla haberleşme `Serial` (UART0) " +
      "üzerinden yapılır; Mega 2560 ek olarak Serial1/2/3, klasik ESP32 ise Serial ve " +
      "Serial2 sunar.",
    related: ["I2C", "SPI"],
  },
  {
    key: "http_server_client", title: "HTTP sunucusu ve istemcisi farki",
    keywords: ["http sunucu", "http istemci", "http server", "http client",
      "sunucu ile istemci", "istemci ile sunucu", "sunucu ve istemci"],
    answer: "HTTP'de istemci (client) ve sunucu (server) iki ayrı roldür. İstemci, isteği " +
      "başlatan taraftır: bir adrese (URL) bağlanıp GET/POST isteği gönderir ve dönen " +
      "yanıtı okur. Sunucu ise gelen istekleri bekleyen, karşılayan ve yanıt üreten " +
      "taraftır: belirli bir portu dinler (örneğin 80) ve istek yoluna göre cevap " +
      "döner. Klasik ESP32'de istemci için `HTTPClient` (http.begin + http.GET), sunucu " +
      "için `WebServer` sınıfı kullanılır. Yani 'sunucudan veri çekmek' ile 'sunucu " +
      "oluşturmak' birbirinden farklı işlerdir ve aynı kodla yapılmaz. Önemli not: bu " +
      "ajan şu anda ESP32 için HTTP **istemcisi** kodu üretir; HTTP **sunucusu** " +
      "(WebServer) modülü desteklenmemektedir.",
    related: ["UART", "Arduino ve ESP32 farkı"],
  },
  {
    key: "math", title: "Temel matematik",
    keywords: ["matematik", "ortalama", "yuzde", "oran", "denklem", "karekok", "us alma"],
    answer: "Temel matematik kavramları: **ortalama**, bir değer kümesinin toplamının eleman " +
      "sayısına bölümüdür: (a + b + … + n) / n. **Yüzde**, bir oranı 100 üzerinden " +
      "ifade eder; bir sayının %20'si, o sayının 0,20 ile çarpımıdır. **Denklem** " +
      "çözmede amaç bilinmeyeni yalnız bırakmaktır (örneğin 2x + 3 = 11 → x = 4). " +
      "Gömülü sistemlerde ADC ortalama alma, ölçekleme (0–1023 → 0–255 gibi) ve oran " +
      "hesapları sık kullanılır.",
    related: ["fizik"],
  },
  {
    key: "physics", title: "Temel fizik / elektrik",
    keywords: ["fizik", "ohm", "gerilim", "akim", "direnc", "guc", "volt", "amper", "watt",
      "kirchhoff"],
    answer: "Temel elektrik bağıntıları: **Ohm yasası** V = I × R (gerilim = akım × direnç). " +
      "**Güç** P = V × I (birimi watt). Seri bağlı dirençler toplanır " +
      "(R_toplam = R1 + R2 + …); paralel bağlı dirençlerde 1/R_toplam = 1/R1 + 1/R2 + … . " +
      "Örnek: 5 V kaynağa 220 Ω direnç bağlanırsa I = V / R = 5 / 220 ≈ 0,023 A " +
      "(23 mA) olur. LED'lerde akımı sınırlamak için seri direnç kullanılır.",
    related: ["matematik", "ADC"],
  },
];

export function lookupTopic(text) {
  const n = norm(text);
  let best = null;
  let bestScore = 0;
  for (const t of TOPICS) {
    const hits = t.keywords.filter((k) => n.includes(k));
    if (!hits.length) continue;
    const score = hits.reduce((s, k) => s + k.length, 0);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

export function topicKeys() { return TOPICS.map((t) => t.key); }

export const FACTS = [
  { key: "capital_tr", keywords: [["turkiye", "baskent"], ["turkiye", "neresi"], ["ankara"]], answer: "Türkiye'nin başkenti **Ankara**'dır." },
  { key: "capital_fr", keywords: [["fransa", "baskent"], ["fransa", "neresi"], ["paris"]], answer: "Fransa'nın başkenti **Paris**'tir." },
  { key: "capital_de", keywords: [["almanya", "baskent"], ["almanya", "neresi"], ["berlin"]], answer: "Almanya'nın başkenti **Berlin**'dir." },
  { key: "capital_jp", keywords: [["japonya", "baskent"], ["japonya", "neresi"], ["tokyo"]], answer: "Japonya'nın başkenti **Tokyo**'dur." },
  { key: "capital_it", keywords: [["italya", "baskent"], ["italya", "neresi"], ["roma"]], answer: "İtalya'nın başkenti **Roma**'dır." },
  { key: "capital_es", keywords: [["ispanya", "baskent"], ["ispanya", "neresi"], ["madrid"]], answer: "İspanya'nın başkenti **Madrid**'tir." },
  { key: "capital_uk", keywords: [["ingiltere", "baskent"], ["birlesik krallik", "baskent"], ["londra"]], answer: "Birleşik Krallık'ın başkenti **Londra**'dır." },
  { key: "capital_us", keywords: [["abd", "baskent"], ["amerika birlesik devletleri", "baskent"], ["washington"]], answer: "ABD'nin başkenti **Washington, D.C.**'dir." },
  { key: "capital_ru", keywords: [["rusya", "baskent"], ["rusya", "neresi"], ["moskova"]], answer: "Rusya'nın başkenti **Moskova**'dır." },
  { key: "capital_gr", keywords: [["yunanistan", "baskent"], ["atina"]], answer: "Yunanistan'ın başkenti **Atina**'dır." },
  { key: "ocean_largest", keywords: [["en buyuk okyanus"], ["buyuk okyanus"]], answer: "Dünya'nın en büyük okyanusu **Pasifik Okyanusu**'dur." },
  { key: "mountain_highest", keywords: [["en yuksek dag"], ["everest"]], answer: "Dünya'nın en yüksek dağı **Everest**'tir (8.848 m)." },
];

export function lookupFact(text) {
  const n = norm(text);
  for (const f of FACTS) {
    for (const group of f.keywords) {
      if (group.every((w) => n.includes(w))) return f;
    }
  }
  return null;
}

const NAME_CORE_RE = /[^a-z0-9]+/g;
const NAME_ONLY_RE = /^(awu\s*)?gokturk(\s+embedded)?(\s+agent)?$/;

export function isNameOnly(text) {
  const core = norm(text).replace(NAME_CORE_RE, " ").trim().split(/\s+/).filter(Boolean).join(" ");
  return !!core && NAME_ONLY_RE.test(core);
}

export const CREATIVE_DISCLAIMER = "Not: Bu, yaratıcı yazarlık için hazırlanmış kısa ve **sabit** bir örnektir. " +
  "Genel amaçlı bir dil modeli değilim; bu yüzden istek üzerine sınırsız/yeni " +
  "hikâye üretemem.";

const SCIFI_STORY = "2140 yılında Mars'taki toz fırtınaları dinmeye başladığında teknisyen Elif, " +
  "istasyonun eski iletişim panelinde beklenmedik bir sinyal yakaladı. Sinyal, " +
  "yörüngedeki terk edilmiş bir uydudan geliyordu ve içinde yalnızca üç kelime " +
  "vardı: \"Geri dönmeyin.\" Elif mesajı Dünya'ya iletti; ancak gelen cevap, aynı üç " +
  "kelimeyi yineliyordu. O gece istasyonun penceresinden bakan ekip, gökyüzünde " +
  "yeni bir yıldız gibi parlayan ve yavaşça yaklaşan bir cismi fark etti.";

const TALE_STORY = "Küçük bir kasabada, her sabah şehrin saat kulesini kuran yaşlı bir saatçi " +
  "yaşardı. Bir gün kurmayı unuttu ve kasaba, zamanın yavaş aktığı tuhaf bir güne " +
  "uyandı. İnsanlar acele etmeyi bıraktıkça birbirlerini dinlemeye başladı; akşam " +
  "olduğunda saatçi kuleyi yeniden kurdu. Kasaba o günü \"dinleme günü\" olarak " +
  "hatırladı.";

export function creativeAnswer(text) {
  const n = norm(text);
  const scifi = ["bilim kurgu", "bilimkurgu", "uzay", "robot", "gelecek", "sci-fi", "scifi"]
    .some((w) => n.includes(w));
  const story = scifi ? SCIFI_STORY : TALE_STORY;
  return [story + "\n\n" + CREATIVE_DISCLAIMER, scifi ? "bilim_kurgu" : "masal"];
}

export const IDENTITY_NAME = "AwuGöktürk";
export const MODEL_NAME = "AwuGöktürk-Microcontroller:5K";
export const SUPPORTED_BOARDS = "Arduino Uno R3, Arduino Mega 2560 ve klasik ESP32";

export function identityAnswer(subtype = "who") {
  if (subtype === "name") {
    return "Ben " + IDENTITY_NAME + " adlı gömülü sistem yardımcısıyım. " + SUPPORTED_BOARDS +
      " için kod üretebilir, mevcut kodu inceleyebilir ve temel " +
      "bilgisayar/elektronik kavramlarını Türkçe açıklayabilirim. Kullandığım model " +
      MODEL_NAME + "'dir (yaklaşık 5.000 parametreli, yalnızca Arduino Uno için " +
      "görev-türü ipucu veren küçük bir sınıflandırıcı); genel amaçlı bir dil modeli " +
      "değildir. Size nasıl yardımcı olabilirim?";
  }
  if (subtype === "capabilities") {
    return "Şunları yapabilirim: (1) Arduino Uno R3, Arduino Mega 2560 ve klasik ESP32 " +
      "için desteklenen gömülü kodları üretmek (dijital giriş/çıkış, buton ve " +
      "debounce, analog/ADC, PWM, servo, ultrasonik mesafe, buzzer, DHT, I2C LCD, " +
      "I2C tarama; klasik ESP32'de ayrıca Wi-Fi ve HTTP istemcisi). (2) Verdiğiniz " +
      "kodu inceleyip pin çakışması gibi sorunları bulmak. (3) Eksik bilgide size " +
      "soru sormak ve desteklenmeyen istekleri gerekçesiyle reddetmek. (4) CPU, RAM, " +
      "GPU, işletim sistemi, ADC, PWM, I2C/SPI/UART ve temel matematik/fizik gibi " +
      "konuları Türkçe açıklamak. Kod istediğinizde hedef kartı belirtmeniz yeterli; " +
      "sohbet veya kavram sorusunda kart şart değil.";
  }
  if (subtype === "role") {
    return "Görevim gömülü sistem kodlamasına yardımcı olmak: " + SUPPORTED_BOARDS +
      " için doğru pin ve kütüphane bilgisiyle kod üretmek, mevcut kodu incelemek, " +
      "gereksinimleri netleştirmek ve desteklenmeyen istekleri dürüstçe reddetmek. " +
      "Genel amaçlı bir sohbet ya da her konuda bilgi veren bir model değilim.";
  }
  if (subtype === "honesty") {
    return "Bilmediğim veya doğrulayamadığım bir konuda cevap uydurmam. \"Bilmiyorsan " +
      "bile cevap vermeye çalış\" gibi bir istek, doğruluk kuralımı gevşetmez: " +
      "uydurma bir bilgi üretmek yerine bilmediğimi söylerim. Emin olmadığımda " +
      "kapsamımı belirtir ve gerekirse konuyu netleştirmenizi isterim. Örneğin " +
      "tanımadığım bir sensör için var olmayan bir kütüphane adı üretmem; bunun " +
      "yerine veri sayfasını ya da kullandığı kütüphaneyi sorarım. Ayrıca yüksek " +
      "doğruluk iddiasında bulunmam; ürettiğim kodun gerçek donanımda ayrıca test " +
      "edilmesi gerekir.";
  }
  return "Ben " + IDENTITY_NAME + " adlı gömülü sistem yardımcısıyım (model: " + MODEL_NAME +
    "). Görevim " + SUPPORTED_BOARDS + " için desteklenen gömülü kodları üretmek ve " +
    "incelemek, gereksinimleri netleştirmek ve desteklenmeyen donanım/işlev " +
    "bileşimlerini açıkça reddetmek. Genel amaçlı bir sohbet modeli değilim: kapsamım " +
    "dışındaki bir konuda bilgi uydurmak yerine sınırımı söylerim. Örneğin 'Arduino " +
    "Uno'da 7. pin'deki LED'i yak.' gibi bir isteği koda dönüştürebilirim.";
}

export function conceptMissMessage() {
  return "Bu konu için doğrulanmış bir açıklamam yok; bu yüzden emin olmadığım bir bilgiyi " +
    "uydurmak istemiyorum. Kapsamım: temel bilgisayar konuları (CPU, RAM, GPU, " +
    "işletim sistemi), Arduino ile ESP32 farkları, dijital giriş/çıkış, ADC, PWM, " +
    "I2C/SPI/UART, HTTP sunucusu ile istemcisi farkı ve temel matematik/fizik. " +
    "Konuyu bu başlıklardan birine göre netleştirir misiniz?";
}

export function unsupportedMessage() {
  return "Bu isteği güvenilir biçimde yanıtlayamıyorum ve emin olmadığım bir bilgi " +
    "üretmek istemiyorum. Kapsamım: gömülü kodlama (" + SUPPORTED_BOARDS + "), " +
    "temel bilgisayar/elektronik kavramları ve sınırlı sayıda doğrulanmış genel " +
    "bilgi. Bunların dışındaki konularda cevap uydurmam.";
}

export const CONCEPTS = {
  pinmode: "pinMode(pin, mod): Bir pinin giris (INPUT/INPUT_PULLUP) mi cikis (OUTPUT) " +
    "mi olacagini belirler. Ornek: pinMode(13, OUTPUT);",
  digitalwrite: "digitalWrite(pin, deger): Dijital cikisa HIGH (lojik 1) veya LOW yazar.",
  digitalread: "digitalRead(pin): Dijital giris durumunu HIGH/LOW olarak okur.",
  analogread: "analogRead(pin): ADC ile analog giris okur. AVR'de 0-1023 (10 bit), " +
    "ESP32'de 0-4095 (12 bit).",
  analogwrite: "analogWrite(pin, deger): PWM uretir (AVR'de 0-255). Yalnizca PWM " +
    "destekli pinlerde calisir (Uno: 3,5,6,9,10,11).",
  pwm: "PWM, dijital cikista darbe genisligi modulasyonu ile ortalama gerilim " +
    "uretir; LED parlakligi ve motor hizi icin kullanilir.",
  i2c: "I2C, SDA/SCL iki hatli senkron seri protokoldur. Uno: A4/A5, Mega: 20/21, " +
    "ESP32: varsayilan 21/22.",
  spi: "SPI, SCK/MOSI/MISO/SS hatlariyla hizli senkron haberlesme saglar.",
  uart: "UART, TX/RX ile asenkron seri haberlesme saglar. Uno: Serial; Mega ek " +
    "Serial1-3; ESP32: Serial, Serial2.",
  debounce: "Debounce, mekanik buton titremesini yazilimsal/temporal filtreleyerek " +
    "tek kararlı okuma saglar.",
  interrupt: "Kesme (interrupt), bir olayda ISR fonksiyonunu tetikler. Uno: pin 2/3.",
  adc: "ADC, analog gerilimi sayisal degere cevirir. Cozunurluk karta gore degisir.",
  millis: "millis(), programin baslangicindan beri gecen milisaniyeyi dondurur; " +
    "delay()'den farkli olarak bloklamaz (blink without delay).",
  servo: "Servo motor, PWM benzeri sinyalle aci kontrolu saglar (Servo kutuphanesi).",
  dht: "DHT11/DHT22, tek tel ile sicaklik ve nem olcen sensorlerdir (DHT kutuphanesi).",
  wifi: "Wi-Fi yalnizca ESP32'de dahilidir. Uno/Mega icin Wi-Fi kalkan gerekir ve " +
    "bu sistem kalkanlari desteklemez.",
};
