// Безопасная обёртка над localStorage (в приватном режиме хранилище может быть недоступно).
const PREFIX = 'cuniverse.';
const mem = new Map();

export const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? (mem.has(key) ? mem.get(key) : def) : JSON.parse(v);
    } catch { return mem.has(key) ? mem.get(key) : def; }
  },
  set(key, value) {
    mem.set(key, value);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* недоступно */ }
  },
};
