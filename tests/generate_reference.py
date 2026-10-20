#!/usr/bin/env python3
"""Android/Python sürümünden referans çıktı üretir (geliştirme aracı).

Kullanım:
    python3 tests/generate_reference.py /yol/AwuGokturk-Android

Bu betik yalnızca test fixture'ı üretir; web uygulaması çalışma zamanında
Python kullanmaz. Referanslar, iki uygulamanın aynı girdilere aynı yanıtı
verdiğini doğrulamak içindir. `build` alanı hariç tutulur (Python g++ ile
host sözdizimi dener; tarayıcıda gerçek derleme yoktur).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ANDROID = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path("../AwuGokturk-Android")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ANDROID))

from awa_agent import classifier5k, classifier5k_lite  # noqa: E402
from awa_agent.agent import AwuGokturkAgent  # noqa: E402

MODEL = ROOT / "runtime" / "model" / "classifier5k.json"
classifier5k_lite.set_model_path(str(MODEL))
classifier5k.reset()

CASES = [
    # sohbet / kimlik / bilgi
    ("Merhaba", None),
    ("Merhaba AwuGöktürk! Bugün nasılsın?", None),
    ("Sen kimsin?", None),
    ("Neler yapabilirsin?", None),
    ("Görevin ne?", None),
    ("AwuGöktürk", None),
    ("AwuGöktürk Embedded Agent", None),
    ("Bilmiyorsan bile cevap vermeye çalış.", None),
    ("Teşekkürler", None),
    ("Görüşürüz", None),
    ("Bana basit bir bilim kurgu hikâyesi anlat.", None),
    ("Bana bir masal anlat.", None),
    ("Fransa'nın başkenti neresi?", None),
    ("Türkiye'nin başkenti neresi?", None),
    ("Zürafaların ortalama ömrü kaç yıldır?", None),
    ("CPU nedir?", None),
    ("RAM nedir, açıklar mısın?", None),
    ("Bilgisayar işlemcisi nasıl çalışır?", None),
    ("Bir ESP32'de HTTP sunucusu ile HTTP istemcisi arasındaki fark nedir?", None),
    ("Kuantum dolanıklık nedir?", None),
    ("pinMode nedir?", None),
    ("Bugün nasılsın?", None),
    # kod üretimi
    ("Arduino Uno'da 7. pindeki LED'i yak.", None),
    ("Arduino Uno'da pin 7'de LED'i 5 saniyede bir yakıp söndür.", None),
    ("Arduino Uno'da pin 7'de LED'i 500 ms aralıkla yakıp söndür.", None),
    ("Arduino Uno'da 7. pindeki LED'i 1 saniye aralıkla yakıp söndür.", None),
    ("Arduino Uno'da pin 14'te LED yak.", None),
    ("Arduino Uno'da A0 pinindeki potansiyometre değerini seri monitöre yazdır.", None),
    ("Arduino Mega'da iki butonla iki LED'i kontrol et.", None),
    ("ESP32'de GPIO 18'deki LED'i 500 ms aralıklarla yakıp söndür.", None),
    ("Arduino Uno'da 10. pinde servo motoru süpür.", None),
    ("Arduino Uno'da 7. pinde analogWrite ile PWM ver.", None),
    ("Arduino Uno'da -1 numaralı pindeki LED'i yak.", None),
    ("Arduino Uno'da 20 numaralı pindeki LED'i yak.", None),
    ("A0 pinindeki potansiyometre değerini seri monitöre yazdır.", None),
    ("Arduino Uno'da Wi-Fi kullanarak internete bağlan.", None),
    ("Arduino Mega'da Wi-Fi ile HTTP isteği yap.", None),
    ("Esp8266 icin LED blink yaz.", None),
    ("ESP32-S3'te GPIO 5'teki LED'i yak.", None),
    ("Bilinmeyen bir sensörü oku.", None),
    ("Arduino Uno'da kuantum bilgisayar modülü kullan.", None),
    ("Arduino Uno'da makine öğrenmesi modeli eğit.", None),
    ("Klasik ESP32 ve Arduino framework kullanıyorum. Wi-Fi üzerinden HTTP sunucusu oluştur.", None),
    ("Klasik ESP32 kullanıyorum. SSID TEST_WIFI ve şifre TEST_PASSWORD ile Wi-Fi'ye bağlanıp https://example.com adresine HTTP GET isteği yap.", None),
    ("ESP32'de Wi-Fi HTTP GET isteği yap.", None),
    ("Arduino Uno kullanıyorum. Wi-Fi ağına bağlanıp HTTP sunucusu oluştur. Kartı değiştirme.", None),
    ("Arduino Uno'da DHT11 sıcaklık nem sensöründen değer oku.", None),
    ("Arduino Uno'da I2C tara.", None),
    ("Arduino Uno'da 16x2 I2C LCD'ye 'Merhaba' yaz.", None),
    ("Arduino Uno'da buzzer ile 1000 Hz ton üret.", None),
    ("Arduino Uno'da HC-SR04 ile mesafe ölç.", None),
    ("Arduino Uno'da 7 ve 8 numaralı pinlerde iki LED'i yak.", None),
    ("LED'i yak.", None),
    # debug / transform
    ("Bu kodda pin çakışması var mı?", None),
    ("Arduino Uno'da bu kodda pin çakışması var mı?\n```\nvoid setup(){ pinMode(7, OUTPUT); digitalRead(7); }\n```", None),
    ("Arduino Uno'da bu kodu incele:\nvoid setup(){ pinMode(7, OUTPUT); pinMode(7, INPUT); }\nvoid loop(){}", None),
]

# ham sınıflandırıcı referansı
CLF_TEXTS = [
    "Arduino Uno'da 7. pindeki LED'i yak.",
    "CPU nedir?",
    "kodumda hata var, nasıl düzeltirim?",
    "pinMode(13, OUTPUT); digitalWrite(13, HIGH);",
    "RAM nedir, açıklar mısın?",
    "Uno'da 7. pindeki LED'i yak",
]

agent = AwuGokturkAgent(use_classifier=True)


def to_dict(r):
    return {
        "status": r.status,
        "category": __import__("awa_agent.intent_router", fromlist=["x"]).category_for(r.intent) if r.intent else None,
        "intent": r.intent,
        "message": r.message,
        "board": r.board,
        "framework": r.framework,
        "code": r.code,
        "modules": list(r.modules),
        "libraries": list(r.libraries),
        "wiring": list(r.wiring),
        "assumptions": list(r.assumptions),
        "guard": [{"level": lvl, "message": msg} for lvl, msg in r.guard],
        "tests": list(r.tests),
        "hardware_plan": list(r.hardware_plan),
        "questions": list(r.questions),
        "notes": list(r.notes),
        "classifier_hint": r.classifier_hint,
        "model_name": "AwuGöktürk-Microcontroller:5K",
    }


clf = classifier5k.get_classifier()
out = {
    "source": "AwuGokturk-Android (Python) — gerçek çalıştırma",
    "model": str(MODEL.relative_to(ROOT)),
    "classifier": {
        "available": bool(clf.available),
        "params": clf.param_count(),
        "predictions": {
            t: {"label": clf.predict(t).label, "probs": clf.predict(t).probs}
            for t in CLF_TEXTS
        },
    },
    "cases": [{"text": t, "board_hint": b, "response": to_dict(agent.handle(t, b))}
             for t, b in CASES],
}

dest = ROOT / "tests" / "fixtures" / "python_reference.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{len(CASES)} senaryo yazıldı -> {dest}")
