// Лаборатория: связывает редактор, компилятор, интерпретатор, вселенную и консоль.
import { compile, Interpreter, RuntimeError, HEADERS } from './compiler/index.js';
import { Editor } from './ui/editor.js';
import { ConsolePanel } from './ui/console.js';
import { Scene } from './universe/scene.js';
import { Renderer } from './universe/renderer.js';
import { explain, esc, typeInfo, plural } from './universe/explain.js';
import { renderStep, renderMessage } from './ui/stepview.js';
import { G } from './universe/scene.js';
import { EXAMPLES } from './content/examples.js';
import { store, confirmClick } from './store.js';

const PLAY = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
const SPEEDS = [2200, 1500, 1050, 750, 520, 340, 200, 110, 50, 16];

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
    this.op = this.el('[data-op]');
    this.op.addEventListener('click', (e) => {
      const ln = e.target.closest('[data-line]');
      if (ln) { this.editor.flash(+ln.dataset.line); return; }
      if (e.target.closest('.op-head')) { this.op.classList.toggle('mini'); store.set('lab.opMini', this.op.classList.contains('mini')); this.syncInsets(); }
    });
    if (store.get('lab.opMini', false)) this.op.classList.add('mini');
    new ResizeObserver(() => this.syncInsets()).observe(this.op);
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
    b('back', () => this.stepBack());
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
    this.el('[data-act="reset-code"]')?.addEventListener('click', (e) => {
      if (confirmClick(e.currentTarget, 'Очистить?')) this.load('#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n');
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
      store.set('lab.follow', r.follow);
      e.currentTarget.classList.toggle('on', r.follow);
      if (r.follow) r.lastUser = 0;
    });
    b('legend', () => { const l = this.el('[data-legend]'); l.hidden = !l.hidden; });
    b('full', () => {
      const pane = this.el('.p-universe');
      if (document.fullscreenElement) document.exitFullscreen();
      else pane.requestFullscreen?.().catch(() => {});
    });
    r.follow = store.get('lab.follow', true);
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
    this.updateBack();
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
      this.narrate([{ kind: 'warn', html: `<b>Программа не скомпилировалась:</b> ошибка в строке ${first.line}: ${esc(first.message)}.${first.hint ? `<div class="hint">${esc(first.hint)}</div>` : ''}` }], first.line);
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
    this.runCompile = c;
    this.runStdin = stdin.trim() ? (stdin.endsWith('\n') ? stdin : stdin + '\n') : null;
    this.runFiles = JSON.parse(JSON.stringify(store.get('lab.files', {})));
    this.runHeader = [...this.console.term.children].map(el => [el.innerHTML, el.className.replace(/^tl ?/, '')]);
    this.interp = new Interpreter(c.program, c.pp, { ...this.runOpts(), tracing: mode !== 'instant' });
    this.gen = this.interp.run();
    this.stepNo = 0;
    this.inputLog = [];
    this.mode = mode;
    // камера следует за выполнением, только если пользователь это не выключил
    this.renderer.lastUser = 0;
    if (mode === 'step') { this.setState('paused'); this.advance(); return; }
    this.setState('running');
    this.loop();
  }

  runOpts() {
    return { stdin: this.runStdin, source: this.runCompile.source, stepLimit: 2_000_000, tracing: true, files: JSON.parse(JSON.stringify(this.runFiles || {})) };
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
  /** Шаг назад: программа детерминирована, поэтому её можно тихо перезапустить
   *  и прокрутить до предыдущего шага, подставляя тот же ввод с клавиатуры. */
  updateBack() { const b = this.el('[data-act="back"]'); if (b) b.disabled = !this.canStepBack(); }
  canStepBack() { return !!this.runCompile && this.stepNo > 1 && ['paused', 'input', 'done', 'error'].includes(this.state); }
  stepBack() {
    if (!this.canStepBack()) return;
    const target = this.stepNo - 1;
    const inputs = (this.inputLog || []).slice();
    const c = this.runCompile;
    clearTimeout(this.timer); cancelAnimationFrame(this.rafId);
    this.console.askInput(false);
    this.console.clear(); this.console.clearLogs();
    for (const [h, cls] of this.runHeader) this.console.line(h, cls);
    this.scene.reset(); this.scene.setProgram(c);
    this.interp = new Interpreter(c.program, c.pp, this.runOpts());
    this.gen = this.interp.run();
    this.stepNo = 0; this.inputLog = [];
    this.replaying = true;
    this.setState('paused');
    let guard = 0;
    while (this.stepNo < target - 1 && guard++ < 5_000_000) {
      if (this.advance(true)) continue;
      if (this.interp && this.lastStep?.needInput && inputs.length) {
        const v = inputs.shift();
        if (v === null) { this.console.stdout('^D\n', 'si'); this.inputLog.push(null); this.interp.closeInput(); }
        else { this.console.stdout(v, 'si'); this.inputLog.push(v); this.interp.provideInput(v); }
        continue;
      }
      break;
    }
    this.replaying = false;
    if (this.gen && this.state === 'paused') {
      if (this.lastStep?.needInput && inputs.length) {
        const v = inputs.shift();
        if (v === null) { this.console.stdout('^D\n', 'si'); this.inputLog.push(null); this.interp.closeInput(); }
        else { this.console.stdout(v, 'si'); this.inputLog.push(v); this.interp.provideInput(v); }
      }
      this.mode = 'step';
      this.advance(false);
    }
    this.refreshProcesses(true);
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
    const logFull = this.console.logCount >= 2500;
    for (const ev of step.events) {
      this.scene.apply(ev, dur);
      this.consoleEvent(ev);
      if (!fast || !logFull) {
        const x = explain(ev);
        if (x) this.console.log({ step: this.stepNo, line: ev.line || step.line, html: x.html, kind: x.kind, ent: this.entKey(ev) });
      } else if (this.console.logCount < 2502) this.console.log({});
    }
    this.scene.setLine(step.line);
    this.lastStep = step;
    if (!fast) {
      this.updateBack();
      this.editor.setExecLine(step.line, step.kind === 'input' ? 'input' : '');
      this.showStep(step);
      this.refreshProcesses();
    }
    if (step.done) { this.finish(); return false; }
    if (step.needInput) {
      if (this.replaying) return false;
      this.editor.setExecLine(step.line, 'input');
      this.setState('input');
      this.console.askInput(true);
      this.showOp(renderMessage('ждёт ввода', '<b>Программа ждёт ввода.</b> Функция чтения остановила выполнение: введите значение в терминале внизу и нажмите Enter. Символы попадут в буфер клавиатуры (виден на панели компьютера), и функция заберёт из него то, что ей нужно.', 'io', step.line, this.scene.srcLines));
      this.refreshProcesses(true);
      return false;
    }
    if (!this.replaying && this.breakpoints.has(step.line) && step.kind !== 'enter' && this.lastBp !== this.stepNo - 1) {
      this.lastBp = this.stepNo;
      this.setState('paused');
      clearTimeout(this.timer);
      this.editor.setExecLine(step.line);
      if (fast) this.showStep(step);
      this.refreshProcesses(true);
      return false;
    }
    return true;
  }

  entKey(ev) {
    if (ev.objId) return 'obj:' + ev.objId;
    if (ev.obj?.id) return 'obj:' + ev.obj.id;
    if (ev.frame) return 'frame:' + ev.frame.id;
    if ((ev.type === 'cond' && ev.kind !== 'if') || ev.type.startsWith('loop')) return this.scene.current ? `loop:${this.scene.current}:${ev.nodeId}` : null;
    if (ev.type === 'output' || ev.type === 'input' || ev.type === 'include' || ev.type === 'define') return 'computer';
    return null;
  }

  consoleEvent(ev) {
    switch (ev.type) {
      case 'output':
        if (ev.stream === 'stdout') this.console.stdout(ev.text);
        else if (ev.stream === 'stderr') this.console.stdout(ev.text, 'se');
        break;
      case 'input': if (!this.interp?.interactive && ev.stream === 'stdin' && ev.text) this.echoInput(ev); break;
      case 'runtime-warning': this.console.line(`предупреждение: ${esc(ev.message)}${ev.line ? ` <a class="lnk" data-line="${ev.line}">[строка ${ev.line}]</a>` : ''}${ev.hint ? `<div class="dg-hint">${esc(ev.hint)}</div>` : ''}`, 'warnl'); break;
      case 'uninit': if (!ev.heap) this.console.line(`предупреждение: чтение неинициализированной <b>${esc(ev.path)}</b> — в ней мусор ${esc(ev.display)} <a class="lnk" data-line="${ev.line}">[строка ${ev.line}]</a><div class="dg-hint">Задайте значение перед использованием.</div>`, 'warnl'); break;
      case 'leak': this.console.line(`утечка памяти: ${ev.blocks} ${plural(ev.blocks, 'блок', 'блока', 'блоков')} (${ev.bytes} байт) не освобождено через free`, 'warnl'); break;
      case 'locale': this.console.line(`setlocale: ${ev.comma ? 'русская локаль — дробная часть через запятую' : 'локаль C'}`, 'muted'); break;
      case 'note': this.console.line(esc(ev.text), 'muted'); break;
    }
  }

  // эхо заранее введённых данных: как в терминале — вместе с нажатием Enter
  echoInput(ev) {
    let text = ev.text;
    if (this._echoNl && text.startsWith('\n')) text = text.slice(1);
    this._echoNl = false;
    const rest = (ev.buffer ?? '').slice(ev.consumedLen ?? 0);
    if (!text.endsWith('\n') && /^[ \t\r]*\n/.test(rest)) { text += '\n'; this._echoNl = true; }
    if (text) this.console.stdout(text, 'si file');
  }

  submitInput(v) {
    if (this.state !== 'input' || !this.interp) return;
    this.console.stdout(v + '\n', 'si');
    this.inputLog.push(v + '\n');
    this.interp.provideInput(v + '\n');
    this.scene.inputBuf.text = this.interp.input.text.slice(this.interp.input.pos);
    this.console.askInput(false);
    this.setState('running');
    if (this.mode === 'step') { this.setState('paused'); this.advance(false); return; }
    this.loop();
  }
  submitEOF() {
    if (this.state !== 'input' || !this.interp) return;
    this.console.stdout('^D\n', 'si');
    this.inputLog.push(null);
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
    this.console.line(`Программа завершилась с кодом ${code} · шагов: ${this.stepNo.toLocaleString('ru')}`, code === 0 ? 'okl' : 'warnl');
    this.editor.setExecLine(0);
    this.setState('done');
    this.refreshProcesses(true);
    this.scene.focus = [...this.scene.frames.values()].find(f => f.func === 'main')?.id ?? null;
    this.renderer.lastUser = 0;
    const leak = this.lastStep?.events?.find(e => e.type === 'leak');
    const msg = this.mode === 'instant'
      ? `Программа выполнена мгновенно за ${this.stepNo.toLocaleString('ru')} шагов. Итоговое состояние памяти — перед вами; подробная хроника — во вкладке «Логи».`
      : `Программа завершилась с кодом <b>${code}</b>. Нажмите на любую карточку, чтобы увидеть её историю.`;
    this.showOp(renderMessage('готово', msg + (leak ? ` <span class="bad">Утечка памяти: ${leak.bytes} байт не освобождено.</span>` : ''), 'flow', 0, this.scene.srcLines));
  }

  onRuntimeError(e) {
    this.gen = null;
    this.console.askInput(false);
    if (!(e instanceof RuntimeError)) {
      console.error(e);
      this.console.line(`Внутренняя ошибка среды: ${esc(e.message)}`, 'fail');
      this.setState('error');
      return;
    }
    this.console.line(`Ошибка выполнения в строке ${e.line}: ${esc(e.message)} <a class="lnk" data-line="${e.line}">[перейти]</a>${e.hint ? `<div class="dg-hint">${esc(e.hint)}</div>` : ''}`, 'fail');
    this.console.line(`Программа аварийно завершена · шагов: ${this.stepNo.toLocaleString('ru')}`, 'muted');
    this.console.log({ step: this.stepNo, line: e.line, html: `<b>Ошибка выполнения:</b> ${esc(e.message)}${e.hint ? `<div class="hint">${esc(e.hint)}</div>` : ''}`, kind: 'warn' });
    this.editor.setExecLine(e.line, 'error');
    this.setState('error');
    this.console.show('term');
    this.showOp(renderMessage('ошибка', `<b>${esc(e.message)}</b>${e.hint ? `<div class="hint">${esc(e.hint)}</div>` : ''}`, 'warn', e.line, this.scene.srcLines));
    this.refreshProcesses(true);
  }

  // ——— панель «Операция» ———
  showStep(step) {
    this.showOp(renderStep(step, { stepNo: this.stepNo, srcLines: this.scene.srcLines }));
  }
  showOp(html) {
    this.op.innerHTML = html;
    this.op.hidden = false;
    this.syncInsets();
  }
  narrate(entries, line) {
    const x = entries[0];
    this.showOp(renderMessage('компиляция', x.html, x.kind, line, this.editor.value.split('\n')));
  }
  syncInsets() {
    const h = this.op.hidden ? 0 : this.op.getBoundingClientRect().height + 16;
    this.renderer.setInsets({ bottom: h, top: 0 });
  }

  refreshProcesses(force) {
    const now = performance.now();
    if (!force && now - (this._lastProc || 0) < 250) return;
    this._lastProc = now;
    this.console.renderProcesses(this.scene, { running: 'выполняется', paused: 'пауза', input: 'ждёт ввода', done: 'завершено', error: 'ошибка' }[this.state] || '');
    if (!this.inspector.hidden && this.inspected) this.inspect(this.resolveKey(this.inspected), true);
  }

  resolveKey(key) {
    const L = this.scene.L;
    if (!key || !L) return null;
    const [kind, a, b] = key.split(':');
    if (kind === 'obj') { const c = L.cards.get(a); return c ? { kind: 'var', key, o: c.o, rect: c } : null; }
    if (kind === 'frame') { const f = L.frames.get(a); return f ? { kind: 'frame', key, fr: f.fr, rect: f } : null; }
    if (kind === 'loop') { const f = L.frames.get(a); const t = f?.traces.find(x => String(x.lp.nodeId) === b); return t ? { kind: 'loop', key, lp: t.lp, fr: f.fr, rect: t } : f ? { kind: 'frame', key: 'frame:' + a, fr: f.fr, rect: f } : null; }
    if (kind === 'computer') return { kind: 'computer', key, rect: L.computer };
    if (kind === 'heap' && L.heap) return { kind: 'heap', key, rect: L.heap };
    return null;
  }

  focusEntity(key) {
    const hit = this.resolveKey(key);
    if (!hit) return;
    this.scene.selected = hit.key;
    this.renderer.focusRect(hit.rect, 1.2);
    this.inspect(hit);
  }

  // ——— паспорт объекта ———
  inspect(hit, quiet) {
    if (!hit) { if (!quiet) { this.inspector.hidden = true; this.inspected = null; } return; }
    this.inspected = hit.key;
    const row = (k, v) => `<div class="in-row"><span>${k}</span><b>${v}</b></div>`;
    let h = '<button class="in-close" data-close aria-label="Закрыть">×</button>';
    if (hit.kind === 'var') {
      const o = hit.o;
      const kindName = o.kind === 'heap' ? 'блок в куче' : o.kind === 'param' ? 'параметр функции' : o.kind === 'global' ? 'глобальная переменная' : o.kind === 'static' ? 'статическая переменная' : o.shape === 'array' ? 'массив' : o.shape === 'record' ? 'структура' : 'переменная';
      h += `<div class="in-kind">${kindName}</div><div class="in-title">${esc(o.name)}</div><div class="in-desc">${esc(typeInfo(o.typeName))}</div>
        ${row('Тип', esc(o.typeName))}
        ${o.shape === 'scalar' ? row('Значение', o.cells[0]?.init ? esc(o.cells[0].desc ? o.cells[0].desc + ' (' + o.cells[0].display + ')' : o.cells[0].display) : '<span class="bad">мусор (не задано)</span>') : ''}
        ${row('Размер', o.size + ' байт')}
        ${row('Адрес', '0x' + o.addr.toString(16))}
        ${o.line ? row('Объявлена', `<a class="lnk" data-line="${o.line}">строка ${o.line}</a>`) : ''}
        ${o.freed ? '<div class="in-warn">Блок освобождён free — пользоваться им нельзя.</div>' : ''}
        ${o.shape !== 'scalar' ? `<div class="in-sub">Ячейки</div><div class="in-hist">${o.cells.slice(0, 40).map(c => `<div><span>${esc(o.name + c.label)}</span><span>${esc(c.typeName)}</span><b>${c.init ? esc(c.desc || c.display) : '?'}</b></div>`).join('')}</div>` : ''}
        <div class="in-sub">История изменений</div>
        <div class="in-hist">${(o.ui?.history || []).slice(-14).map(x => `<div data-line="${x.line}"><span>стр. ${x.line}</span><span>${esc({ decl: 'объявление', param: 'параметр', assign: 'присваивание', compound: 'составное присв.', inc: 'инкремент', scanf: 'ввод scanf', global: 'глобальная', static: 'static', malloc: 'malloc', calloc: 'calloc' }[x.how] || x.how || '')}</span><b>${esc(x.display)}</b></div>`).join('')}</div>`;
    } else if (hit.kind === 'frame') {
      const fr = hit.fr;
      h += `<div class="in-kind">кадр стека</div><div class="in-title">${esc(fr.func)}()</div>
        <div class="in-desc">Каждый вызов функции получает свой кадр в стеке: параметры и локальные переменные. После return кадр исчезает.</div>
        ${row('Глубина вызова', fr.depth)}
        ${row('Код', `<a class="lnk" data-line="${fr.span.start}">строки ${fr.span.start}–${fr.span.end}</a>`)}
        ${row('Текущая строка', fr.curLine)}
        ${fr.args?.length ? row('Параметры', esc(fr.args.map(a => `${a.name}=${a.display}`).join(', '))) : ''}
        ${fr.ret != null ? row('Вернула', esc(fr.ret)) : ''}
        ${row('Переменных', fr.vars.length)}`;
    } else if (hit.kind === 'loop') {
      const lp = hit.lp;
      h += `<div class="in-kind">цикл ${lp.kind === 'do' ? 'do-while' : lp.kind}</div><div class="in-title">${esc(lp.head || lp.text)}</div>
        <div class="in-desc">Повторяет строки ${lp.line}–${lp.endLine}, пока условие <code>${esc(lp.text)}</code> истинно. Таблица трассировки показывает значения переменных после каждой итерации.</div>
        ${row('Состояние', lp.active ? `выполняется, итерация ${lp.iter}` : `завершён (${lp.exitReason === 'break' ? 'break' : 'условие ложно'})`)}
        ${row('Итераций', lp.active ? lp.iter : lp.iters ?? lp.iter)}
        ${row('Всего итераций', lp.total || 0)}
        ${row('Запусков цикла', lp.runs || 1)}
        ${row('Строки', `<a class="lnk" data-line="${lp.line}">${lp.line}–${lp.endLine}</a>`)}`;
    } else if (hit.kind === 'line') {
      this.editor.flash(hit.line);
      return;
    } else if (hit.kind === 'computer') {
      const sc = this.scene;
      h += `<div class="in-kind">компьютер</div><div class="in-title">Экран и клавиатура</div>
        <div class="in-desc">Слева — экран: всё, что вывели printf/puts/putchar. Значок ↵ означает символ \\n — переход на новую строку. Справа — буфер клавиатуры: введённые символы лежат там, пока их не заберут scanf/getchar; пробелы показаны точками, Enter — знаком ↵.</div>
        ${row('Состояние', { idle: 'готов', running: 'выполняет', paused: 'пауза', input: 'ждёт ввода', done: 'завершил', error: 'авария', cerror: 'ошибка компиляции' }[this.state])}
        ${row('Шагов выполнено', this.stepNo || 0)}
        ${row('Строк на экране', sc.screen.lines.length - 1)}
        ${sc.locale === 'ru' ? row('Локаль', 'русская (запятая)') : ''}
        <div class="in-sub">Подключённые библиотеки</div>
        <div class="in-fns">${sc.headers.map(x => `<div><code>${esc(x.name)}</code> — ${esc(HEADERS[x.name].law)}</div>`).join('') || '<div>нет</div>'}</div>
        ${sc.defines.length ? `<div class="in-sub">#define</div><div class="in-fns">${sc.defines.map(d => `<div><code>${esc(d.name)}${d.params ? '(' + esc(d.params.join(', ')) + ')' : ''}</code> → ${esc(d.text)}</div>`).join('')}</div>` : ''}`;
    } else if (hit.kind === 'heap') {
      h += `<div class="in-kind">куча</div><div class="in-title">Динамическая память</div><div class="in-desc">Блоки, выделенные malloc/calloc/realloc. Они живут, пока их не освободят free, — даже после выхода из функции. Забытый free — утечка памяти.</div>`;
    } else { this.inspector.hidden = true; return; }
    this.inspector.innerHTML = h;
    this.inspector.hidden = false;
  }

  onFrame(r) {
    if (!r.mouse) { this.coords.textContent = `масштаб ${r.cam.zoom.toFixed(2)}`; return; }
    const w = r.toWorld(r.mouse.x, r.mouse.y);
    this.coords.textContent = `(${Math.round(w.x)}, ${Math.round(w.y)}) · масштаб ${r.cam.zoom.toFixed(2)}`;
  }
}
