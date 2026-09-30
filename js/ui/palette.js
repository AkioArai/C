// Палитра команд (Ctrl+K): один поиск по командам, файлам, примерам, урокам и задачам.
// «>» в начале — только команды (как в VS Code).
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ICONS = {
  cmd: '<path d="M9 6l6 6-6 6"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  ex: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>', lesson: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  task: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
};
const GROUP = { cmd: 'Команды', file: 'Мои файлы', ex: 'Примеры', lesson: 'Теория', task: 'Задачи' };

function score(q, text) {
  if (!q) return 1;
  const t = text.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) {
      // буквы по порядку
      let j = 0;
      for (const ch of t) if (ch === w[j]) j++;
      if (j < w.length) return 0;
      s += 5;
    } else s += i === 0 ? 40 : t[i - 1] === ' ' ? 25 : 12;
  }
  return s;
}

export class Palette {
  /** source(): [{kind, title, sub, keys, run}] */
  constructor(source) {
    this.source = source;
    this.el = document.createElement('div');
    this.el.className = 'pal';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="pal-card" role="dialog" aria-label="Поиск и команды">
      <div class="pal-in"><svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><input placeholder="Что найти? Файл, пример, урок, задача… «>» — только команды" spellcheck="false" autocomplete="off"></div>
      <div class="pal-list" role="listbox"></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Esc</kbd> закрыть</span><span class="pal-tip">«&gt;» — только команды</span></div>
    </div>`;
    document.body.appendChild(this.el);
    this.input = this.el.querySelector('input');
    this.list = this.el.querySelector('.pal-list');
    this.input.addEventListener('input', () => { this.sel = 0; this.render(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = this.items.length; if (n) { this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; this.render(true); } }
      if (e.key === 'Enter') { e.preventDefault(); this.pick(this.sel); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.list.addEventListener('mousedown', (e) => { const it = e.target.closest('[data-i]'); if (it) { e.preventDefault(); this.pick(+it.dataset.i); } });
    this.list.addEventListener('mousemove', (e) => { const it = e.target.closest('[data-i]'); if (it && +it.dataset.i !== this.sel) { this.sel = +it.dataset.i; this.render(true); } });
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); this.open(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); this.open('>'); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); this.open(''); }
    });
  }
  open(prefix = '') {
    this.el.hidden = false;
    this.input.value = prefix;
    this.sel = 0;
    this.all = this.source();
    this.render();
    this.input.focus();
    this.input.setSelectionRange(prefix.length, prefix.length);
  }
  close() { this.el.hidden = true; }
  pick(i) {
    const it = this.items[i];
    if (!it) return;
    this.close();
    setTimeout(() => it.run(), 10);
  }
  render(keepScroll) {
    let q = this.input.value.trim();
    let pool = this.all;
    if (q.startsWith('>')) { pool = pool.filter(x => x.kind === 'cmd'); q = q.slice(1).trim(); }
    const scored = pool.map(x => ({ x, s: score(q, x.title + ' ' + (x.sub || '') + ' ' + (x.tags || '')) })).filter(o => o.s > 0);
    if (q) scored.sort((a, b) => b.s - a.s);
    const order = ['cmd', 'file', 'ex', 'lesson', 'task'];
    if (!q) scored.sort((a, b) => order.indexOf(a.x.kind) - order.indexOf(b.x.kind));
    this.items = scored.slice(0, q ? 60 : 40).map(o => o.x);
    let last = null, h = '';
    this.items.forEach((x, i) => {
      if (!q && x.kind !== last) { h += `<div class="pal-g">${GROUP[x.kind]}</div>`; last = x.kind; }
      h += `<div class="pal-it${i === this.sel ? ' on' : ''}" data-i="${i}" role="option"><svg class="ic k-${x.kind}" viewBox="0 0 24 24">${ICONS[x.kind]}</svg><span class="pal-t">${esc(x.title)}</span>${x.sub ? `<span class="pal-s">${esc(x.sub)}</span>` : ''}${x.keys ? `<kbd>${esc(x.keys)}</kbd>` : q ? `<span class="pal-k">${GROUP[x.kind]}</span>` : ''}</div>`;
    });
    this.list.innerHTML = h || '<div class="pal-empty">Ничего не найдено</div>';
    const on = this.list.querySelector('.pal-it.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
}
