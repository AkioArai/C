// Панель «компьютера»: вкладки Терминал, Логи, Процессы, Проблемы.
import { esc, typeInfo } from '../universe/explain.js';
import { formatDiag } from '../compiler/diagnostics.js';

const MAX_LOGS = 2500;

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
      </div>
      <div class="con-body">
        <section class="con-pane active" data-pane="term">
          <div class="term" data-term></div>
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
  clear() { this.term.innerHTML = ''; this.out = null; }
  atBottom(el) { return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }
  line(html, cls = '') {
    const stick = this.atBottom(this.term);
    const d = document.createElement('div');
    d.className = 'tl ' + cls;
    d.innerHTML = html;
    this.term.appendChild(d);
    this.out = null;
    if (stick) this.term.scrollTop = this.term.scrollHeight;
    return d;
  }
  stdout(text, cls = 'so') {
    const stick = this.atBottom(this.term);
    if (!this.out) { this.out = document.createElement('div'); this.out.className = 'tl stdout'; this.term.appendChild(this.out); }
    const sp = document.createElement('span');
    sp.className = cls;
    sp.textContent = text;
    this.out.appendChild(sp);
    if (stick) this.term.scrollTop = this.term.scrollHeight;
    if (this.term.childElementCount > 1500) this.term.firstElementChild.remove();
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

  // ——— логи ———
  clearLogs() {
    this.logsEl.innerHTML = '';
    this.logsEl.dataset.filter = this.filter;
    this.logCount = 0;
    this.badge('logs', '');
  }
  log(entry) {
    this.logCount++;
    if (this.logCount > MAX_LOGS) {
      if (this.logCount === MAX_LOGS + 1) {
        const d = document.createElement('div');
        d.className = 'log k-warn';
        d.innerHTML = `<span class="lg-ic"></span><span class="lg-tx">Журнал ограничен ${MAX_LOGS} записями — дальнейшие шаги выполняются без записи. Вселенная и терминал продолжают обновляться.</span>`;
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
    const item = (e, icon, title, sub, desc, extra = '') =>
      `<div class="pi ${extra}" data-ent="${e.id}" ${e.line ? `data-line="${e.line}"` : ''}>
        <span class="pi-ic">${icon}</span>
        <span class="pi-main"><span class="pi-t">${title}</span>${sub ? `<span class="pi-s">${sub}</span>` : ''}${desc ? `<span class="pi-d">${desc}</span>` : ''}</span>
        <span class="pi-xy">(${Math.round(e.x)}, ${Math.round(e.y)})</span>
      </div>`;
    let h = '';
    const count = tr.laws.length + tr.consts.length + tr.regions.reduce((n, r) => n + 1 + r.vars.length + r.structs.length, 0);
    this.badge('proc', count || '');
    if (!count) { this.procEl.innerHTML = '<div class="empty">Пока во вселенной пусто. Процессы появятся после запуска программы.</div>'; return; }
    h += `<div class="pg"><div class="pg-h">Компьютер <span class="pg-n">${esc(state || '')}</span></div>`;
    h += item(scene.entities.get('core'), '', 'Компьютер (процессор + терминал)', 'точка отсчёта вселенной', 'Выполняет код строка за строкой; через него идёт весь ввод (scanf) и вывод (printf).');
    h += '</div>';
    if (tr.laws.length) {
      h += `<div class="pg"><div class="pg-h">Законы вселенной <span class="pg-n">${tr.laws.length}</span></div>`;
      for (const l of tr.laws) h += item(l, '', esc(l.name), esc(l.title), esc(l.funcs.slice(0, 6).join(', ') + (l.funcs.length > 6 ? '…' : '')));
      h += '</div>';
    }
    if (tr.consts.length) {
      h += `<div class="pg"><div class="pg-h">Константы #define <span class="pg-n">${tr.consts.length}</span></div>`;
      for (const c of tr.consts) h += item(c, '', `${esc(c.name)} = ${esc(c.text)}`, `строка ${c.line}`, 'подставляется в код до компиляции');
      h += '</div>';
    }
    for (const { region, vars, structs } of tr.regions) {
      const active = scene.current === region.id;
      h += `<div class="pg ${active ? 'active' : ''}"><div class="pg-h">${esc(region.name)} ${active ? '<span class="live">выполняется</span>' : region.id === 'global' ? '' : '<span class="pg-n">ждёт возврата вызова</span>'}</div>`;
      h += item(region, '', esc(region.name), region.id === 'global' ? 'глобальные переменные' : `кадр стека · глубина ${region.depth} · сейчас строка ${region.probeLine}`,
        region.args?.length ? 'параметры: ' + esc(region.args.map(a => `${a.name}=${a.display}`).join(', ')) : '', 'region');
      for (const s of structs) {
        if (s.kind === 'loop') {
          const st = s.active ? `<span class="live">итерация ${s.iter}</span>` : `завершён: ${s.iterDone ?? s.iter} итер.`;
          h += item(s, '', `${s.loopKind === 'do' ? 'do-while' : s.loopKind} (${esc(s.text)})`, `строки ${s.line}–${s.endLine} · ${st}`,
            `повторяет строки ${s.line}–${s.endLine}, пока условие ${esc(s.text)} истинно`, 'sub');
        } else {
          const v = s.lastValue === undefined ? '' : s.isSwitch ? ` = ${esc(s.switchValue)}` : s.lastValue ? ' → <b class="ok">истина</b>' : ' → <b class="bad">ложь</b>';
          h += item(s, s.isSwitch ? '' : '', `${s.isSwitch ? esc(s.text) : 'if (' + esc(s.text) + ')'}${v}`, `строка ${s.line} · проверено раз: ${s.hits}`,
            s.isSwitch ? 'выбирает ветку case по значению' : 'развилка: выбирает, какой код выполнить', 'sub');
        }
      }
      for (const v of vars) {
        const val = v.isArray ? `[${(v.elems || []).slice(0, 8).map(x => String(x).split(' ')[0]).join(', ')}${v.len > 8 ? ', …' : ''}]` : v.display;
        h += item(v, v.isArray ? '' : v.isParam ? '' : '', `${esc(v.name)} = <b class="v">${esc(val)}</b>`,
          `${esc(v.typeName)} · ${v.size} Б · адрес 0x${v.addr.toString(16)} · объявлена в строке ${v.line} · изменений: ${v.history.length - 1}`,
          v.garbage ? '<b class="bad">содержит мусор — не инициализирована!</b>' : esc(typeInfo(v.typeName)), 'sub');
      }
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
