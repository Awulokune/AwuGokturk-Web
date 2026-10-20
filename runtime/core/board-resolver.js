/* Board Resolver — Python `board_resolver.py` portu. */

import { getBoard } from "./boards.js";
import { norm } from "./util.js";

const ESP_VARIANTS = {
  s2: "ESP32-S2", s3: "ESP32-S3", c3: "ESP32-C3", c2: "ESP32-C2",
  c6: "ESP32-C6", h2: "ESP32-H2", s1: "ESP32-S1", p4: "ESP32-P4",
};

export function resolve(text, needBoard) {
  const n = norm(text);
  const notes = [];
  const assumed = [];

  if (n.includes("esp8266") || n.includes("d1 mini")) {
    return {
      board: null, key: null, framework: null, needs_board: true,
      unsupported: "ESP8266 desteklenmiyor. Desteklenen kartlar: Arduino Uno, Arduino Mega 2560, klasik ESP32.",
      question: null, assumed: null, notes: null,
    };
  }
  if (n.includes("rp2040") || n.includes("pico")) {
    return {
      board: null, key: null, framework: null, needs_board: true,
      unsupported: "RP2040/Pico su an kapsam disi (mimari genisletilebilir, ancak profil eklenmedi).",
      question: null, assumed: null, notes: null,
    };
  }
  if (n.includes("esp-idf") || n.includes("esp idf")) {
    return {
      board: null, key: null, framework: null, needs_board: true,
      unsupported: "ESP-IDF framework'u ilk asamada desteklenmiyor; yalnizca Arduino-ESP32 desteklenir.",
      question: null, assumed: null, notes: null,
    };
  }

  if (n.includes("esp32")) {
    const vm = /esp32[\s-]*(s2|s3|c3|c2|c6|h2|s1|p4)\b/.exec(n);
    if (vm) {
      const v = ESP_VARIANTS[vm[1]] || vm[1].toUpperCase();
      return {
        board: null, key: null, framework: null, needs_board: true,
        unsupported: `${v} varyanti desteklenmiyor; su an yalnizca KLASIK ESP32 ` +
          "(ESP32-D0WD/WROOM-32) profili var. Lutfen klasik ESP32 ile devam edin " +
          "veya varyant GPIO/ADC/PWM bilgilerini paylasin.",
        question: null, assumed: null, notes: null,
      };
    }
    const board = getBoard("esp32");
    assumed.push("Kart/varyant belirtilmedi: KLASIK ESP32 (ESP32-D0WD/WROOM-32) varsayildi. " +
      "Farkli bir varyant (S2/S3/C3) ise belirtin.");
    return {
      board, key: board.key, framework: "arduino-esp32", needs_board: false,
      question: null, assumed, notes, unsupported: null,
    };
  }

  if (n.includes("mega") || n.includes("2560")) {
    const board = getBoard("arduino_mega2560");
    return {
      board, key: board.key, framework: "arduino", needs_board: false,
      question: null, assumed, notes, unsupported: null,
    };
  }
  if (n.includes("uno")) {
    const board = getBoard("arduino_uno");
    return {
      board, key: board.key, framework: "arduino", needs_board: false,
      question: null, assumed, notes, unsupported: null,
    };
  }
  if (n.includes("arduino")) {
    return {
      board: null, key: null, framework: null, needs_board: true,
      question: "Hangi Arduino kartini hedefliyorsunuz? (Arduino Uno R3 / Arduino Mega 2560). " +
        "Pinler ve donanim ozellikleri karta gore degisir.",
      assumed: null, notes: null, unsupported: null,
    };
  }
  if (needBoard) {
    return {
      board: null, key: null, framework: null, needs_board: true,
      question: "Hedef karti belirtir misiniz? Desteklenen kartlar: Arduino Uno R3, " +
        "Arduino Mega 2560, klasik ESP32. Pin/GPIO ve donanim gereksinimleri karta gore belirlenir.",
      assumed: null, notes: null, unsupported: null,
    };
  }
  return {
    board: null, key: null, framework: null, needs_board: false,
    question: null, assumed, notes, unsupported: null,
  };
}
