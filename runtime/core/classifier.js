/* AwuGöktürk-Microcontroller:5K — saf JavaScript GRU çıkarımı.
 *
 * Model: Embedding(103 -> 8) -> GRU(8 -> 31) -> Linear(31 -> 8), 4.893 parametre.
 * Bu model YALNIZCA görev türü sınıflandırıcısıdır; metin ÜRETMEZ ve genel amaçlı
 * bir dil modeli değildir. Çıktı, kural tabanlı yönlendiriciye yalnızca ipucu verir.
 *
 * Python `classifier5k_lite.py` ile birebir aynı ileri hesabı uygular.
 */

import { round4 } from "./util.js";

export const LABEL_TO_INTENT = {
  hata_bulma: "debug",
  kavram_sorusu: "concept",
  arduino_dijital: "code_generation",
  arduino_analog: "code_generation",
  kod_cikti: "concept",
  sinif_uye_metot: "concept",
  bellek_isaretci: "concept",
  sinif_tanimlama: "concept",
};

function sigmoid(x) {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

function matvec(W, x) {
  const out = new Array(W.length);
  for (let i = 0; i < W.length; i++) {
    const row = W[i];
    let s = 0;
    for (let j = 0; j < row.length; j++) s += row[j] * x[j];
    out[i] = s;
  }
  return out;
}

export class LiteClassifier {
  constructor() {
    this.available = false;
    this.labels = [];
    this.vocab = [];
    this.params = 0;
    this.error = null;
    this.meta = null;
    this._data = null;
    this._stoi = new Map();
    this._unk = 4;
  }

  loadFromObject(data) {
    this.available = false;
    this.error = null;
    try {
      if (!data || typeof data !== "object") throw new Error("Model verisi nesne değil.");
      if (!Array.isArray(data.labels) || !Array.isArray(data.vocab)) {
        throw new Error("Model etiketleri/sözlüğü eksik.");
      }
      if (!data.config || !Array.isArray(data.emb) || !Array.isArray(data.gru_weight_ih) ||
          !Array.isArray(data.gru_weight_hh) || !Array.isArray(data.fc_weight)) {
        throw new Error("Model ağırlıkları eksik.");
      }
      const cfg = data.config;
      if (data.vocab.length !== cfg.vocab_size) throw new Error("Sözlük boyutu uyuşmuyor.");
      if (data.emb.length !== cfg.vocab_size) throw new Error("Embedding boyutu uyuşmuyor.");
      if (data.emb[0].length !== cfg.emb) throw new Error("Embedding genişliği uyuşmuyor.");
      if (data.gru_weight_ih.length !== 3 * cfg.hidden) throw new Error("GRU giriş ağırlığı uyuşmuyor.");
      if (data.gru_weight_hh[0].length !== cfg.hidden) throw new Error("GRU gizli ağırlığı uyuşmuyor.");
      if (data.fc_weight.length !== data.labels.length) throw new Error("Sınıflandırıcı çıkışı uyuşmuyor.");

      this._data = data;
      this.labels = [...data.labels];
      this.vocab = [...data.vocab];
      this._stoi = new Map(data.vocab.map((c, i) => [c, i]));
      this._unk = this._stoi.has("<unk>") ? this._stoi.get("<unk>") : 4;
      this.params = this._countParams(data);
      this.meta = {
        format: data.format || null,
        model_name: data.model_name || null,
        config: cfg,
        labels: this.labels,
      };
      this.available = true;
      return this;
    } catch (err) {
      this.available = false;
      this.error = err instanceof Error ? err.message : String(err);
      this._data = null;
      return this;
    }
  }

  _countParams(d) {
    let n = d.emb.length * d.emb[0].length;
    n += d.gru_weight_ih.length * d.gru_weight_ih[0].length;
    n += d.gru_weight_hh.length * d.gru_weight_hh[0].length;
    n += d.gru_bias_ih.length + d.gru_bias_hh.length;
    n += d.fc_weight.length * d.fc_weight[0].length;
    n += d.fc_bias.length;
    return n;
  }

  predict(text) {
    if (!this.available) {
      return {
        available: false, label: null, intent_hint: null, probs: null,
        note: this.error ? `5K modeli kullanılamıyor: ${this.error}` : "5K (lite) agirliklari bulunamadi.",
      };
    }
    const d = this._data;
    const H = Number(d.config.hidden);
    const emb = d.emb;
    const wIH = d.gru_weight_ih;
    const wHH = d.gru_weight_hh;
    const bIH = d.gru_bias_ih;
    const bHH = d.gru_bias_hh;

    const ids = [];
    for (const ch of String(text)) ids.push(this._stoi.has(ch) ? this._stoi.get(ch) : this._unk);
    if (!ids.length) ids.push(this._unk);

    let h = new Array(H).fill(0);
    for (const tid of ids) {
      const x = emb[tid];
      const gi = matvec(wIH, x);
      const gh = matvec(wHH, h);
      const nh = new Array(H);
      for (let i = 0; i < H; i++) {
        const r = sigmoid(gi[i] + bIH[i] + gh[i] + bHH[i]);
        const z = sigmoid(gi[H + i] + bIH[H + i] + gh[H + i] + bHH[H + i]);
        const n = Math.tanh(gi[2 * H + i] + bIH[2 * H + i] +
          r * (gh[2 * H + i] + bHH[2 * H + i]));
        nh[i] = (1 - z) * n + z * h[i];
      }
      h = nh;
    }

    const raw = matvec(d.fc_weight, h);
    const logits = raw.map((v, i) => v + d.fc_bias[i]);
    const mx = Math.max(...logits);
    const ex = logits.map((v) => Math.exp(v - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    const probs = ex.map((v) => v / sum);
    let k = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[k]) k = i;
    const label = this.labels[k];
    const probsObj = {};
    this.labels.forEach((lab, i) => { probsObj[lab] = round4(probs[i]); });
    return {
      available: true, label,
      intent_hint: LABEL_TO_INTENT[label] || "concept",
      probs: probsObj,
      note: "ipucu (kanit degil; JS lite cikarim)",
    };
  }

  paramCount() { return this.available ? this.params : 0; }

  /* Modeli bellekten kaldırır (önbellek temizliğinde kullanılır).
   * Tahmin yapılamaz duruma döner; sahte çıktı üretilmez. */
  reset() {
    this.available = false;
    this.labels = [];
    this.vocab = [];
    this.params = 0;
    this.error = null;
    this.meta = null;
    this._data = null;
    this._stoi = new Map();
    return this;
  }

  status() {
    return {
      available: this.available,
      params: this.paramCount(),
      labels: [...this.labels],
      error: this.error,
      meta: this.meta,
    };
  }
}
