// localStorage that never throws (private windows, blocked storage): falls back to memory.

const memory = new Map();

function raw(op, key, value) {
  try {
    if (op === "get") return window.localStorage.getItem(key);
    if (op === "set") return window.localStorage.setItem(key, value);
    if (op === "del") return window.localStorage.removeItem(key);
  } catch {
    if (op === "get") return memory.has(key) ? memory.get(key) : null;
    if (op === "set") return memory.set(key, value);
    if (op === "del") return memory.delete(key);
  }
  return null;
}

export const storage = {
  get: (k) => raw("get", k),
  set: (k, v) => raw("set", k, v),
  remove: (k) => raw("del", k),
  getJSON(k, fallback) {
    try { return JSON.parse(raw("get", k)) ?? fallback; } catch { return fallback; }
  },
  setJSON: (k, v) => raw("set", k, JSON.stringify(v)),
};
