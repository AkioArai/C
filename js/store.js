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

/** Подтверждение без системного диалога: первое нажатие «взводит» кнопку, второе — выполняет. */
export function confirmClick(btn, question = 'Нажмите ещё раз') {
  if (btn.dataset.armed) {
    clearTimeout(+btn.dataset.armed);
    delete btn.dataset.armed;
    btn.innerHTML = btn.dataset.label;
    return true;
  }
  btn.dataset.label = btn.innerHTML;
  btn.textContent = question;
  btn.dataset.armed = String(setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = btn.dataset.label; }, 3000));
  return false;
}
