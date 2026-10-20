/* Uygulama bilgisi / destek matrisi. */

import { listBoards } from "./boards.js";
import { MODULES, supportMatrix } from "./knowledge.js";
import { CAT_GREETING, CAT_IDENTITY, CAT_GENERAL_CHAT, CAT_CREATIVE,
  CAT_KNOWLEDGE, CAT_CONCEPT, CAT_EMBEDDED, CAT_UNSUPPORTED } from "./intent-router.js";
import { MODEL_NAME } from "./knowledge.js";

export const APP_NAME = "AwuGöktürk";
export const APP_VERSION = "1.0.0-web";
export const SLOGAN = "NO SAY CAVAS";

export function appInfo(classifierStatus = null) {
  return {
    app_name: APP_NAME,
    model_name: MODEL_NAME,
    slogan: SLOGAN,
    version: APP_VERSION,
    boards: listBoards().map((b) => ({
      key: b.key,
      name: b.display_name,
      family: b.family,
      mcu: b.mcu,
      voltage: b.voltage,
      digital_range: [b.digital_min, b.digital_max],
      pwm_pins: [...b.pwm_pins].sort((x, y) => x - y),
      analog_labels: Object.keys(b.analog_labels).sort(),
      features: [...b.features].sort(),
    })),
    modules: [...MODULES.values()].map((m) => ({
      key: m.key, name: m.name_tr, category: m.category,
      families: [...m.families].sort(), libraries: [...m.libraries],
    })),
    categories: [CAT_GREETING, CAT_IDENTITY, CAT_GENERAL_CHAT, CAT_CREATIVE,
      CAT_KNOWLEDGE, CAT_CONCEPT, CAT_EMBEDDED, CAT_UNSUPPORTED],
    classifier: classifierStatus,
    tools: {
      webassembly: typeof WebAssembly === "object",
      webgpu: typeof navigator !== "undefined" && !!navigator.gpu,
      indexeddb: typeof indexedDB !== "undefined",
      serviceworker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
      worker: typeof Worker !== "undefined",
      cachestorage: typeof caches !== "undefined",
    },
  };
}

export { supportMatrix };
