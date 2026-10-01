// Раздел «Практика»: задачи с автоматической проверкой на тестах.
import { TASKS, LEVELS, TASK_TOPICS, STARTER, compareOutput, CHECK_NOTES } from '../content/tasks.js';
import { compile, Interpreter, RuntimeError, formatDiag } from '../compiler/index.js';
import { Editor } from '../ui/editor.js';
import { esc } from '../universe/explain.js';
import { store, confirmClick } from '../store.js';
import { award } from '../ui/xp.js';
import { confetti } from '../ui/fx.js';

const expectedCache = new Map();

function runProgram(compiled, stdin, stepLimit = 4_000_000) {
  const it = new Interpreter(compiled.program, compiled.pp, { stdin, source: compiled.source, stepLimit });
  const gen = it.run();
  try { for (;;) { if (gen.next().done) break; } }
  catch (e) { if (e instanceof RuntimeError) return { output: it.output, error: e, steps: it.steps }; throw e; }
  return { output: it.output, steps: it.steps };
}

export function expectedFor(task, input) {
  const key = task.id + '|' + input;
  if (!expectedCache.has(key)) {
    const c = compile(task.solution);
    expectedCache.set(key, runProgram(c, input + '\n').output);
  }
  return expectedCache.get(key);
}

export function updateProgressPill() {
  const solved = store.get('practice.solved', {});
  const n = TASKS.filter(t => solved[t.id]).length;
  const el = document.querySelector('[data-progress]');
  if (el) { el.textContent = n ? String(n) : ''; el.title = `Решено задач: ${n} из ${TASKS.length}`; }
}

export class PracticePage {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.topic = store.get('practice.topic', 'all');
    this.level = store.get('practice.level', 'all');
    root.innerHTML = `
      <div class="page">
        <div class="prac-side">
          <div class="prac-top">
            <div class="prac-filters" data-ftopic>
              <button class="chip" data-t="all">Все темы</button>
              <button class="chip" data-t="1">Тема 1</button>
              <button class="chip" data-t="2">Тема 2</button>
              <button class="chip" data-t="3">Тема 3</button>
              <button class="chip" data-t="4">Тема 4</button>
              <button class="chip" data-t="sr">Самостоятельные</button>
            </div>
            <div class="seg prac-lv" data-flevel>
              <button data-l="all">Любые</button>
              <button data-l="easy">Лёгкие</button>
              <button data-l="hard">Сложные</button>
              <button data-l="extreme">Экстрим</button>
            </div>
            <div class="prac-prog" data-pprog></div>
          </div>
          <div class="task-list" data-list></div>
        </div>
        <div class="content" style="padding:0" data-main></div>
      </div>`;
    this.list = root.querySelector('[data-list]');
    this.main = root.querySelector('[data-main]');
    root.querySelector('[data-ftopic]').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { this.topic = b.dataset.t; store.set('practice.topic', this.topic); this.renderList(); } });
    root.querySelector('[data-flevel]').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) { this.level = b.dataset.l; store.set('practice.level', this.level); this.renderList(); } });
    updateProgressPill();
  }

  renderList() {
    this.root.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('active', b.dataset.t === this.topic));
    this.root.querySelectorAll('[data-l]').forEach(b => b.classList.toggle('on', b.dataset.l === this.level));
    const solved = store.get('practice.solved', {});
    const items = TASKS.filter(t => (this.topic === 'all' || String(t.topic) === this.topic) && (this.level === 'all' || t.level === this.level));
    const done = items.filter(t => solved[t.id]).length;
    this.root.querySelector('[data-pprog]').innerHTML = `<div class="pp-row"><span>Решено <b>${done}</b> из ${items.length}</span><span class="muted">${items.length ? Math.round((done / items.length) * 100) : 0}%</span></div><div class="bar"><i style="width:${items.length ? (done / items.length) * 100 : 0}%"></i></div>`;
    this.list.innerHTML = items.map(t => `
      <a class="task-item ${this.current?.id === t.id ? 'active' : ''} ${solved[t.id] ? 'solved' : ''}" href="#/practice/${t.id}">
        <span class="ti-st" title="${solved[t.id] ? 'Решено' : 'Ещё не решено'}">${solved[t.id] ? '<svg class="ic" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : TASKS.indexOf(t) + 1}</span>
        <span class="ti-b"><span class="tt">${esc(t.title)}</span>
        <span class="tm"><span class="lvl lvl-${t.level}">${LEVELS[t.level].name}</span><span>${t.topic === 'sr' ? 'Самостоятельная' : 'Тема ' + t.topic}</span></span></span>
      </a>`).join('') || '<div class="empty">Нет задач с такими фильтрами.</div>';
    this.list.querySelector('.task-item.active')?.scrollIntoView({ block: 'nearest' });
  }

  open(id) {
    this.current = TASKS.find(t => t.id === id) || null;
    this.renderList();
    if (!this.current) { this.renderOverview(); return; }
    this.renderTask(this.current);
  }

  renderOverview() {
    const solved = store.get('practice.solved', {});
    const stat = (filter) => { const l = TASKS.filter(filter); return `${l.filter(t => solved[t.id]).length}/${l.length}`; };
    this.main.innerHTML = `<div style="padding:28px clamp(18px,4vw,56px)"><article class="article">
      <div class="kicker">Практикум</div>
      <h1>Задачи: от разминки до экстрима</h1>
      <p>Задачи составлены по темам методических указаний и имеют математический уклон. Каждое решение автоматически проверяется встроенным компилятором на наборе тестов — как в настоящих системах проверки.</p>
      <div class="stats">
        <div class="stat"><b>${stat(() => true)}</b><span>решено всего</span></div>
        <div class="stat"><b>${stat(t => t.level === 'easy')}</b><span>лёгкие</span></div>
        <div class="stat"><b>${stat(t => t.level === 'hard')}</b><span>сложные</span></div>
        <div class="stat"><b>${stat(t => t.level === 'extreme')}</b><span>экстрим</span></div>
      </div>
      <h2>По темам</h2>
      <ul>${Object.entries(TASK_TOPICS).map(([k, v]) => `<li>${v} — решено ${stat(t => String(t.topic) === k)}</li>`).join('')}</ul>
      <h2>Как это работает</h2>
      <ol>
        <li>Выберите задачу слева и прочитайте условие и примеры.</li>
        <li>Напишите решение в редакторе. Ошибки подсвечиваются сразу.</li>
        <li><b>Проверить</b> — программа запускается на всех тестах. Для каждого теста видно: вход, ожидаемый ответ и ваш вывод.</li>
        <li><b>Во вселенной</b> — открыть решение в лаборатории и посмотреть пошагово, что происходит, на входных данных первого примера.</li>
        <li>Застряли? Откройте подсказки по одной. Эталонное решение тоже есть, но попробуйте сначала сами!</li>
      </ol>
      <div class="callout"><div class="ct">Уровни</div><p><b>Лёгкая</b> — прямое применение темы. <b>Сложная</b> — нужно подумать над условием и граничными случаями. <b>Экстрим</b> — несколько идей сразу, переполнения, вложенные циклы, точность вычислений.</p></div>
      <p><a class="btn primary" href="#/practice/${TASKS[0].id}">Начать с первой задачи</a></p>
    </article></div>`;
  }

  renderTask(t) {
    const solved = store.get('practice.solved', {});
    const samples = t.tests.slice(0, t.check === 'exact' ? 1 : 2);
    const mode = t.check || 'tail';
    this.main.innerHTML = `
      <div class="task-view">
        <div class="task-desc"><article class="article">
          <div class="task-top"><div class="kicker">${TASK_TOPICS[t.topic]}</div>
            <nav class="task-nav">${(() => { const i = TASKS.indexOf(t), p = TASKS[i - 1], n = TASKS[i + 1]; return `${p ? `<a class="tb-b" href="#/practice/${p.id}" title="Предыдущая: ${esc(p.title)}">‹</a>` : '<span class="tb-b" aria-disabled="true">‹</span>'}<span>${i + 1} / ${TASKS.length}</span>${n ? `<a class="tb-b" href="#/practice/${n.id}" title="Следующая: ${esc(n.title)}">›</a>` : '<span class="tb-b" aria-disabled="true">›</span>'}`; })()}</nav></div>
          <h1>${esc(t.title)}</h1>
          <div class="task-badges"><span class="pill lvl-${t.level}">${LEVELS[t.level].name}</span>${solved[t.id] ? '<span class="pill ok">✓ решено</span>' : ''}<span class="pill">${t.tests.length} тестов</span></div>
          ${t.text}
          <h3>Входные данные</h3><p>${t.input}</p>
          <h3>Выходные данные</h3><p>${t.output}</p>
          <h3>Пример${samples.length > 1 ? 'ы' : ''}</h3>
          ${samples.map(inp => `<div class="samples"><div><div class="sh">ввод</div><pre>${esc(inp || '(нет)')}</pre></div><div><div class="sh">вывод</div><pre>${esc(expectedFor(t, inp))}</pre></div></div>`).join('')}
          <p class="muted">Тестов: ${t.tests.length}. ${CHECK_NOTES[mode]}</p>
          <div data-hints></div>
          <p><button class="btn small" data-act="hint">Подсказка</button> <button class="btn small ghost" data-act="solution">Эталонное решение</button></p>
          <div data-solution></div>
        </article></div>
        <div class="task-work">
          <div class="toolbar">
            <button class="btn success" data-act="check" title="Проверить на всех тестах (Ctrl+Enter)"><svg class="ic" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Проверить</button>
            <button class="btn" data-act="visual" title="Открыть в лаборатории с входными данными первого примера"><svg class="ic" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg><span>Во вселенной</span></button>
            <button class="btn ghost" data-act="reset" title="Вернуть шаблон"><svg class="ic" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span>Сброс</span></button>
            <span class="muted" style="margin-left:auto;font-size:12px" data-diag-sum></span>
          </div>
          <div class="task-editor" data-ted></div>
          <div class="results" data-results></div>
        </div>
      </div>`;
    const key = 'practice.code.' + t.id;
    this.editor = new Editor(this.main.querySelector('[data-ted]'), {
      onChange: (v) => { store.set(key, v); this.liveCheck(); },
      onRun: () => this.check(t),
    });
    this.editor.value = store.get(key, STARTER);
    this.liveCheck(true);
    this.hintN = 0;
    const q = (s) => this.main.querySelector(s);
    q('[data-act="check"]').addEventListener('click', () => this.check(t));
    q('[data-act="visual"]').addEventListener('click', () => this.opts.openInLab(this.editor.value, samples[0] ? samples[0] + '\n' : '', t.title));
    q('[data-act="reset"]').addEventListener('click', (e) => { if (confirmClick(e.currentTarget, 'Удалить код? Ещё раз')) { this.editor.value = STARTER; store.set(key, STARTER); } });
    q('[data-act="hint"]').addEventListener('click', (e) => {
      if (this.hintN >= t.hints.length) return;
      q('[data-hints]').insertAdjacentHTML('beforeend', `<div class="hint-box"><b>Подсказка ${this.hintN + 1}.</b> ${esc(t.hints[this.hintN])}</div>`);
      this.hintN++;
      if (this.hintN >= t.hints.length) { e.target.disabled = true; e.target.textContent = 'Подсказки закончились'; }
    });
    q('[data-act="solution"]').addEventListener('click', (e) => {
      if (!confirmClick(e.currentTarget, 'Точно показать? Нажмите ещё раз')) return;
      q('[data-solution]').innerHTML = `<div class="codebox"><div class="codebox-head"><span class="t">Эталонное решение</span><button class="btn small" data-act="sol-lab">Во вселенной</button></div><pre>${esc(t.solution)}</pre></div>`;
      q('[data-act="sol-lab"]').addEventListener('click', () => this.opts.openInLab(t.solution, samples[0] ? samples[0] + '\n' : '', t.title + ' (эталон)'));
      e.target.disabled = true;
    });
  }

  liveCheck(now) {
    clearTimeout(this._lc);
    const f = () => {
      const c = compile(this.editor.value);
      this.editor.setDiagnostics(c.diagnostics);
      const e = c.diagnostics.filter(d => d.severity === 'error').length, w = c.diagnostics.length - e;
      const el = this.main.querySelector('[data-diag-sum]');
      if (el) el.innerHTML = e ? `<span class="bad">ошибок: ${e}</span>` : w ? `замечаний: ${w}` : '<span class="ok">без ошибок</span>';
    };
    if (now) f(); else this._lc = setTimeout(f, 450);
  }

  async check(t) {
    const res = this.main.querySelector('[data-results]');
    const btn = this.main.querySelector('[data-act="check"]');
    const c = compile(this.editor.value);
    this.editor.setDiagnostics(c.diagnostics);
    if (!c.ok) {
      res.innerHTML = `<div class="res-sum bad">Ошибка компиляции — решение не запускалось</div>` +
        c.errors.map(d => `<div class="res-diag">${esc(formatDiag(d, c.lines).join('\n'))}${d.hint ? '\n' + esc(d.hint) : ''}</div>`).join('');
      return;
    }
    btn.disabled = true;
    const mode = t.check || 'tail';
    const results = [];
    res.innerHTML = '<div class="res-sum">Проверяем…</div>';
    for (let i = 0; i < t.tests.length; i++) {
      await new Promise(r => setTimeout(r, 0));
      const input = t.tests[i];
      const exp = expectedFor(t, input);
      let r;
      try { r = runProgram(c, input + '\n'); } catch (e) { r = { output: '', error: { message: String(e.message || e) } }; }
      const pass = !r.error && compareOutput(r.output, exp, mode);
      results.push({ input, exp, got: r.output, error: r.error, pass });
      res.querySelector('.res-sum').textContent = `Тест ${i + 1} из ${t.tests.length}…`;
    }
    btn.disabled = false;
    const passed = results.filter(r => r.pass).length;
    const all = passed === results.length;
    if (all) {
      const solved = store.get('practice.solved', {});
      const first = !solved[t.id];
      solved[t.id] = true;
      store.set('practice.solved', solved);
      award('task', { first, level: t.level });
      if (first) { const r = btn.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2); }
      updateProgressPill();
      this.renderList();
    }
    const firstFail = results.findIndex(r => !r.pass);
    res.innerHTML = `<div class="res-head"><div class="res-sum ${all ? 'ok' : 'bad'}">${all ? 'Все тесты пройдены! Задача решена.' : `Пройдено ${passed} из ${results.length} тестов`}</div>
      <div class="res-chips">${results.map((r, i) => `<button class="${r.pass ? 'ok' : 'no'}" data-rt="${i}" title="Тест ${i + 1}">${r.pass ? '✓' : '✗'}</button>`).join('')}</div></div>` +
      results.map((r, i) => `<details class="res-test ${r.pass ? 'pass' : 'fail'}" ${i === firstFail ? 'open' : ''}>
        <summary>${r.pass ? '' : ''} Тест ${i + 1}${r.error ? ' — ошибка выполнения' : r.pass ? '' : ' — неверный ответ'}</summary>
        <div class="res-grid">
          <div><span>Ввод</span><pre>${esc(r.input || '(нет)')}</pre></div>
          <div><span>Ожидалось</span><pre>${esc(r.exp)}</pre></div>
          <div><span>Ваш вывод</span><pre>${esc(r.got)}${r.error ? `\n<span class="bad">${esc(r.error.message)} (строка ${r.error.line})</span>` : ''}</pre></div>
        </div>
      </details>`).join('') +
      (!all ? `<p class="muted" style="font-size:12.5px;margin:6px 2px">Совет: нажмите «Во вселенной» и выполните программу пошагово на этом входе, чтобы увидеть, где значения расходятся с ожидаемыми.</p>` : '');
    res.onclick = (e) => {
      const c = e.target.closest('[data-rt]');
      if (!c) return;
      const d = res.querySelectorAll('.res-test')[+c.dataset.rt];
      res.querySelectorAll('.res-test').forEach(x => { x.open = x === d; });
      d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  }
}
