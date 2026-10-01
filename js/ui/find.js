// Поиск и замена в редакторе (Ctrl+F / Ctrl+H): подсветка всех совпадений, переход по ним, замена.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export class FindBar {
  constructor(ed) {
    this.ed = ed;
    this.matches = [];
    this.idx = -1;
    this.caseSens = false;
    this.word = false;
    this.el = document.createElement('div');
    this.el.className = 'fbar';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="fb-row">
        <button class="fb-tg" data-f="rep" title="Показать замену (Ctrl+H)">›</button>
        <input data-q placeholder="Найти" spellcheck="false" autocomplete="off">
        <span class="fb-n" data-n></span>
        <button class="fb-o" data-f="case" title="Учитывать регистр">Aa</button>
        <button class="fb-o" data-f="word" title="Слово целиком"><u>ab</u></button>
        <button class="fb-b" data-f="prev" title="Предыдущее (Shift+Enter)">↑</button>
        <button class="fb-b" data-f="next" title="Следующее (Enter)">↓</button>
        <button class="fb-b" data-f="close" title="Закрыть (Esc)">×</button>
      </div>
      <div class="fb-row fb-rep" hidden>
        <input data-r placeholder="Заменить на" spellcheck="false" autocomplete="off">
        <button class="fb-w" data-f="one" title="Заменить текущее">Заменить</button>
        <button class="fb-w" data-f="all" title="Заменить все совпадения">Все</button>
      </div>`;
    ed.edEl.appendChild(this.el);
    this.q = this.el.querySelector('[data-q]');
    this.r = this.el.querySelector('[data-r]');
    this.q.addEventListener('input', () => { this.search(); this.go(0, true); });
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      const f = b.dataset.f;
      if (f === 'rep') this.toggleReplace();
      if (f === 'case') { this.caseSens = !this.caseSens; b.classList.toggle('on', this.caseSens); this.search(); this.go(0, true); }
      if (f === 'word') { this.word = !this.word; b.classList.toggle('on', this.word); this.search(); this.go(0, true); }
      if (f === 'prev') this.go(-1);
      if (f === 'next') this.go(1);
      if (f === 'close') this.close();
      if (f === 'one') this.replaceOne();
      if (f === 'all') this.replaceAll();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'Enter' && e.target === this.q) { e.preventDefault(); this.go(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Enter' && e.target === this.r) { e.preventDefault(); if (e.ctrlKey || e.metaKey) this.replaceAll(); else this.replaceOne(); }
    });
    ed.ta.addEventListener('input', () => { if (!this.el.hidden) { this.search(); this.paint(); } });
  }
  open(replace = false) {
    const ta = this.ed.ta;
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    this.el.hidden = false;
    this.el.querySelector('.fb-rep').hidden = !replace;
    this.el.querySelector('[data-f="rep"]').classList.toggle('open', replace);
    if (sel && !sel.includes('\n')) this.q.value = sel;
    this.search();
    this.go(0, true);
    (replace && this.q.value ? this.r : this.q).focus();
    this.q.select();
  }
  close() { this.el.hidden = true; this.matches = []; this.paint(); this.ed.ta.focus(); }
  toggleReplace() {
    const rep = this.el.querySelector('.fb-rep');
    rep.hidden = !rep.hidden;
    this.el.querySelector('[data-f="rep"]').classList.toggle('open', !rep.hidden);
    if (!rep.hidden) this.r.focus();
  }
  search() {
    const q = this.q.value;
    this.matches = [];
    if (q) {
      const src = this.ed.ta.value;
      const pat = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(this.word ? `\\b${pat}\\b` : pat, this.caseSens ? 'g' : 'gi');
      let m;
      while ((m = re.exec(src)) && this.matches.length < 2000) { this.matches.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; }
    }
    this.el.querySelector('[data-n]').textContent = q ? (this.matches.length ? `${Math.max(0, this.idx) + 1} из ${this.matches.length}` : 'нет совпадений') : '';
    this.el.classList.toggle('none', !!q && !this.matches.length);
  }
  /** dir: +1/-1 — к следующему/предыдущему; 0 — ближайшее от курсора. */
  go(dir, keepFocus) {
    if (!this.matches.length) { this.idx = -1; this.paint(); return; }
    const pos = this.ed.ta.selectionStart;
    if (dir === 0) { this.idx = this.matches.findIndex(m => m[0] >= pos); if (this.idx < 0) this.idx = 0; }
    else this.idx = (this.idx + dir + this.matches.length) % this.matches.length;
    const [a, b] = this.matches[this.idx];
    this.ed.ta.setSelectionRange(a, b);
    const line = this.ed.ta.value.slice(0, a).split('\n').length;
    this.ed.reveal(line);
    this.el.querySelector('[data-n]').textContent = `${this.idx + 1} из ${this.matches.length}`;
    this.paint();
    if (!keepFocus) this.q.focus();
  }
  replaceOne() {
    if (this.idx < 0 || !this.matches.length) return;
    const [a, b] = this.matches[this.idx];
    const ta = this.ed.ta;
    ta.focus(); ta.setSelectionRange(a, b);
    this.ed.insert(this.r.value);
    this.search();
    if (this.matches.length) { this.idx = Math.min(this.idx, this.matches.length - 1); this.idx = this.matches.findIndex(m => m[0] >= a + this.r.value.length); if (this.idx < 0) this.idx = 0; this.go(0); this.idx = Math.max(0, this.idx); }
    else this.paint();
    this.r.focus();
  }
  replaceAll() {
    if (!this.matches.length) return;
    const n = this.matches.length;
    const src = this.ed.ta.value;
    let out = '', last = 0;
    for (const [a, b] of this.matches) { out += src.slice(last, a) + this.r.value; last = b; }
    out += src.slice(last);
    const ta = this.ed.ta;
    ta.focus(); ta.select();
    this.ed.insert(out); // одной правкой — отменяется через Ctrl+Z
    this.search(); this.paint();
    this.el.querySelector('[data-n]').textContent = `заменено: ${n}`;
    this.r.focus();
  }
  /** Подсветка совпадений поверх кода. */
  paint() {
    const ed = this.ed;
    if (!ed.findLayer) { ed.findLayer = document.createElement('div'); ed.findLayer.className = 'ed-find'; ed.marks.parentElement.insertBefore(ed.findLayer, ed.marks); }
    if (this.el.hidden || !this.matches.length) { ed.findLayer.innerHTML = ''; return; }
    const src = ed.ta.value;
    const starts = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
    let h = '', li = 0;
    this.matches.slice(0, 600).forEach(([a, b], k) => {
      while (li + 1 < starts.length && starts[li + 1] <= a) li++;
      const col = a - starts[li];
      const top = ed.pad + li * ed.lh, left = ed.padL + col * ed.cw;
      h += `<i class="${k === this.idx ? 'cur' : ''}" style="top:${top}px;left:${left}px;width:${Math.max(2, (b - a) * ed.cw)}px;height:${ed.lh}px"></i>`;
    });
    ed.findLayer.innerHTML = h;
  }
}
export { esc as _esc };
