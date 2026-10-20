/* Test Generator — Python `test_generator.py` portu. Öneri/plan üretir;
 * gerçek donanım testi iddiası taşımaz. */

export function buildTests() {
  return [{
    type: "build", tool: "tarayıcı statik ön kontrol",
    expect: "yapısal ön kontrol hatasız",
    note: "gerçek AVR/ESP32 derlemesi değil",
  }];
}

export function logicTests(board, actions) {
  const tests = [];
  for (const a of actions) {
    const key = a.module;
    if (key === "led_blink") {
      const iv = a.params.interval_ms ?? 500;
      tests.push({ type: "logic", module: key, expect: `LED ${iv} ms yanar, ${iv} ms soner (dongu).` });
    } else if (key === "led_on") tests.push({ type: "logic", module: key, expect: "LED surekli yanar." });
    else if (key === "led_off") tests.push({ type: "logic", module: key, expect: "LED surekli soner." });
    else if (key === "button_led") tests.push({ type: "logic", module: key, expect: "Butona basinca LED yanar; birakinca soner (debounce)." });
    else if (key === "two_buttons_two_leds") tests.push({ type: "logic", module: key, expect: "Her buton yalnizca kendi LED'ini etkiler." });
    else if (key === "analog_read_serial") tests.push({ type: "logic", module: key, expect: "Seri monitorde analog deger gorunur (AVR 0-1023 / ESP32 0-4095)." });
    else if (key === "pwm_fade" || key === "pwm_write") tests.push({ type: "logic", module: key, expect: "PWM cikisi 0-255 araliginda degisir/ sabittir." });
    else if (key === "servo_sweep") tests.push({ type: "logic", module: key, expect: "Servo belirtilen aci araliginda supurur." });
    else if (key === "ultrasonic_distance") tests.push({ type: "logic", module: key, expect: "Mesafe seri monitorde cm cinsinden gorunur; engel yaklasinca azalir." });
    else if (key === "buzzer_tone") tests.push({ type: "logic", module: key, expect: "Buzzer'dan ton duyulur." });
    else if (key === "dht_read") tests.push({ type: "logic", module: key, expect: "Sicaklik ve nem seri monitorde gorunur." });
    else if (key === "wifi_connect") tests.push({ type: "logic", module: key, expect: "Wi-Fi baglanir; IP adresi seri monitorde gorunur." });
    else if (key === "wifi_http_get") tests.push({ type: "logic", module: key, expect: "HTTP kodu ve govde seri monitorde gorunur." });
    else if (key === "i2c_scan") tests.push({ type: "logic", module: key, expect: "Bagli I2C cihaz adresleri listelenir." });
  }
  return tests;
}

export function hardwarePlan(board, actions) {
  const steps = [`Hedef kart: ${board.display_name} (${board.mcu}), lojik ${Number(board.voltage).toFixed(1)} V.`];
  if (board.family === "esp32") {
    steps.push("ESP32 3,3V'tur; 5V cikisli sensorler icin gerilim bolucu/seviye cevirici kullanin.");
  }
  steps.push("Baglantilari guc KAPALI iken yapin; kutup ve GND ortakligini kontrol edin.");
  for (const a of actions) {
    if (a.module === "ultrasonic_distance") steps.push("HC-SR04 VCC=5V; ECHO'yu ESP32'de bolucu ile 3,3V'a indirin.");
    if (a.module === "servo_sweep") steps.push("Servo beslemesini harici 5V'tan verin (akim yuksek); GND ortak.");
    if (a.module === "lcd_i2c_print" || a.module === "i2c_scan") steps.push("I2C hatlarinda 4,7k pull-up oldugundan emin olun.");
  }
  steps.push("Yukleme sonrasi seri monitoru dogru hizda acin ve beklenen davranisi gozleyin.");
  steps.push("NOT: Bu adimlar otomatik dogrulanmaz; gercek donanim testi kullaniciya aittir.");
  return steps;
}
