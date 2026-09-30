// Панель «компьютера»: вкладки Терминал, Логи, Процессы, Проблемы.
import { esc, typeInfo } from '../universe/explain.js';
import { formatDiag } from '../compiler/diagnostics.js';
import { settings } from './settings.js';

const ICON = {
  smaller: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 18l5-12 5 12M5.8 14h6.4"/><path d="M16 12h6"/></svg>',
  bigger: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 18l5-12 5 12M4.8 14h6.4"/><path d="M15 12h6M18 9v6"/></svg>',
  wrap: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4"/><path d="M15 16l-2 2 2 2"/><path d="M4 18h5"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  clear: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  up: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg>',
  down: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></svg>',
  cfg: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
};

const TERM_KEYS = { logsFs: 'logs.fs' };
const tkey = (k) => TERM_KEYS[k] || 'term.' + k;

export class ConsolePanel {
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    this.logCount = 0;
    this.filter = 'all';
    root.innerHTML = `
      <div class="con-tabs" role="tablist">
        <button class="con-tab active" data-tab="term" role="tab">Терминал</button>
        <button class="con-tab" data-tab="logs" role="tab">Логи <span class="badge" data-badge="logs"></span></button>
        <button class="con-tab" data-tab="proc" role="tab">Процессы <span class="badge" data-badge="proc"></span></button>
        <button class="con-tab" data-tab="prob" role="tab">Проблемы <span class="badge" data-badge="prob"></span></button>
        <span class="con-status" data-status></span>
        <div class="con-tools" data-tools>
          <button class="tbtn" data-tt="smaller" title="Уменьшить текст (Ctrl + колесо мыши, щипок двумя пальцами)">${ICON.smaller}</button>
          <span class="tt-fs" data-fs title="Размер текста"></span>
          <button class="tbtn" data-tt="bigger" title="Увеличить текст">${ICON.bigger}</button>
          <button class="tbtn" data-tt="wrap" title="Перенос длинных строк. Выключен — строки не ломаются, их можно листать вправо-влево">${ICON.wrap}</button>
          <button class="tbtn" data-tt="copy" title="Скопировать вывод программы">${ICON.copy}</button>
          <button class="tbtn" data-tt="clear" title="Очистить терминал">${ICON.clear}</button>
          <button class="tbtn" data-tt="size" title="Развернуть / свернуть панель">${ICON.up}</button>
          <button class="tbtn" data-tt="cfg" title="Настройки терминала (Ctrl+,)">${ICON.cfg}</button>
        </div>
      </div>
      <div class="con-body">
        <section class="con-pane active" data-pane="term">
          <div class="term" data-term></div>
          <span class="ktrail" aria-hidden="true"></span><span class="kcur" aria-hidden="true"></span>
          <form class="term-input" data-input hidden>
            <span class="ti-prompt">stdin ›</span>
            <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="введите значение(я) и нажмите Enter" enterkeyhint="send">
            <button type="submit" class="btn small">Отправить</button>
            <button type="button" class="btn small ghost" data-eof title="Сообщить программе, что ввод закончен (Ctrl+D)">EOF</button>
          </form>
        </section>
        <section class="con-pane" data-pane="logs">
          <div class="log-filters">
            <button class="chip active" data-f="all">Все</button>
            <button class="chip" data-f="var">Память</button>
            <button class="chip" data-f="write">Присваивания</button>
            <button class="chip" data-f="io">Ввод-вывод</button>
            <button class="chip" data-f="flow">Управление</button>
            <button class="chip" data-f="warn">Предупреждения</button>
            <button class="chip" data-f="law">Законы</button>
          </div>
          <div class="logs" data-logs><div class="empty">Запустите программу — здесь появится подробная хроника: что, где, когда и почему произошло во вселенной.</div></div>
        </section>
        <section class="con-pane" data-pane="proc">
          <div class="proc" data-proc><div class="empty">Пока во вселенной пусто. Процессы появятся после запуска программы.</div></div>
        </section>
        <section class="con-pane" data-pane="prob">
          <div class="prob" data-prob><div class="empty">Проблем не найдено.</div></div>
        </section>
      </div>`;
    this.term = root.querySelector('[data-term]');
    this.logsEl = root.querySelector('[data-logs]');
    this.procEl = root.querySelector('[data-proc]');
    this.probEl = root.querySelector('[data-prob]');
    this.inputForm = root.querySelector('[data-input]');
    this.inputEl = this.inputForm.querySelector('input');
    this.statusEl = root.querySelector('[data-status]');
    this.kcur = root.querySelector('.kcur');
    this.ktrail = root.querySelector('.ktrail');
    this.size = 'normal';
    this.applyCfg();
    settings.on((k) => { if (k.startsWith('term.') || k.startsWith('logs.')) this.applyCfg(); });
    this.term.addEventListener('scroll', () => this.placeCursor(true));
    new ResizeObserver(() => this.placeCursor(true)).observe(this.term);
    root.querySelector('[data-tools]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tt]');
      if (b) this.tool(b.dataset.tt, b);
    });
    // Ctrl + колесо — размер текста
    root.querySelector('.con-body').addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.setCfg('fs', this.cfg.fs + (e.deltaY < 0 ? 0.5 : -0.5));
    }, { passive: false });
    // щипок двумя пальцами — размер текста
    let pinch = null;
    const body = root.querySelector('.con-body');
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    body.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: dist(e.touches), fs: this.cfg.fs }; }, { passive: true });
    body.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      this.setCfg('fs', Math.round(pinch.fs * dist(e.touches) / pinch.d * 2) / 2, true);
    }, { passive: false });
    body.addEventListener('touchend', () => { if (pinch) { pinch = null; settings.set('term.fs', this._liveFs ?? this.cfg.fs); } });
    root.querySelectorAll('.con-tab').forEach(b => b.addEventListener('click', () => this.show(b.dataset.tab)));
    root.querySelectorAll('.chip[data-f]').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('.chip[data-f]').forEach(x => x.classList.toggle('active', x === b));
      this.filter = b.dataset.f;
      this.logsEl.dataset.filter = this.filter;
    }));
    this.inputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.inputEl.value;
      this.inputEl.value = '';
      this.opts.onInput?.(v);
    });
    this.inputForm.querySelector('[data-eof]').addEventListener('click', () => this.opts.onEOF?.());
    this.inputEl.addEventListener('keydown', (e) => { if (e.ctrlKey && (e.key === 'd' || e.key === 'z')) { e.preventDefault(); this.opts.onEOF?.(); } });
    const jump = (e) => {
      const el = e.target.closest('[data-line],[data-ent]');
      if (!el) return;
      if (el.dataset.ent) this.opts.onEntity?.(el.dataset.ent);
      if (el.dataset.line) this.opts.onJump?.(+el.dataset.line, el.dataset.col ? +el.dataset.col : undefined);
    };
    this.logsEl.addEventListener('click', jump);
    this.procEl.addEventListener('click', jump);
    this.probEl.addEventListener('click', jump);
    this.term.addEventListener('click', (e) => { if (e.target.closest('[data-line]')) jump(e); });
  }

  show(tab) {
    this.root.querySelectorAll('.con-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    this.root.querySelectorAll('.con-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
    this.tab = tab;
    if (tab === 'term' && !this.inputForm.hidden) this.inputEl.focus();
  }

  badge(name, v) { const b = this.root.querySelector(`[data-badge="${name}"]`); if (b) { b.textContent = v || ''; b.className = 'badge' + (v ? ' on' : ''); } }
  status(html, cls = '') { this.statusEl.innerHTML = html; this.statusEl.className = 'con-status ' + cls; }

  // ——— терминал ———
  clear() { this.term.innerHTML = ''; this.out = null; this._cur = null; this.placeCursor(true); }
  atBottom(el) { return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }
  line(html, cls = '') {
    const stick = this.atBottom(this.term);
    const d = document.createElement('div');
    d.className = 'tl new ' + cls;
    d.innerHTML = html;
    this.term.querySelector('.kline')?.remove();
    this.term.appendChild(d);
    this.out = null;
    if (stick && this.cfg.autoscroll) this.term.scrollTop = this.term.scrollHeight;
    this.moveCursor();
    return d;
  }
  stdout(text, cls = 'so') {
    const stick = this.atBottom(this.term);
    if (!this.out) { this.term.querySelector('.kline')?.remove(); this.out = document.createElement('div'); this.out.className = 'tl new stdout'; this.term.appendChild(this.out); }
    const sp = document.createElement('span');
    sp.className = cls + ' new';
    // пробелы, табы и \n — отдельными узлами: в режиме «невидимые символы» они подписываются
    sp.innerHTML = esc(text).replace(/ /g, '<i class="w-sp"> </i>').replace(/\t/g, '<i class="w-tb">\t</i>').replace(/\n/g, '<i class="w-nl"></i>\n');
    this.out.appendChild(sp);
    if (stick && this.cfg.autoscroll) this.term.scrollTop = this.term.scrollHeight;
    if (this.term.childElementCount > 1500) this.term.firstElementChild.remove();
    this.moveCursor();
  }

  // ——— курсор как в kitty: плавно едет к концу вывода, за ним тянется след ———
  moveCursor() {
    if (this._curRaf) return;
    this._curRaf = requestAnimationFrame(() => { this._curRaf = 0; this.placeCursor(false); });
  }
  placeCursor(instant) {
    const cur = this.kcur, tr = this.ktrail;
    if (!cur) return;
    const on = this.cfg.cursor && this.term.childElementCount > 0;
    cur.hidden = tr.hidden = !on;
    if (!on) return;
    // маркер конца вывода: после последнего символа stdout или в начале новой строки
    let m = this.term.querySelector('.kmark');
    if (!m) { m = document.createElement('span'); m.className = 'kmark'; }
    const last = this.term.lastElementChild;
    if (this.out && last === this.out) this.out.appendChild(m);
    else { let row = this.term.querySelector('.kline'); if (!row) { row = document.createElement('div'); row.className = 'tl kline'; } row.appendChild(m); this.term.appendChild(row); }
    const tb = this.term.getBoundingClientRect(), mb = m.getBoundingClientRect(), pb = this.term.parentElement.getBoundingClientRect();
    const x = mb.left - pb.left, y = mb.top - pb.top, h = Math.max(10, mb.height || this.cfg.fs * this.cfg.lh);
    const visible = mb.top >= tb.top - 2 && mb.bottom <= tb.bottom + 2 && mb.left >= tb.left - 2 && mb.left <= tb.right;
    cur.style.opacity = tr.style.opacity = visible ? '' : '0';
    const prev = this._cur;
    this._cur = { x, y, h };
    cur.style.height = h + 'px';
    cur.style.transition = instant ? 'none' : '';
    cur.style.transform = `translate(${x}px, ${y}px)`;
    if (this.cfg.trail && prev && !instant && (Math.abs(prev.x - x) > 2 || Math.abs(prev.y - y) > 2)) {
      // след: полоса от старого положения к новому, быстро гаснет
      const x0 = Math.min(prev.x, x), y0 = Math.min(prev.y, y);
      const w = Math.abs(prev.x - x) + 8, hh = Math.abs(prev.y - y) + h;
      tr.style.transition = 'none';
      tr.style.transform = `translate(${x0}px, ${y0}px)`;
      tr.style.width = w + 'px'; tr.style.height = hh + 'px';
      tr.style.opacity = '.35';
      tr.style.transformOrigin = prev.x > x || prev.y > y ? 'left top' : 'right bottom';
      void tr.offsetWidth;
      tr.style.transition = '';
      tr.style.opacity = '0';
    }
    cur.classList.remove('blink'); void cur.offsetWidth; cur.classList.add('blink');
  }
  diag(d, lines) {
    const f = formatDiag(d, lines);
    const cls = d.severity === 'error' ? 'err' : d.severity === 'warning' ? 'warn' : 'note';
    let html = `<div class="dg-head" data-line="${d.line}" data-col="${d.col}">${esc(f[0])}</div>`;
    if (f[1]) html += `<pre class="dg-src">${esc(f[1])}\n<span class="caret">${esc(f[2])}</span></pre>`;
    if (d.hint) html += `<div class="dg-hint">${esc(d.hint).replace(/\n/g, '<br>')}</div>`;
    this.line(html, 'diag ' + cls);
  }
  askInput(on) {
    this.inputForm.hidden = !on;
    this.root.classList.toggle('waiting', on);
    if (on) { if (this.tab !== 'term') this.show('term'); setTimeout(() => this.inputEl.focus(), 30); }
  }

  // ——— настройки терминала (общее окно настроек, раздел «Терминал») ———
  get cfg() {
    const g = (k) => settings.get(tkey(k));
    return { fs: g('fs'), lh: g('lh'), wrap: g('wrap'), invis: g('invis'), theme: g('theme'), font: g('font'), autoscroll: g('autoscroll'),
      echo: g('echo'), compact: g('compact'), logsFs: g('logsFs'), cursor: g('cursor'), trail: g('trail'), fadeIn: g('fadeIn') };
  }
  setCfg(k, v, live) {
    if (k === 'fs') v = Math.max(9, Math.min(24, +v));
    if (live) { this._liveFs = v; this.root.style.setProperty('--t-fs', v + 'px'); return; }
    settings.set(tkey(k), v);
  }
  applyCfg() {
    const c = this.cfg, r = this.root;
    r.style.setProperty('--t-fs', c.fs + 'px');
    r.style.setProperty('--t-lh', c.lh);
    r.dataset.tTheme = c.theme;
    r.dataset.tFont = c.font;
    r.classList.toggle('t-wrap', c.wrap);
    r.classList.toggle('t-invis', c.invis);
    r.classList.toggle('t-compact', c.compact);
    r.classList.toggle('t-noecho', !c.echo);
    r.classList.toggle('t-logsfs', c.logsFs);
    r.classList.toggle('t-fade', c.fadeIn);
    r.classList.toggle('t-nostep', !settings.get('logs.stepNumbers'));
    r.querySelector('[data-fs]').textContent = (c.fs % 1 ? c.fs.toFixed(1) : c.fs) + '';
    r.querySelector('[data-tt="wrap"]').classList.toggle('on', c.wrap);
    this.placeCursor(true);
  }
  tool(name, btn) {
    if (name === 'smaller') this.setCfg('fs', this.cfg.fs - 1);
    if (name === 'bigger') this.setCfg('fs', this.cfg.fs + 1);
    if (name === 'wrap') this.setCfg('wrap', !this.cfg.wrap);
    if (name === 'clear') this.clear();
    if (name === 'copy') {
      const txt = [...this.term.querySelectorAll('.tl.stdout')].map(el => el.textContent).join('');
      navigator.clipboard?.writeText(txt).then(() => this.flashBtn(btn, 'скопировано'), () => this.flashBtn(btn, 'нет доступа'));
    }
    if (name === 'size') {
      this.size = this.size === 'max' ? 'normal' : 'max';
      this.setSize(this.size);
    }
    if (name === 'cfg') this.opts.onSettings?.('term');
  }
  setSize(mode) {
    this.size = mode;
    const b = this.root.querySelector('[data-tt="size"]');
    b.innerHTML = mode === 'max' ? ICON.down : ICON.up;
    b.title = mode === 'max' ? 'Вернуть обычный размер панели' : 'Развернуть панель';
    this.opts.onSize?.(mode);
  }
  flashBtn(btn, text) {
    btn.dataset.tip = text;
    btn.classList.add('tip');
    setTimeout(() => btn.classList.remove('tip'), 1200);
  }

  // ——— логи ———
  clearLogs() {
    this.logsEl.innerHTML = '';
    this.logsEl.dataset.filter = this.filter;
    this.logCount = 0;
    this.badge('logs', '');
  }
  log(entry) {
    this.logCount++;
    const MAX_LOGS = settings.get('logs.max') || Infinity;
    if (this.logCount > MAX_LOGS) {
      if (this.logCount === MAX_LOGS + 1) {
        const d = document.createElement('div');
        d.className = 'log k-warn';
        d.innerHTML = `<span class="lg-ic"></span><span class="lg-tx">Журнал ограничен ${MAX_LOGS} записями — дальнейшие шаги выполняются без записи. Лимит меняется в настройках (раздел «Логи»).</span>`;
        this.logsEl.appendChild(d);
      }
      return;
    }
    const stick = this.atBottom(this.logsEl);
    const d = document.createElement('div');
    d.className = 'log k-' + entry.kind;
    if (entry.line) d.dataset.line = entry.line;
    if (entry.ent) d.dataset.ent = entry.ent;
    d.innerHTML = `<span class="lg-step">#${entry.step}</span><span class="lg-line">${entry.line ? 'стр. ' + entry.line : ''}</span><span class="kind-dot"></span><span class="lg-tx">${entry.html}</span>`;
    this.logsEl.appendChild(d);
    if (stick) this.logsEl.scrollTop = this.logsEl.scrollHeight;
    this.badge('logs', this.logCount > 999 ? '999+' : this.logCount);
  }

  // ——— процессы ———
  renderProcesses(scene, state) {
    const tr = scene.tree();
    const item = (key, title, sub, desc, extra = '', line = 0) =>
      `<div class="pi ${extra}" data-ent="${key}" ${line ? `data-line="${line}"` : ''}>
        <span class="pi-main"><span class="pi-t">${title}</span>${sub ? `<span class="pi-s">${sub}</span>` : ''}${desc ? `<span class="pi-d">${desc}</span>` : ''}</span>
      </div>`;
    const count = tr.frames.length + tr.globals.length + tr.heap.length + tr.files.length + tr.frames.reduce((n, f) => n + f.vars.length, 0);
    this.badge('proc', count || '');
    if (!count) { this.procEl.innerHTML = '<div class="empty">Пока ничего не существует. Процессы появятся после запуска программы.</div>'; return; }
    let h = `<div class="pg"><div class="pg-h">компьютер <span class="pg-n">${esc(state || '')}</span></div>`;
    h += item('computer', 'экран и клавиатура', `библиотеки: ${tr.headers.map(x => esc(x.name)).join(', ') || 'нет'}`, tr.defines.length ? '#define: ' + tr.defines.map(d => esc(d.name)).join(', ') : '');
    h += '</div>';
    const varItem = (o) => {
      const c0 = o.cells[0];
      const v = o.shape === 'scalar' ? (c0?.init ? (c0.ptr !== undefined && c0.desc ? '→ ' + c0.desc : c0.display) : '?')
        : o.shape === 'array' ? `[${o.cells.slice(0, 8).map(c => (c.init ? String(c.display).split(' ')[0] : '?')).join(', ')}${o.cells.length > 8 ? ', …' : ''}]` : '{…}';
      return item('obj:' + o.id, `${esc(o.name)} = <b class="v">${esc(v)}</b>`, `${esc(o.typeName)} · ${o.size} Б · 0x${o.addr.toString(16)}${o.line ? ' · строка ' + o.line : ''}`,
        o.garbage ? '<b class="bad">мусор — не инициализирована</b>' : o.freed ? '<b class="bad">освобождён</b>' : '', 'sub', o.line);
    };
    if (tr.globals.length) {
      h += `<div class="pg"><div class="pg-h">глобальные <span class="pg-n">${tr.globals.length}</span></div>`;
      for (const o of tr.globals) h += varItem(o);
      h += '</div>';
    }
    for (const { fr, vars, loops } of tr.frames) {
      const active = scene.current === fr.id;
      h += `<div class="pg ${active ? 'active' : ''}"><div class="pg-h">${esc(fr.func)}() ${active ? '<span class="live">выполняется</span>' : fr.ended ? '<span class="pg-n">завершена</span>' : '<span class="pg-n">ждёт возврата</span>'}</div>`;
      h += item('frame:' + fr.id, `кадр ${esc(fr.func)}()`, `глубина ${fr.depth} · строка ${fr.curLine}`, fr.args?.length ? 'параметры: ' + esc(fr.args.map(a => `${a.name}=${a.display}`).join(', ')) : '', '', fr.span.start);
      for (const lp of loops) {
        h += item(`loop:${fr.id}:${lp.nodeId}`, `${lp.kind === 'do' ? 'do-while' : lp.kind} (${esc(lp.text)})`,
          `строки ${lp.line}–${lp.endLine} · ${lp.active ? `<span class="live">итерация ${lp.iter}</span>` : `итераций: ${lp.iters ?? lp.iter}`}`, '', 'sub', lp.line);
      }
      for (const o of vars) h += varItem(o);
      h += '</div>';
    }
    if (tr.heap.length) {
      h += `<div class="pg"><div class="pg-h">куча <span class="pg-n">${tr.heap.length}</span></div>`;
      for (const o of tr.heap) h += varItem(o);
      h += '</div>';
    }
    if (tr.files.length) {
      h += `<div class="pg"><div class="pg-h">файлы <span class="pg-n">${tr.files.length}</span></div>`;
      for (const f of tr.files) h += item('files', esc(f.name), esc(f.state || ''), esc((f.text || '').slice(0, 60).replace(/\n/g, '↵')), 'sub');
      h += '</div>';
    }
    this.procEl.innerHTML = h;
  }

  // ——— проблемы ———
  setProblems(diags, lines) {
    const n = diags.length;
    const errs = diags.filter(d => d.severity === 'error').length;
    this.badge('prob', n || '');
    if (!n) { this.probEl.innerHTML = '<div class="empty">Проблем не найдено. Код выглядит правильно.</div>'; return; }
    const icon = { error: '', warning: '', note: '' };
    const name = { error: 'Ошибка', warning: 'Предупреждение', note: 'Заметка' };
    this.probEl.innerHTML = diags.map(d => `
      <div class="pb pb-${d.severity}" data-line="${d.line}" data-col="${d.col}">
        <div class="pb-h"><span class="pb-ic">${icon[d.severity]}</span><span class="pb-kind">${name[d.severity]}</span><span class="pb-pos">строка ${d.line}:${d.col}</span></div>
        <div class="pb-m">${esc(d.message)}</div>
        ${lines[d.line - 1] !== undefined ? `<code class="pb-src">${esc(lines[d.line - 1].trim())}</code>` : ''}
        ${d.hint ? `<div class="pb-hint">${esc(d.hint).replace(/\n/g, '<br>')}</div>` : ''}
      </div>`).join('');
  }
}
