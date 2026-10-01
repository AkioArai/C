// Таймер фокуса (помодоро): 25 минут работы, 5 минут отдыха. Живёт в строке состояния.
import { store } from '../store.js';

const WORK = 25 * 60e3, REST = 5 * 60e3;
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class FocusTimer {
  constructor(el, toast) {
    this.el = el;
    this.toast = toast;
    this.st = store.get('focus', null); // { mode: 'work'|'rest', end, paused, left, done }
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-fx="stop"]')) { this.stop(); return; }
      if (!this.st) this.start('work');
      else if (this.st.paused) { this.st.end = Date.now() + this.st.left; this.st.paused = false; this.save(); }
      else { this.st.left = this.st.end - Date.now(); this.st.paused = true; this.save(); }
      this.render();
    });
    setInterval(() => this.tick(), 1000);
    this.render();
  }
  save() { store.set('focus', this.st); }
  start(mode) { this.st = { mode, end: Date.now() + (mode === 'work' ? WORK : REST), paused: false, done: this.st?.done || 0 }; this.save(); this.render(); }
  stop() { this.st = null; store.set('focus', null); this.render(); }
  tick() {
    if (!this.st || this.st.paused) return;
    if (Date.now() >= this.st.end) {
      if (this.st.mode === 'work') { const d = (this.st.done || 0) + 1; this.toast(`Фокус ${d}: 25 минут позади — отдохните 5 минут`); this.st.done = d; this.start('rest'); }
      else { this.toast('Отдых окончен — продолжаем!'); this.start('work'); }
      try { navigator.vibrate?.(200); } catch {}
      return;
    }
    this.render();
  }
  render() {
    const s = this.st;
    if (!s) { this.el.className = 'sb-i sb-click sb-focus'; this.el.innerHTML = '◷ фокус'; this.el.title = 'Таймер фокуса: 25 минут работы, 5 минут отдыха'; return; }
    const left = s.paused ? s.left : s.end - Date.now();
    const total = s.mode === 'work' ? WORK : REST;
    this.el.className = `sb-i sb-click sb-focus on ${s.mode}${s.paused ? ' paused' : ''}`;
    this.el.style.setProperty('--fp', `${(1 - left / total) * 100}%`);
    this.el.innerHTML = `<i></i>${s.mode === 'work' ? 'фокус' : 'отдых'} ${fmt(left)}${s.paused ? ' ⏸' : ''}<b data-fx="stop" title="Остановить таймер">×</b>`;
    this.el.title = s.paused ? 'Нажмите — продолжить' : 'Нажмите — пауза';
    document.title = document.title.replace(/^\d+:\d\d · /, '');
  }
}
