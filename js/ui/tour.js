// Мини-обучение интерфейсу: экран затемняется, светится только нужный элемент.
import { store } from '../store.js';

const STEPS = [
  { sel: '.p-editor .editor-host', title: 'Здесь вы пишете код', text: 'Ошибки подчёркиваются сразу. При наборе появляются подсказки: напечатайте <code>prf</code> — появится <code>printf</code>, нажмите <kbd>→</kbd> или <kbd>Enter</kbd>. Шаблоны <code>for</code>, <code>if</code>, <code>main</code> разворачиваются целиком.' },
  { sel: '[data-ed="files"]', title: 'Файлы и примеры', text: 'Ваши программы и готовые примеры по темам. Пример можно сразу запустить, а если начать его менять, он станет вашим файлом. Всё сохраняется в браузере.' },
  { sel: '[data-player]', title: 'Запуск и шаги', text: '<b>Запуск</b> (<kbd>F5</kbd>) выполняет программу с анимацией. <b>Один шаг</b> (<kbd>F10</kbd>) — по одной строке, чтобы всё разглядеть. Ползунок — перемотка: вернитесь к любому пройденному шагу.' },
  { sel: '.p-universe canvas', title: 'Память программы', text: 'Сверху — компьютер: экран и клавиатура. Ниже — функции и их переменные. <span class="tour-red">Красная штриховка</span> — «мусор»: переменной ещё ничего не присвоено. Поле можно двигать и приближать.', pad: -40 },
  { sel: '[data-op]', fallback: '[data-u="op"]', title: 'Объяснение строки', text: 'На каждом шаге здесь объясняется, что сделала текущая строка, откуда взялось значение и почему. Первые шаги каждого запуска — бесплатно, все шаги — в PRO.' },
  { sel: '[data-console] .con-tabs', fallback: '[data-console]', title: 'Терминал', text: '<b>Терминал</b> — вывод программы и ввод с клавиатуры: когда программа ждёт числа, введите его здесь и нажмите Enter. <b>Объяснения</b> — вся хроника по шагам. <b>Ошибки</b> — что не так и как исправить.' },
  { sel: '.rail', title: 'Разделы', text: '<b>Теория</b> — уроки по методичкам, <b>Задачи</b> — практика с автопроверкой, <b>Код</b> — этот экран, <b>Тренажёр</b> — «угадай, что выведет программа». Поиск по всему — <kbd>Ctrl</kbd>+<kbd>K</kbd>.' },
];

export class Tour {
  constructor(opts = {}) {
    this.opts = opts;
    this.i = 0;
    this.root = document.createElement('div');
    this.root.className = 'tour';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="tour-block"></div><div class="tour-hole"></div>
      <div class="tour-tip" role="dialog" aria-live="polite">
        <div class="tour-n"></div><h4></h4><p></p>
        <div class="tour-act"><button class="btn ghost small" data-t="skip">Пропустить</button><span></span>
        <button class="btn small" data-t="prev">Назад</button><button class="btn primary small" data-t="next">Далее</button></div>
      </div>`;
    document.body.appendChild(this.root);
    this.hole = this.root.querySelector('.tour-hole');
    this.tip = this.root.querySelector('.tour-tip');
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      if (b.dataset.t === 'next') this.go(this.i + 1);
      if (b.dataset.t === 'prev') this.go(this.i - 1);
      if (b.dataset.t === 'skip') this.end();
    });
    this.onKey = (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.end();
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); this.go(this.i + 1); }
      if (e.key === 'ArrowLeft') this.go(this.i - 1);
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', () => { if (!this.root.hidden) this.place(); });
  }

  static seen() { return store.get('tour.done', false); }

  start() {
    this.opts.before?.();
    this.root.hidden = false;
    this.go(0);
  }

  end() {
    this.root.hidden = true;
    store.set('tour.done', true);
    this.opts.after?.();
  }

  go(i) {
    if (i >= STEPS.length) { this.end(); return; }
    this.i = Math.max(0, i);
    const s = STEPS[this.i];
    this.tip.querySelector('.tour-n').textContent = `${this.i + 1} из ${STEPS.length}`;
    this.tip.querySelector('h4').textContent = s.title;
    this.tip.querySelector('p').innerHTML = s.text;
    this.tip.querySelector('[data-t="prev"]').disabled = this.i === 0;
    this.tip.querySelector('[data-t="next"]').textContent = this.i === STEPS.length - 1 ? 'Готово' : 'Далее';
    this.place();
  }

  target(s) {
    const vis = (el) => el && el.getClientRects().length && el.getBoundingClientRect().width > 0;
    let el = document.querySelector(s.sel);
    if (!vis(el) && s.fallback) el = document.querySelector(s.fallback);
    if (!vis(el)) return null;
    let r = el.getBoundingClientRect();
    if (s.extra) {
      const e2 = document.querySelector(s.extra);
      if (vis(e2)) {
        const r2 = e2.getBoundingClientRect();
        const x = Math.min(r.left, r2.left), y = Math.min(r.top, r2.top);
        r = { left: x, top: y, width: Math.max(r.right, r2.right) - x, height: Math.max(r.bottom, r2.bottom) - y };
      }
    }
    return r;
  }

  place() {
    const s = STEPS[this.i];
    const r = this.target(s);
    const W = innerWidth, H = innerHeight;
    if (!r) { this.go(this.i + 1); return; }
    const pad = s.pad ?? 6;
    const hx = Math.max(4, r.left - pad), hy = Math.max(4, r.top - pad);
    const hw = Math.min(W - 8, r.width + pad * 2), hh = Math.min(H - 8, r.height + pad * 2);
    Object.assign(this.hole.style, { left: hx + 'px', top: hy + 'px', width: hw + 'px', height: hh + 'px' });
    // подсказка: справа, слева, снизу или сверху — где больше места
    const tw = Math.min(340, W - 32);
    this.tip.style.width = tw + 'px';
    const th = this.tip.offsetHeight || 170;
    const cand = [
      { x: hx + hw + 14, y: hy, ok: hx + hw + 14 + tw < W - 12 },
      { x: hx - tw - 14, y: hy, ok: hx - tw - 14 > 12 },
      { x: hx, y: hy + hh + 14, ok: hy + hh + 14 + th < H - 12 },
      { x: hx, y: hy - th - 14, ok: hy - th - 14 > 12 },
    ];
    const c = cand.find(k => k.ok) || { x: (W - tw) / 2, y: (H - th) / 2 };
    this.tip.style.left = Math.max(12, Math.min(W - tw - 12, c.x)) + 'px';
    this.tip.style.top = Math.max(12, Math.min(H - th - 12, c.y)) + 'px';
  }
}
