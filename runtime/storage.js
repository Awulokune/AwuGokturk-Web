/* Yerel sohbet deposu: öncelik IndexedDB, mümkün değilse localStorage.
 * Hiçbir veri ağa gönderilmez. */

const DB_NAME = "awugokturk-web";
const DB_VERSION = 1;
const STORE = "sessions";
const LS_KEY = "awu.sessions.v1";
const LS_SETTINGS = "awu.settings.v1";

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB hatası"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB işlem hatası"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB işlemi iptal edildi"));
  });
}

class ChatStore {
  constructor() {
    this.backend = "unknown";
    this.db = null;
    this.memory = [];
  }

  async init() {
    try {
      if (!("indexedDB" in window)) throw new Error("IndexedDB yok");
      this.db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: "id" });
            os.createIndex("updatedAt", "updatedAt");
          }
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error("IndexedDB açılamadı"));
        r.onblocked = () => reject(new Error("IndexedDB başka sekmede kilitli"));
      });
      this.backend = "idb";
      this.memory = await this._idbList();
      return this.backend;
    } catch (err) {
      this.backend = "local";
      this.db = null;
      this.memory = this._localList();
      console.warn("AwuGöktürk: IndexedDB kullanılamıyor, localStorage'a geçildi.", err);
      return this.backend;
    }
  }

  async _idbList() {
    if (!this.db) return [];
    const tx = this.db.transaction(STORE, "readonly");
    const all = await req(tx.objectStore(STORE).getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  _localList() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  _localWrite(sessions) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(sessions.slice(0, 50)));
      return true;
    } catch {
      return false;
    }
  }

  async ready() {
    if (this.backend === "unknown") await this.init();
    return this.backend;
  }

  async listSessions() {
    await this.ready();
    if (this.backend === "idb") {
      this.memory = await this._idbList();
    } else {
      this.memory = this._localList();
    }
    return this.memory.map((s) => ({ ...s }));
  }

  async getSession(id) {
    await this.ready();
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(STORE, "readonly");
      const s = await req(tx.objectStore(STORE).get(id));
      return s ? { ...s } : null;
    }
    return this._localList().find((s) => s.id === id) || null;
  }

  async saveSession(session) {
    await this.ready();
    const copy = JSON.parse(JSON.stringify(session));
    if (this.backend === "idb" && this.db) {
      try {
        const tx = this.db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(copy);
        await txDone(tx);
        return { ok: true, backend: "idb" };
      } catch (err) {
        // IDB yazılamazsa veriyi kaybetmemek için yerel yedeğe geç.
        this.backend = "local";
        this.db = null;
        const list = this._localList().filter((s) => s.id !== copy.id);
        list.push(copy);
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        const ok = this._localWrite(list);
        return { ok, backend: "local", error: ok ? null : err.message };
      }
    }
    const list = this._localList().filter((s) => s.id !== copy.id);
    list.push(copy);
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const ok = this._localWrite(list);
    return { ok, backend: "local", error: ok ? null : "Yerel depolama dolu veya izin yok." };
  }

  async deleteSession(id) {
    await this.ready();
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      await txDone(tx);
      return true;
    }
    const list = this._localList().filter((s) => s.id !== id);
    return this._localWrite(list);
  }

  async clearAll() {
    await this.ready();
    if (this.backend === "idb" && this.db) {
      const tx = this.db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await txDone(tx);
      this.memory = [];
      return true;
    }
    return this._localWrite([]);
  }

  getSettings() {
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  setSettings(settings) {
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  async estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0 };
      }
    } catch { /* yok sayılır */ }
    return null;
  }
}

export const store = new ChatStore();

export function newId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
