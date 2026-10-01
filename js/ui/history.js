// История версий файла: снимки при сохранении, запуске и раз в пару минут работы.
// Окно истории показывает отличия от текущего текста и позволяет вернуть любую версию.
import { store } from '../store.js';
import { highlight } from './highlight.js';

const KEY = 'fs.hist';
const MAX = 30;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function snapshot(f, why = 'правка') {
  if (!f || f.preview || !f.id) return;
  const all = store.get(KEY, {});
  const list = all[f.id] || [];
  const last = list[list.length - 1];
  if (last && last.code === f.code) return;
  // автоснимки во время набора — не чаще раза в 2 минуты
  if (why === 'правка' && last && Date.now() - last.t < 120000) return;
  list.push({ t: Date.now(), code: f.code, why });
  all[f.id] = list.slice(-MAX);
  store.set(KEY, all);
}
export function versions(id) { return (store.get(KEY, {})[id] || []).slice().reverse(); }
export function forget(id) { const all = store.get(KEY, {}); delete all[id]; store.set(KEY, all); }

/** Построчный diff (наибольшая общая подпоследовательность). */
export function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  if (n * m > 400000) return [...A.map(l => ['-', l]), ...B.map(l => ['+', l])];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', A[i++]]);
    else out.push(['+', B[j++]]);
  }
  while (i < n) out.push(['-', A[i++]]);
  while (j < m) out.push(['+', B[j++]]);
  return out;
}

const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  return new Date(t).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export class HistoryDialog {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'hist';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target.closest('[data-hclose]')) { this.close(); return; }
      const v = e.target.closest('[data-v]');
      if (v) { this.sel = +v.dataset.v; this.render(); return; }
      if (e.target.closest('[data-restore]')) { const ver = this.list[this.sel]; if (ver) { this.onRestore(ver.code); this.close(); } }
    });
    document.addEventListener('keydown', (e) => {
      if (this.el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.sel = Math.max(0, Math.min(this.list.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1))); this.render(); }
    });
  }
  open(file, current, onRestore) {
    this.file = file;
    this.current = current;
    this.onRestore = onRestore;
    this.list = versions(file.id);
    this.sel = 0;
    this.el.hidden = false;
    this.render();
  }
  close() { this.el.hidden = true; }
  render() {
    const v = this.list[this.sel];
    const d = v ? diffLines(v.code, this.current) : [];
    const plus = d.filter(x => x[0] === '+').length, minus = d.filter(x => x[0] === '-').length;
    let ln = 0;
    this.el.innerHTML = `<div class="hist-card" role="dialog" aria-label="История файла">
      <div class="hist-head"><svg class="ic" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg><b>История: ${esc(this.file.name)}</b><span class="muted">${this.list.length ? `${this.list.length} ${this.list.length === 1 ? 'версия' : this.list.length < 5 ? 'версии' : 'версий'}` : ''}</span><button class="in-close" data-hclose aria-label="Закрыть">×</button></div>
      ${this.list.length ? `<div class="hist-body">
        <div class="hist-list">${this.list.map((x, i) => `<button class="hist-v ${i === this.sel ? 'on' : ''}" data-v="${i}"><b>${ago(x.t)}</b><small>${esc(x.why)} · ${x.code.split('\n').length} строк</small></button>`).join('')}</div>
        <div class="hist-diff">
          <div class="hist-dh"><span>Чем эта версия отличается от текущего текста</span><span class="hd-n"><i class="add">+${plus}</i><i class="del">−${minus}</i></span></div>
          <div class="hist-lines">${d.map(([k, l]) => { if (k !== '-') ln++; return `<div class="hl ${k === '+' ? 'add' : k === '-' ? 'del' : ''}"><span class="hl-n">${k === '-' ? '' : ln}</span><span class="hl-k">${k === ' ' ? '' : k === '+' ? '+' : '−'}</span><code>${highlight(l) || ' '}</code></div>`; }).join('')}</div>
          <div class="hist-foot"><span class="muted"><span class="del-t">−</span> было в версии, <span class="add-t">+</span> есть сейчас</span><button class="btn primary" data-restore ${plus + minus ? '' : 'disabled'}>Вернуть эту версию</button></div>
        </div></div>`
      : '<div class="hist-empty"><p>Версий пока нет.</p><p class="muted">Снимок сохраняется при сохранении файла (Ctrl+S), перед каждым запуском и раз в пару минут работы.</p></div>'}
    </div>`;
  }
}
