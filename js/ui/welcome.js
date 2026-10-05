// Первый запуск: что это за приложение и с чего начать — два экрана, без лишних настроек.
import { store } from '../store.js';
import { settings } from './settings.js';
import { THEMES } from './theme.js';


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
    const th = settings.get('ui.theme');
    const dots = `<div class="wlc-dots">${[0, 1].map(i => `<i class="${i === this.step ? 'on' : i < this.step ? 'done' : ''}"></i>`).join('')}</div>`;
    const steps = [
      () => `<div class="wlc-hero"><svg class="logo big" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg-w" x1="5" y1="5" x2="27" y2="27" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a593ff"/><stop offset="1" stop-color="#35d6e8"/></linearGradient></defs><path d="M24.4 8.9A11 11 0 1 0 24.4 23.1" fill="none" stroke="url(#lg-w)" stroke-width="3.6" stroke-linecap="round"/><circle cx="16" cy="16" r="2.7" fill="url(#lg-w)"/><g class="lg-orbit spin"><circle cx="27.4" cy="16" r="2.5" fill="#ffc46b"/></g></svg></div>
        <h2>Добро пожаловать во <span class="grad-t">Вселенную Си</span></h2>
        <p class="wlc-sub">Здесь программа на C не просто запускается: вы видите, что происходит у неё внутри, шаг за шагом.</p>
        <div class="wlc-feats">
          <div><i>1</i><b>Понять</b><span>Короткие уроки по методичкам с примерами, которые можно запустить.</span></div>
          <div><i>2</i><b>Потренироваться</b><span>Задачи с автопроверкой: сразу видно, где ошибка.</span></div>
          <div><i>3</i><b>Увидеть</b><span>Запустите код — и смотрите на память и объяснение каждой строки.</span></div>
        </div>
        <div class="wlc-row"><span>Тема</span><div class="seg">${Object.entries(THEMES).map(([k, t]) => `<button class="${k === th ? 'on' : ''}" data-w="theme:${k}">${t.name}</button>`).join('')}</div></div>
        <div class="wlc-nav"><button class="btn ghost" data-w="skip">Пропустить</button>${dots}<button class="btn primary" data-w="next">Дальше</button></div>`,
      () => `<h2>С чего начнём?</h2><p class="wlc-sub">Остальное всегда под рукой: разделы слева и поиск по всему — <kbd>Ctrl</kbd>+<kbd>K</kbd>.</p>
        <div class="wlc-go">
          <button data-w="go:learn"><b>Я только начинаю</b><span>Первый урок: как устроена программа на C и как читать картину памяти.</span></button>
          <button data-w="go:lab"><b>Хочу сразу писать код</b><span>Редактор и поле памяти. Коротко покажем, где что находится.</span></button>
          <button data-w="go:drill"><b>Хочу размяться</b><span>«Угадай, что выведет программа» — задачки на минуту.</span></button>
        </div>
        <div class="wlc-nav"><button class="btn ghost" data-w="back">Назад</button>${dots}<button class="btn ghost" data-w="go:home">На главную</button></div>`,
    ];
    this.el.innerHTML = `<div class="wlc-card" role="dialog" aria-label="Знакомство">${steps[this.step]()}</div>`;
  }
}
