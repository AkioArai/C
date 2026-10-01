// Мастер первого запуска: знакомство, тема, размер интерфейса и с чего начать.
import { store } from '../store.js';
import { settings } from './settings.js';
import { THEMES } from './theme.js';

const ACC = ['#c8f05a', '#e9d85c', '#7fd6c2', '#86b4f5', '#f0a36b', '#d9a6f0'];

export class Welcome {
  static seen() { return !!store.get('welcome.done', false); }

  constructor({ onFinish }) {
    this.onFinish = onFinish;
    this.step = 0;
    this.el = document.createElement('div');
    this.el.className = 'wlc';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-w]');
      if (!t) return;
      const [k, v] = t.dataset.w.split(':');
      if (k === 'next') { this.step++; this.render(); }
      if (k === 'back') { this.step--; this.render(); }
      if (k === 'skip') this.finish(null);
      if (k === 'theme') { settings.set('ui.theme', v); this.render(); }
      if (k === 'accent') { settings.set('ui.accent', v); this.render(); }
      if (k === 'density') { settings.set('ui.density', v); this.render(); }
      if (k === 'fs') { settings.set('ui.fontSize', +v); settings.set('term.fs', +v + 1); this.render(); }
      if (k === 'go') this.finish(v);
    });
    this.render();
  }

  finish(where) {
    store.set('welcome.done', true);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 260);
    this.onFinish?.(where);
  }

  render() {
    const th = settings.get('ui.theme'), acc = settings.get('ui.accent'), den = settings.get('ui.density'), fs = settings.get('ui.fontSize');
    const dots = `<div class="wlc-dots">${[0, 1, 2, 3].map(i => `<i class="${i === this.step ? 'on' : i < this.step ? 'done' : ''}"></i>`).join('')}</div>`;
    const nav = (next = 'Дальше') => `<div class="wlc-nav">${this.step ? '<button class="btn ghost" data-w="back">Назад</button>' : '<button class="btn ghost" data-w="skip">Пропустить</button>'}${dots}<button class="btn primary" data-w="next">${next}</button></div>`;
    const steps = [
      () => `<div class="wlc-hero"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="2.8" fill="currentColor"/><circle cx="26.5" cy="11" r="1.9" fill="currentColor"/></svg></div>
        <h2>Добро пожаловать во Вселенную Си</h2>
        <p class="wlc-sub">Здесь программы на C не просто запускаются — вы видите, что происходит внутри: каждая переменная, каждый шаг цикла, каждый байт ввода.</p>
        <div class="wlc-feats">
          <div><b>Код и память</b><span>Пишете программу — справа живая картина памяти, шаг за шагом и назад.</span></div>
          <div><b>Теория и задачи</b><span>Уроки по методичкам и задачи с автопроверкой на тестах.</span></div>
          <div><b>Тренажёр</b><span>Угадай вывод, найди ошибку, испытание дня — опыт и достижения.</span></div>
        </div>${nav('Настроить под себя')}`,
      () => `<h2>Как будет выглядеть</h2><p class="wlc-sub">Тему и цвет можно сменить в любой момент: кнопка с луной в заголовке или настройки (Ctrl+,).</p>
        <div class="wlc-themes">${Object.entries(THEMES).map(([k, t]) => `<button class="wlc-th ${k === th ? 'on' : ''}" data-w="theme:${k}" style="--b:${t.css['--bg']};--p:${t.css['--panel']};--l:${t.css['--line2']};--t:${t.css['--text']};--m:${t.css['--muted']};--k:${t.css['--syn-kw']};--s:${t.css['--syn-str']}">
          <span class="wlc-mini"><i class="wm-r"></i><i class="wm-ed"><em style="width:60%;background:var(--k)"></em><em style="width:80%"></em><em style="width:45%;background:var(--s)"></em><em style="width:70%"></em></i><i class="wm-mem"><em></em><em></em></i></span><b>${t.name}</b></button>`).join('')}</div>
        <div class="wlc-row"><span>Акцент</span><div class="swatches">${ACC.map(c => `<button class="swc ${c === acc ? 'on' : ''}" style="--c:${c}" data-w="accent:${c}" aria-label="${c}"></button>`).join('')}</div></div>${nav()}`,
      () => `<h2>Удобный размер</h2><p class="wlc-sub">Выберите, чем вы пользуетесь чаще — кнопки и отступы подстроятся.</p>
        <div class="wlc-opts">${[['compact', 'Ноутбук', 'больше места для кода'], ['normal', 'Универсально', 'золотая середина'], ['touch', 'Планшет', 'крупные кнопки для пальцев']].map(([k, n, d]) => `<button class="wlc-opt ${k === den ? 'on' : ''}" data-w="density:${k}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
        <div class="wlc-row"><span>Размер текста</span><div class="seg">${[12, 13, 14, 15].map(v => `<button class="${v === fs ? 'on' : ''}" data-w="fs:${v}" style="font-size:${v}px">Аа</button>`).join('')}</div></div>
        <pre class="wlc-code"><span class="t-kw">for</span> (<span class="t-type">int</span> i = <span class="t-num">0</span>; i &lt; n; i++)
    sum += i;   <span class="t-com">/* так будет выглядеть код */</span></pre>${nav()}`,
      () => `<h2>С чего начнём?</h2><p class="wlc-sub">Можно выбрать что угодно — всё остальное всегда под рукой слева и в поиске (Ctrl+K).</p>
        <div class="wlc-go">
          <button data-w="go:learn"><b>Я только начинаю</b><span>Первый урок: как устроена программа на C и как читать картину памяти.</span></button>
          <button data-w="go:lab"><b>Хочу сразу писать код</b><span>Редактор и поле памяти с примером. Покажем, где что находится.</span></button>
          <button data-w="go:drill"><b>Хочу размяться</b><span>Тренажёр «Угадай вывод»: короткие задачки на одну минуту.</span></button>
        </div>
        <div class="wlc-nav"><button class="btn ghost" data-w="back">Назад</button>${dots}<button class="btn ghost" data-w="go:home">На главную</button></div>`,
    ];
    this.el.innerHTML = `<div class="wlc-card" role="dialog" aria-label="Знакомство">${steps[this.step]()}</div>`;
  }
}
