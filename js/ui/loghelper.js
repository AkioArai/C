// Помощник логов: хроника выполнения с поиском, фильтрами, историей переменных,
// таблицей трассировки и переходом к любому шагу.
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

const KINDS = [
  ['all', 'Всё'],
  ['vars', 'Переменные', ['var', 'write']],
  ['io', 'Ввод и вывод', ['io']],
  ['flow', 'Условия и циклы', ['flow']],
  ['warn', 'Предупреждения', ['warn']],
];
const MAX_ROWS = 500;   // сколько записей рисуем за раз: остальное доступно через поиск и фильтры
const MAX_COLS = 8;     // столбцов в таблице трассировки

export class LogHelper {
  /** opts: { onStep(n) — перейти к шагу, toast(text) } */
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    this.kind = 'all';
    this.q = '';
    this.varName = '';
    this.view = 'list';
    root.innerHTML = `
      <div class="lh-bar">
        <label class="lh-find"><svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><input type="search" data-lhq placeholder="Найти в логах: имя переменной, число, printf, строка 7…" spellcheck="false" autocomplete="off"></label>
        <div class="lh-kinds" data-lhkinds>${KINDS.map(([k, n]) => `<button data-k="${k}" class="${k === 'all' ? 'on' : ''}">${n}<i data-n="${k}"></i></button>`).join('')}</div>
        <div class="lh-view"><button data-lhview="list" class="on" title="Что происходило, шаг за шагом">Хроника</button><button data-lhview="table" title="Таблица трассировки: значения переменных на каждом шаге — как рисуют в тетради">Таблица</button></div>
        <button class="lh-copy" data-lhcopy title="Скопировать то, что сейчас показано">Копировать</button>
      </div>
      <div class="lh-vars" data-lhvars hidden></div>
      <div class="logs" data-logs></div>`;
    this.body = root.querySelector('[data-logs]');
    this.varsEl = root.querySelector('[data-lhvars]');
    this.input = root.querySelector('[data-lhq]');
    this.input.addEventListener('input', () => { this.q = this.input.value.trim().toLowerCase(); this.render(); });
    root.querySelector('.lh-bar').addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (k) { this.kind = k.dataset.k; this.render(); }
      const v = e.target.closest('[data-lhview]');
      if (v) { this.view = v.dataset.lhview; this.render(); }
      if (e.target.closest('[data-lhcopy]')) this.copy();
    });
    this.varsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-var]');
      if (!b) return;
      this.varName = this.varName === b.dataset.var ? '' : b.dataset.var;
      this.render();
    });
    this.body.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) { e.stopPropagation(); this.opts.onStep?.(+g.dataset.goto); }
    });
    this.clear();
  }

  clear() {
    this.entries = [];
    this.hist = new Map();   // имя → [{ step, val }]
    this.cur = 0;
    this.note = '';
    this.render();
  }
  get count() { return this.entries.length; }

  /** entry: { step, line, html, kind, ent, code, v — имя переменной, val — её новое значение } */
  add(entry) {
    entry.text = plain(entry.html).toLowerCase() + (entry.code ? ' ' + entry.code.toLowerCase() : '') + (entry.line ? ` строка ${entry.line}` : '');
    this.entries.push(entry);
    if (entry.v) {
      const h = this.hist.get(entry.v) || [];
      h.push({ step: entry.step, val: entry.val });
      this.hist.set(entry.v, h);
    }
    this.schedule();
  }
  /** Служебная строка внизу (например, «журнал ограничен»). */
  setNote(text) { this.note = text; this.schedule(); }
  /** Текущий шаг программы — подсвечивается в хронике и таблице. */
  setCurrent(step) { if (step !== this.cur) { this.cur = step; this.schedule(); } }

  schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(true); });
  }

  match(e) {
    if (this.kind !== 'all' && !KINDS.find(k => k[0] === this.kind)[2].includes(e.kind)) return false;
    if (this.varName && !(e.v === this.varName || e.text.includes(this.varName.toLowerCase()))) return false;
    if (this.q) for (const w of this.q.split(/\s+/)) if (!e.text.includes(w)) return false;
    return true;
  }

  render(auto) {
    const stick = !auto || this.body.scrollTop + this.body.clientHeight >= this.body.scrollHeight - 30;
    // счётчики на кнопках видов
    for (const [k, , kinds] of KINDS) {
      const n = k === 'all' ? this.entries.length : this.entries.filter(e => kinds.includes(e.kind)).length;
      const el = this.root.querySelector(`[data-n="${k}"]`);
      if (el) el.textContent = n ? (n > 999 ? '999+' : n) : '';
    }
    this.root.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === this.kind));
    this.root.querySelectorAll('[data-lhview]').forEach(b => b.classList.toggle('on', b.dataset.lhview === this.view));
    this.renderVars();
    if (!this.entries.length) {
      this.body.innerHTML = `<div class="empty lh-empty"><b>Здесь будет вся история выполнения программы</b>
        <span>Запустите код. Каждая строка получит объяснение: что она сделала, откуда взялось значение и почему.</span>
        <ul><li><b>Поиск</b> находит всё, что касается переменной, числа или строки кода.</li>
        <li><b>Имена переменных</b> над списком показывают, как менялось значение. Нажмите на имя — останутся только записи о нём.</li>
        <li><b>Таблица</b> — трассировка: значения переменных на каждом шаге.</li>
        <li><b>«К шагу»</b> возвращает программу к нужному месту.</li></ul></div>`;
      return;
    }
    if (this.view === 'table') this.renderTable(); else this.renderList();
    if (stick && auto) this.body.scrollTop = this.body.scrollHeight;
  }

  renderVars() {
    const names = [...this.hist.keys()];
    this.varsEl.hidden = !names.length;
    if (!names.length) return;
    this.varsEl.innerHTML = '<span class="lh-vl">Переменные:</span>' + names.slice(0, 40).map((n) => {
      const h = this.hist.get(n);
      const tail = h.slice(-6).map(x => x.val).join(' → ');
      return `<button data-var="${esc(n)}" class="${n === this.varName ? 'on' : ''}" title="${esc(n)}: ${esc((h.length > 6 ? '… → ' : '') + tail)}\nизменений: ${h.length}. Нажмите, чтобы показать только эту переменную."><b>${esc(n)}</b><span>${esc(h[h.length - 1].val)}</span>${h.length > 1 ? `<i>×${h.length}</i>` : ''}</button>`;
    }).join('') + (this.varName ? '<button class="lh-reset" data-var="' + esc(this.varName) + '">× сбросить</button>' : '');
  }

  renderList() {
    const all = this.entries.filter(e => this.match(e));
    const list = all.slice(-MAX_ROWS);
    const mark = (html) => {
      if (!this.q) return html;
      // подсветка найденного — только в тексте, не в тегах
      const words = this.q.split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!words.length) return html;
      const re = new RegExp(`(${words.join('|')})`, 'gi');
      return html.replace(/>([^<]+)</g, (m, t) => '>' + t.replace(re, '<mark>$1</mark>') + '<').replace(/^([^<]+)/, (t) => t.replace(re, '<mark>$1</mark>'));
    };
    let h = all.length > list.length ? `<div class="lh-more">Показаны последние ${list.length} записей из ${all.length}. Уточните поиск или выберите переменную, чтобы увидеть остальные.</div>` : '';
    let last = -1;
    for (const e of list) {
      if (e.step !== last) {
        last = e.step;
        h += `<div class="lh-step${e.step === this.cur ? ' cur' : ''}" ${e.line ? `data-line="${e.line}"` : ''}><b>шаг ${e.step}</b>${e.line ? `<span>строка ${e.line}</span>` : ''}${e.code ? `<code>${esc(e.code)}</code>` : ''}<button data-goto="${e.step}" title="Вернуть программу к этому шагу">к шагу</button></div>`;
      }
      h += `<div class="log k-${e.kind}" ${e.line ? `data-line="${e.line}"` : ''} ${e.ent ? `data-ent="${esc(e.ent)}"` : ''}><span class="kind-dot"></span><span class="lg-tx">${mark(e.html)}</span></div>`;
    }
    if (!list.length) h = `<div class="empty">Ничего не найдено${this.q ? ` по запросу «${esc(this.q)}»` : ''}. <button class="lnk" data-lhreset>Сбросить фильтры</button></div>`;
    if (this.note) h += `<div class="lh-more">${esc(this.note)}</div>`;
    this.body.innerHTML = h;
    this.body.querySelector('[data-lhreset]')?.addEventListener('click', () => { this.q = ''; this.input.value = ''; this.kind = 'all'; this.varName = ''; this.render(); });
  }

  /** Строки таблицы трассировки: [{ step, line, code, vals: Map, changed: Set }]. */
  traceRows() {
    const cols = this.varName ? [this.varName] : [...this.hist.keys()].filter(n => !/[.[]/.test(n)).concat([...this.hist.keys()].filter(n => /[.[]/.test(n))).slice(0, MAX_COLS);
    const rows = [];
    const vals = new Map();
    let row = null;
    for (const e of this.entries) {
      if (!e.v || !cols.includes(e.v)) continue;
      if (!row || row.step !== e.step) {
        row = { step: e.step, line: e.line, code: e.code, vals: null, changed: new Set() };
        rows.push(row);
      }
      vals.set(e.v, e.val);
      row.changed.add(e.v);
      row.vals = new Map(vals);
    }
    return { cols, rows };
  }

  renderTable() {
    const { cols, rows } = this.traceRows();
    if (!rows.length) { this.body.innerHTML = '<div class="empty">Переменные пока не менялись. Таблица заполнится, когда программа что-нибудь запишет в память.</div>'; return; }
    const q = this.q;
    const shown = rows.filter(r => !q || `${r.code || ''} строка ${r.line}`.toLowerCase().includes(q) || [...r.vals].some(([k, v]) => r.changed.has(k) && (k + ' ' + v).toLowerCase().includes(q))).slice(-MAX_ROWS);
    const hidden = this.hist.size - cols.length;
    let h = `<table class="lh-table"><thead><tr><th>шаг</th><th>строка</th><th class="lh-code">код</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
    for (const r of shown) {
      h += `<tr class="${r.step === this.cur ? 'cur' : ''}" data-line="${r.line || ''}"><td><button data-goto="${r.step}" title="Вернуть программу к этому шагу">${r.step}</button></td><td>${r.line || ''}</td><td class="lh-code"><code>${esc(r.code || '')}</code></td>${cols.map(c => `<td class="${r.changed.has(c) ? 'ch' : ''}">${r.vals.has(c) ? esc(r.vals.get(c)) : ''}</td>`).join('')}</tr>`;
    }
    h += '</tbody></table>';
    if (rows.length > shown.length && !q) h = `<div class="lh-more">Показаны последние ${shown.length} строк из ${rows.length}.</div>` + h;
    if (hidden > 0 && !this.varName) h += `<div class="lh-more">В таблице первые ${cols.length} переменных из ${this.hist.size}. Нажмите на имя переменной выше, чтобы увидеть только её.</div>`;
    this.body.innerHTML = h;
  }

  copy() {
    let text;
    if (this.view === 'table') {
      const { cols, rows } = this.traceRows();
      text = ['шаг', 'строка', ...cols].join('\t') + '\n' + rows.map(r => [r.step, r.line || '', ...cols.map(c => (r.vals.has(c) ? r.vals.get(c) : ''))].join('\t')).join('\n');
    } else {
      text = this.entries.filter(e => this.match(e)).map(e => `шаг ${e.step}${e.line ? `, строка ${e.line}` : ''}: ${plain(e.html)}`).join('\n');
    }
    const done = () => this.opts.toast?.(this.view === 'table' ? 'Таблица скопирована — её можно вставить в Excel или Word' : 'Логи скопированы');
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => this.opts.toast?.('Нет доступа к буферу обмена'));
  }
}
