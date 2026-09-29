// Лаборатория: связывает редактор, компилятор, интерпретатор, вселенную и консоль.
import { compile, Interpreter, RuntimeError, HEADERS } from './compiler/index.js';
import { Editor } from './ui/editor.js';
import { ConsolePanel } from './ui/console.js';
import { Scene } from './universe/scene.js';
import { Renderer } from './universe/renderer.js';
import { explain, esc, typeInfo, plural } from './universe/explain.js';
import { EXAMPLES } from './content/examples.js';
import { store } from './store.js';

const PLAY = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
const SPEEDS = [2200, 1500, 1050, 750, 520, 340, 200, 110, 50, 16];
const PRIORITY = { warn: 6, io: 5, write: 4, flow: 3, var: 2, law: 1 };

export class Lab {
  constructor(root) {
    this.root = root;
    this.state = 'idle';
    this.speed = store.get('speed', 4);
    this.el = (sel) => root.querySelector(sel);

    this.editor = new Editor(this.el('[data-editor]'), {
      onChange: () => this.onCodeChange(),
      onRun: () => this.run('anim'),
      onBreakpoints: (bp) => { this.breakpoints = bp; },
    });
    this.breakpoints = this.editor.breakpoints;
    this.stdinEl = this.el('[data-stdin]');
    this.console = new ConsolePanel(this.el('[data-console]'), {
      onInput: (v) => this.submitInput(v),
      onEOF: () => this.submitEOF(),
      onJump: (line, col) => this.editor.flash(line, col),
      onEntity: (id) => this.focusEntity(id),
    });
    this.scene = new Scene();
    this.renderer = new Renderer(this.el('[data-canvas]'), this.scene, {
      onSelect: (e) => this.inspect(e),
      onFrame: (r) => this.onFrame(r),
    });
    this.narr = this.el('[data-narr]');
    this.narr.addEventListener('click', (e) => { if (e.target.closest('.nr-head')) this.narr.classList.toggle('mini'); });
    this.inspector = this.el('[data-inspector]');
    this.coords = this.el('[data-coords]');
    this.splash = this.el('[data-splash]');

    this.bindToolbar();
    this.bindUniverseControls();
    this.bindSplitters();
    this.fillExamples();

    const saved = store.get('lab.code', null);
    this.editor.value = saved ?? EXAMPLES[0].code;
    this.stdinEl.value = store.get('lab.stdin', '');
    this.stdinEl.addEventListener('input', () => store.set('lab.stdin', this.stdinEl.value));
    this.setState('idle');
    this.onCodeChange(true);
    this.console.line('<span class="muted">Вселенная Си · встроенный компилятор-интерпретатор C (стандарт C99/C11, модель gcc x86-64).</span>');
    this.console.line('<span class="muted">Нажмите <b>Запуск</b> (или Ctrl+Enter), чтобы скомпилировать и выполнить программу.</span>');
  }

  // ——— загрузка кода извне (теория/практика) ———
  load(code, stdin = '', title = '') {
    this.stop(true);
    this.editor.value = code;
    this.stdinEl.value = stdin;
    this.el('.stdin-box').open = !!stdin;
    store.set('lab.stdin', stdin);
    this.onCodeChange(true);
    this.console.clear();
    this.console.line(`<span class="muted">Загружена программа${title ? ' «' + esc(title) + '»' : ''}. Нажмите «Запуск».</span>`);
    this.el('[data-examples]').value = '';
    this.scene.reset();
    this.splash.hidden = false;
  }

  // ——— панель инструментов ———
  bindToolbar() {
    const b = (name, fn) => this.el(`[data-act="${name}"]`).addEventListener('click', fn);
    b('run', () => (this.state === 'paused' ? this.resume() : this.run('anim')));
    b('step', () => this.stepOnce());
    b('pause', () => this.pause());
    b('stop', () => this.stop());
    b('instant', () => this.run('instant'));
    const sp = this.el('[data-speed]');
    sp.value = this.speed;
    sp.addEventListener('input', () => { this.speed = +sp.value; store.set('speed', this.speed); this.updateSpeedLabel(); });
    this.updateSpeedLabel();
    this.el('[data-examples]').addEventListener('change', (e) => {
      const ex = EXAMPLES.find(x => x.id === e.target.value);
      if (ex) this.load(ex.code, ex.stdin || '', ex.title);
      e.target.value = ex ? ex.id : '';
    });
    this.el('[data-act="reset-code"]')?.addEventListener('click', () => {
      if (confirm('Очистить редактор и начать с чистого листа?')) this.load('#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n');
    });
  }

  updateSpeedLabel() {
    const ms = SPEEDS[this.speed - 1];
    const r = 1000 / ms;
    this.el('[data-speed-label]').textContent = `${r < 10 ? r.toFixed(1).replace('.', ',') : Math.round(r)} шаг/с`;
  }

  fillExamples() {
    const sel = this.el('[data-examples]');
    const groups = {};
    for (const ex of EXAMPLES) (groups[ex.group] ||= []).push(ex);
    sel.innerHTML = '<option value="">Примеры программ…</option>' + Object.entries(groups).map(([g, list]) =>
      `<optgroup label="${esc(g)}">${list.map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join('')}</optgroup>`).join('');
  }

  bindUniverseControls() {
    const r = this.renderer;
    const b = (name, fn) => this.el(`[data-u="${name}"]`).addEventListener('click', fn);
    b('zin', () => r.zoomBy(1.3));
    b('zout', () => r.zoomBy(1 / 1.3));
    b('home', () => { r.fitHome(); r.lastUser = performance.now(); });
    b('follow', (e) => {
      r.follow = !r.follow;
      e.currentTarget.classList.toggle('on', r.follow);
      if (r.follow) r.lastUser = 0;
    });
    b('legend', () => { const l = this.el('[data-legend]'); l.hidden = !l.hidden; });
    b('full', () => {
      const pane = this.el('.p-universe');
      if (document.fullscreenElement) document.exitFullscreen();
      else pane.requestFullscreen?.().catch(() => {});
    });
    this.el('[data-u="follow"]').classList.toggle('on', r.follow);
    this.inspector.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { this.inspector.hidden = true; this.scene.selected = null; }
      const ln = e.target.closest('[data-line]');
      if (ln) this.editor.flash(+ln.dataset.line);
    });
    this.el('[data-legend]').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) this.el('[data-legend]').hidden = true; });
    this.splash.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="splash-run"]')) this.run('anim');
      if (e.target.closest('[data-act="splash-close"]')) this.splash.hidden = true;
    });
  }

  bindSplitters() {
    const lab = this.el('.lab');
    const edW = store.get('lab.edW', null), conH = store.get('lab.conH', null);
    if (edW) lab.style.setProperty('--ed-w', edW);
    if (conH) lab.style.setProperty('--con-h', conH);
    for (const sp of this.root.querySelectorAll('[data-split]')) {
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sp.setPointerCapture(e.pointerId);
        const rect = lab.getBoundingClientRect();
        const move = (ev) => {
          if (sp.dataset.split === 'v') {
            const pct = Math.max(22, Math.min(65, ((ev.clientX - rect.left) / rect.width) * 100));
            lab.style.setProperty('--ed-w', pct + '%');
            store.set('lab.edW', pct + '%');
          } else {
            const pct = Math.max(15, Math.min(70, ((rect.bottom - ev.clientY) / rect.height) * 100));
            lab.style.setProperty('--con-h', pct + '%');
            store.set('lab.conH', pct + '%');
          }
        };
        const upF = () => { sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', upF); };
        sp.addEventListener('pointermove', move);
        sp.addEventListener('pointerup', upF);
      });
    }
  }

  // ——— живая проверка кода ———
  onCodeChange(immediate) {
    store.set('lab.code', this.editor.value);
    clearTimeout(this._chk);
    const doCheck = () => {
      if (this.state === 'running' || this.state === 'input' || this.state === 'paused') return;
      const c = compile(this.editor.value);
      this.lastCompile = c;
      this.editor.setDiagnostics(c.diagnostics);
      this.console.setProblems(c.diagnostics, c.lines);
    };
    if (immediate) doCheck(); else this._chk = setTimeout(doCheck, 450);
  }

  // ——— состояние ———
  setState(s) {
    this.state = s;
    this.root.dataset.state = s;
    const runBtn = this.el('[data-act="run"]');
    runBtn.innerHTML = s === 'paused' ? `${PLAY}<span>Продолжить</span>` : `${PLAY}<span>Запуск</span>`;
    const busy = s === 'running' || s === 'input' || s === 'paused';
    this.el('[data-act="pause"]').disabled = s !== 'running';
    this.el('[data-act="stop"]').disabled = !busy;
    this.el('[data-act="run"]').disabled = s === 'running' || s === 'input';
    this.el('[data-act="instant"]').disabled = s === 'input';
    this.el('[data-act="step"]').disabled = s === 'running' || s === 'input';
    this.editor.setReadOnly(busy);
    const labels = {
      idle: ['', 'готов'], running: ['run', 'выполняется'], paused: ['pause', 'пауза'], input: ['input', 'ждёт ввода'],
      done: ['ok', 'завершено'], error: ['err', 'ошибка'], cerror: ['err', 'ошибка компиляции'],
    };
    const [cls, txt] = labels[s] || ['', s];
    this.console.status(txt, cls);
  }

  // ——— запуск ———
  prepare() {
    const src = this.editor.value;
    this.console.clear();
    this.console.clearLogs();
    this.inspector.hidden = true;
    this.splash.hidden = true;
    this.console.line(`<span class="prompt">$</span> gcc -Wall -std=c11 main.c -o main`, 'cmd');
    const c = compile(src);
    this.lastCompile = c;
    this.editor.setDiagnostics(c.diagnostics);
    this.console.setProblems(c.diagnostics, c.lines);
    for (const d of c.diagnostics) this.console.diag(d, c.lines);
    const errs = c.diagnostics.filter(d => d.severity === 'error').length;
    const warns = c.diagnostics.filter(d => d.severity === 'warning').length;
    if (!c.ok) {
      this.console.line(`Компиляция не удалась: ${errs} ${plural(errs, 'ошибка', 'ошибки', 'ошибок')}${warns ? `, ${warns} ${plural(warns, 'предупреждение', 'предупреждения', 'предупреждений')}` : ''}. Исправьте ошибки (они подсвечены в коде) и запустите снова.`, 'fail');
      this.setState('cerror');
      this.console.show('term');
      this.scene.reset();
      const first = c.errors[0];
      this.narrate([{ icon: '', kind: 'warn', html: `<b>Вселенная не может родиться:</b> компилятор нашёл ошибку в строке ${first.line}: ${esc(first.message)}.${first.hint ? `<div class="hint">${esc(first.hint)}</div>` : ''}` }], first.line);
      this.editor.flash(first.line);
      return null;
    }
    this.console.line(`Компиляция успешна${warns ? ` · предупреждений: ${warns} (см. вкладку «Проблемы»)` : ''}`, 'okl');
    this.console.line(`<span class="prompt">$</span> ./main${this.stdinEl.value.trim() ? ' &lt; input.txt' : ''}`, 'cmd');
    return c;
  }

  run(mode) {
    if (this.state === 'running' || this.state === 'input') return;
    if (this.state === 'paused' && mode === 'instant') { this.mode = 'instant'; this.setState('running'); this.loop(); return; }
    const c = this.prepare();
    if (!c) return;
    this.startProgram(c, mode);
  }

  startProgram(c, mode) {
    this.scene.reset();
    this.scene.setProgram(c);
    const stdin = this.stdinEl.value;
    this.interp = new Interpreter(c.program, c.pp, { stdin: stdin.trim() ? (stdin.endsWith('\n') ? stdin : stdin + '\n') : null, source: c.source, stepLimit: 2_000_000 });
    this.gen = this.interp.run();
    this.stepNo = 0;
    this.mode = mode;
    this.renderer.follow = true;
    this.el('[data-u="follow"]').classList.add('on');
    this.renderer.lastUser = 0;
    this.renderer.target = this.renderer.frameFor({ x: 700, y: 0, r: 340, func: 'main' });
    if (mode === 'step') { this.setState('paused'); this.advance(); return; }
    this.setState('running');
    this.loop();
  }

  loop() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.rafId);
    if (this.state !== 'running') return;
    if (this.mode === 'instant') {
      const t0 = performance.now();
      while (this.state === 'running' && performance.now() - t0 < 24) {
        if (!this.advance(true)) break;
      }
      this.refreshProcesses(true);
      if (this.state === 'running') this.rafId = requestAnimationFrame(() => this.loop());
      return;
    }
    this.advance(false);
    if (this.state === 'running') this.timer = setTimeout(() => this.loop(), SPEEDS[this.speed - 1]);
  }

  stepOnce() {
    if (this.state === 'idle' || this.state === 'done' || this.state === 'error' || this.state === 'cerror') {
      const c = this.prepare();
      if (!c) return;
      this.startProgram(c, 'step');
      return;
    }
    if (this.state === 'paused') this.advance(false);
  }
  pause() { if (this.state === 'running') { this.setState('paused'); clearTimeout(this.timer); cancelAnimationFrame(this.rafId); this.refreshProcesses(true); } }
  resume() { if (this.state === 'paused') { this.mode = this.mode === 'instant' ? 'instant' : 'anim'; if (this.mode === 'step') this.mode = 'anim'; this.setState('running'); this.loop(); } }
  stop(silent) {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.rafId);
    const was = this.state;
    this.gen = null;
    this.console.askInput(false);
    this.editor.setExecLine(0);
    if (!silent && (was === 'running' || was === 'paused' || was === 'input')) this.console.line('Выполнение остановлено пользователем.', 'warnl');
    this.setState('idle');
  }

  /** Один шаг интерпретатора. Возвращает false, если выполнение прервалось. */
  advance(fast) {
    if (!this.gen) return false;
    let r;
    try {
      r = this.gen.next();
    } catch (e) {
      this.onRuntimeError(e);
      return false;
    }
    if (r.done) { this.finish(); return false; }
    const step = r.value;
    this.stepNo++;
    const dur = fast ? 0 : Math.min(950, SPEEDS[this.speed - 1] * 0.85);
    const entries = [];
    for (const ev of step.events) {
      this.scene.apply(ev, dur);
      this.consoleEvent(ev);
      if (!fast || this.console.logCount < 2500) {
        const x = explain(ev, this.scene);
        if (x) {
          const ent = ev.id || ev.cell?.id || (ev.nodeId ? `${ev.kind === 'if' ? 'branch' : ev.type === 'switch' ? 'branch' : 'loop'}:${ev.nodeId}:${this.scene.current}` : null) || (ev.header ? 'law:' + ev.header : null) || (ev.type === 'define' ? 'def:' + ev.name : null) || (ev.frame ? ev.frame.id : null);
          entries.push(x);
          this.console.log({ step: this.stepNo, line: ev.line || step.line, icon: x.icon, html: x.html, kind: x.kind, ent });
        }
      } else if (this.console.logCount < 2502) this.console.log({});
    }
    this.scene.setLine(step.line);
    if (!fast) {
      this.editor.setExecLine(step.line, step.kind === 'input' ? 'input' : '');
      if (entries.length) this.narrate(entries, step.line);
      this.refreshProcesses();
    }
    if (step.done) { this.finish(); return false; }
    if (step.needInput) {
      this.editor.setExecLine(step.line, 'input');
      this.setState('input');
      this.console.askInput(true);
      this.narrate([{ icon: '', kind: 'io', html: '<b>Программа ждёт ввода.</b> scanf остановил вселенную: введите значение в терминале внизу и нажмите Enter. Компьютер поймает его лучом и доставит в переменную.' }], step.line);
      this.refreshProcesses(true);
      return false;
    }
    if (this.breakpoints.has(step.line) && step.kind !== 'enter' && this.lastBp !== this.stepNo - 1) {
      this.lastBp = this.stepNo;
      this.setState('paused');
      clearTimeout(this.timer);
      this.editor.setExecLine(step.line);
      this.narrate([{ icon: '', kind: 'flow', html: `Точка останова в строке ${step.line}. Изучите вселенную и нажмите «Шаг» или «Продолжить».` }], step.line);
      this.refreshProcesses(true);
      return false;
    }
    return true;
  }

  consoleEvent(ev) {
    switch (ev.type) {
      case 'output': this.console.stdout(ev.text); break;
      case 'input': if (!this.interp?.interactive && ev.text) this.console.stdout(ev.text.replace(/⏎/g, '\n'), 'si file'); break;
      case 'runtime-warning': this.console.line(`${esc(ev.message)}${ev.line ? ` <a class="lnk" data-line="${ev.line}">[строка ${ev.line}]</a>` : ''}${ev.hint ? `<div class="dg-hint">${esc(ev.hint)}</div>` : ''}`, 'warnl'); break;
      case 'uninit': this.console.line(`чтение неинициализированной переменной <b>${esc(ev.name)}</b> — в ней мусор ${esc(ev.display)} <a class="lnk" data-line="${ev.line}">[строка ${ev.line}]</a><div class="dg-hint">Присвойте переменной начальное значение перед использованием.</div>`, 'warnl'); break;
      case 'locale': this.console.line(`setlocale: ${ev.comma ? 'русская локаль — дробная часть через запятую' : 'локаль C'}`, 'muted'); break;
      case 'note': this.console.line('' + esc(ev.text), 'muted'); break;
    }
  }

  submitInput(v) {
    if (this.state !== 'input' || !this.interp) return;
    this.console.stdout(v + '\n', 'si');
    this.interp.provideInput(v + '\n');
    this.console.askInput(false);
    this.setState('running');
    if (this.mode === 'step') { this.setState('paused'); this.advance(false); return; }
    this.loop();
  }
  submitEOF() {
    if (this.state !== 'input' || !this.interp) return;
    this.console.stdout('^D\n', 'si');
    this.interp.closeInput();
    this.console.askInput(false);
    this.setState('running');
    if (this.mode === 'step') { this.setState('paused'); this.advance(false); return; }
    this.loop();
  }

  finish() {
    const code = this.interp?.exitCode ?? 0;
    this.gen = null;
    this.console.askInput(false);
    this.console.line(`${code === 0 ? '' : ''} Программа завершилась с кодом ${code} · шагов: ${this.stepNo.toLocaleString('ru')}`, code === 0 ? 'okl' : 'warnl');
    this.editor.setExecLine(0);
    this.setState('done');
    this.refreshProcesses(true);
    const mainRegion = [...this.scene.entities.values()].find(e => e.kind === 'region' && e.func === 'main');
    if (mainRegion && this.renderer.follow) this.renderer.target = this.renderer.frameFor(mainRegion);
    if (this.mode === 'instant') this.narrate([{ icon: '', kind: 'flow', html: `Программа выполнена мгновенно за ${this.stepNo.toLocaleString('ru')} шагов. Итоговое состояние вселенной — перед вами; подробная хроника — во вкладке «Логи».` }], 0);
    else this.narrate([{ icon: '', kind: 'flow', html: `Программа завершилась с кодом <b>${code}</b>. Нажмите на любой объект, чтобы узнать его историю.` }], 0);
  }

  onRuntimeError(e) {
    this.gen = null;
    this.console.askInput(false);
    if (!(e instanceof RuntimeError)) {
      console.error(e);
      this.console.line(`Внутренняя ошибка вселенной: ${esc(e.message)}`, 'fail');
      this.setState('error');
      return;
    }
    this.console.line(`Ошибка выполнения в строке ${e.line}: ${esc(e.message)} <a class="lnk" data-line="${e.line}">[перейти]</a>${e.hint ? `<div class="dg-hint">${esc(e.hint)}</div>` : ''}`, 'fail');
    this.console.line(`Программа аварийно завершена · шагов: ${this.stepNo.toLocaleString('ru')}`, 'muted');
    this.console.log({ step: this.stepNo, line: e.line, icon: '', html: `<b>Ошибка выполнения:</b> ${esc(e.message)}${e.hint ? `<div class="hint">${esc(e.hint)}</div>` : ''}`, kind: 'warn' });
    this.editor.setExecLine(e.line, 'error');
    this.setState('error');
    this.console.show('term');
    this.narrate([{ icon: '', kind: 'warn', html: `<b>Катастрофа во вселенной (строка ${e.line}):</b> ${esc(e.message)}${e.hint ? `<div class="hint">${esc(e.hint)}</div>` : ''}` }], e.line);
    this.refreshProcesses(true);
  }

  // ——— повествование ———
  narrate(entries, line) {
    const sorted = [...entries].sort((a, b) => (PRIORITY[b.kind] || 0) - (PRIORITY[a.kind] || 0));
    const top = sorted.slice(0, 2);
    const more = entries.length - top.length;
    this.narr.innerHTML = `
      <div class="nr-head" title="Свернуть/развернуть"><span>Шаг ${this.stepNo || 0}</span>${line ? `<span class="nr-line" data-line="${line}">строка ${line}</span>` : ''}<span class="nr-more">${more > 0 ? `+${more} в логах · ` : ''}<span class="nr-tg"></span></span></div>
      ${top.map(x => `<div class="nr-item k-${x.kind}"><span class="kind-dot"></span><span>${x.html}</span></div>`).join('')}`;
    this.narr.hidden = false;
    this.narr.querySelector('.nr-line')?.addEventListener('click', (e) => { e.stopPropagation(); this.editor.flash(line); });
  }

  refreshProcesses(force) {
    const now = performance.now();
    if (!force && now - (this._lastProc || 0) < 250) return;
    this._lastProc = now;
    this.console.renderProcesses(this.scene, { running: 'выполняется', paused: 'пауза', input: 'ждёт ввода', done: 'завершено', error: 'ошибка' }[this.state] || '');
    if (!this.inspector.hidden && this.scene.selected) this.inspect(this.scene.entities.get(this.scene.selected), true);
  }

  focusEntity(id) {
    const e = this.scene.entities.get(id);
    if (!e) return;
    this.scene.selected = id;
    this.renderer.focusEntity(e);
    this.inspect(e);
  }

  // ——— инспектор объекта ———
  inspect(e, quiet) {
    if (!e) { if (!quiet) this.inspector.hidden = true; return; }
    const row = (k, v) => `<div class="in-row"><span>${k}</span><b>${v}</b></div>`;
    const coord = `(${Math.round(e.x)}, ${Math.round(e.y)})`;
    let h = `<button class="in-close" data-close aria-label="Закрыть"></button>`;
    if (e.kind === 'var') {
      h += `<div class="in-kind">${e.isArray ? 'Массив' : e.isParam ? 'Параметр функции' : 'Переменная'}</div>
        <div class="in-title">${esc(e.name)}</div>
        <div class="in-desc">${esc(typeInfo(e.typeName))}</div>
        ${row('Тип', esc(e.typeName))}
        ${row('Значение', e.isArray ? '[' + esc((e.elems || []).map(x => String(x).split(' ')[0]).join(', ')) + ']' : `<span class="${e.garbage ? 'bad' : 'v'}">${esc(e.display)}</span>`)}
        ${row('Размер в памяти', e.size + ' Б')}
        ${row('Адрес (&' + esc(e.name) + ')', '0x' + e.addr.toString(16))}
        ${row('Где живёт', esc(this.scene.entities.get(e.regionId)?.name || ''))}
        ${row('Координаты', coord)}
        ${row('Объявлена', `<a class="lnk" data-line="${e.line}">строка ${e.line}</a>`)}
        ${e.garbage ? '<div class="in-warn">Значение не было задано — это «мусор» из памяти.</div>' : ''}
        <div class="in-sub">История значений</div>
        <div class="in-hist">${e.history.slice(-14).map((h, i) => `<div data-line="${h.line}"><span>стр. ${h.line}</span><span>${{ decl: 'объявление', param: 'параметр', assign: 'присваивание', compound: 'составное присв.', inc: 'инкремент/декремент', scanf: 'ввод scanf', global: 'глобальная' }[h.how] || h.how}</span><b>${esc(h.display)}</b></div>`).join('')}</div>`;
    } else if (e.kind === 'law') {
      const hd = HEADERS[e.header];
      h += `<div class="in-kind">Закон вселенной (библиотека)</div>
        <div class="in-title">${esc(e.name)}</div>
        <div class="in-desc">${esc(hd.law)}</div>
        ${row('Подключён', `<a class="lnk" data-line="${e.line}">строка ${e.line}</a>`)}
        ${row('Орбита', 'радиус ' + e.radius)}
        <div class="in-sub">Функции</div>
        <div class="in-fns">${Object.entries(hd.funcs).map(([n, f]) => `<div><code>${n}</code> — ${esc(f.desc)}</div>`).join('') || '<div>—</div>'}</div>
        ${Object.keys(hd.consts).length ? `<div class="in-sub">Константы</div><div class="in-fns">${Object.entries(hd.consts).map(([n, c]) => `<div><code>${n}</code> — ${esc(c.desc)}</div>`).join('')}</div>` : ''}`;
    } else if (e.kind === 'const') {
      h += `<div class="in-kind">Символическая константа</div>
        <div class="in-title">${esc(e.name)} = ${esc(e.text)}</div>
        <div class="in-desc">Создана директивой #define. Препроцессор заменяет имя ${esc(e.name)} на текст «${esc(e.text)}» во всём коде ещё до компиляции. Поэтому изменить её во время работы программы нельзя.</div>
        ${row('Определена', `<a class="lnk" data-line="${e.line}">строка ${e.line}</a>`)}
        ${row('Координаты', coord)}`;
    } else if (e.kind === 'region') {
      h += `<div class="in-kind">Область функции (кадр стека)</div>
        <div class="in-title">${esc(e.name)}</div>
        <div class="in-desc">${e.id === 'global' ? 'Глобальные переменные видны во всех функциях и живут всё время работы программы.' : 'Каждый вызов функции создаёт свою область памяти: параметры и локальные переменные. После return область исчезает.'}</div>
        ${e.id !== 'global' ? row('Глубина вызова', e.depth) : ''}
        ${e.span ? row('Код функции', `<a class="lnk" data-line="${e.span.start}">строки ${e.span.start}–${e.span.end}</a>`) : ''}
        ${e.args?.length ? row('Параметры', esc(e.args.map(a => `${a.name}=${a.display}`).join(', '))) : ''}
        ${row('Центр', coord)}
        ${row('Радиус', Math.round(e.r))}
        ${e.ret != null ? row('Возвращает', esc(e.ret)) : ''}
        <div class="in-desc small">Слева — ось строк кода: светящийся зонд показывает, какая строка выполняется. Дуги — циклы, ромбы — развилки if/switch.</div>`;
    } else if (e.kind === 'loop') {
      h += `<div class="in-kind">Цикл ${e.loopKind === 'do' ? 'do-while' : e.loopKind}</div>
        <div class="in-title">${esc(e.head || e.text)}</div>
        <div class="in-desc">Повторяет строки ${e.line}–${e.endLine}, пока условие <code>${esc(e.text)}</code> истинно. Дуга на оси кода показывает возврат к началу цикла.</div>
        ${row('Состояние', e.active ? `выполняется, итерация ${e.iter}` : `завершён (${e.exitReason === 'break' ? 'break' : 'условие ложно'})`)}
        ${row('Итераций в последнем запуске', e.active ? e.iter : (e.iterDone ?? e.iter))}
        ${row('Всего итераций', e.totalIter || 0)}
        ${row('Запусков цикла', e.runs || 1)}
        ${row('Проверок условия', e.hits)}
        ${row('Строки', `<a class="lnk" data-line="${e.line}">${e.line}–${e.endLine}</a>`)}
        ${row('Координаты', coord)}`;
    } else if (e.kind === 'branch') {
      h += `<div class="in-kind">${e.isSwitch ? 'Множественный выбор' : 'Развилка if'}</div>
        <div class="in-title">${esc(e.isSwitch ? e.text : 'if (' + e.text + ')')}</div>
        <div class="in-desc">${e.isSwitch ? 'switch сравнивает значение с метками case и переходит к совпавшей.' : 'Условие вычисляется: не ноль — истина (ветка if), ноль — ложь (ветка else).'}</div>
        ${row('Последний результат', e.isSwitch ? esc(e.switchValue) : e.lastValue ? '<span class="ok">истина</span>' : '<span class="bad">ложь</span>')}
        ${row('Проверено раз', e.hits)}
        ${row('Строка', `<a class="lnk" data-line="${e.line}">${e.line}</a>`)}
        ${row('Координаты', coord)}`;
    } else if (e.kind === 'core') {
      h += `<div class="in-kind">Компьютер</div>
        <div class="in-title">Центр вселенной (0, 0)</div>
        <div class="in-desc">Процессор выполняет программу строка за строкой. Лучи от компьютера — это «обнаружение» переменных, ввод с клавиатуры (scanf, жёлтые) и вывод на экран (printf, зелёные). Вокруг — орбиты подключённых библиотек-законов.</div>
        ${row('Состояние', { idle: 'готов', running: 'выполняет', paused: 'пауза', input: 'ждёт ввода', done: 'завершил', error: 'авария', cerror: 'ошибка компиляции' }[this.state])}
        ${row('Шагов выполнено', this.stepNo || 0)}
        ${this.scene.locale === 'ru' ? row('Локаль', 'русская (запятая)') : ''}`;
    }
    this.inspector.innerHTML = h;
    this.inspector.hidden = false;
  }

  onFrame(r) {
    if (!r.mouse) { this.coords.textContent = `центр (${Math.round(r.cam.x)}, ${Math.round(r.cam.y)}) · масштаб ${r.cam.zoom.toFixed(2)}`; return; }
    const w = r.toWorld(r.mouse.x, r.mouse.y);
    this.coords.textContent = `курсор (${Math.round(w.x)}, ${Math.round(w.y)}) · масштаб ${r.cam.zoom.toFixed(2)}`;
  }
}
