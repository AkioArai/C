// Главная: один понятный путь «понять → потренироваться → писать своё», без лишнего.
import { LESSONS, TOPICS } from '../content/lessons.js';
import { TASKS, TASK_TOPICS, LEVELS } from '../content/tasks.js';
import { EXAMPLES } from '../content/examples.js';
import { store } from '../store.js';
import { stats as xpStats, ACHIEVEMENTS } from '../ui/xp.js';
import { license, paywallOn } from '../license.js';
import { CONFIG } from '../config.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const I = (d) => `<svg class="ic" viewBox="0 0 24 24">${d}</svg>`;
const ARROW = I('<path d="M5 12h14M13 6l6 6-6 6"/>');
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

/** Живая мини-сцена: строка кода → карточка в памяти → объяснение. Крутится по кругу. */
export function demoScene(kind = 'hero') {
  const steps = kind === 'pro'
    ? [
      ['for (i = 1; i <= 3; i++)', 'Проверяем условие: i = 3, 3 ≤ 3 — правда, поэтому заходим в тело цикла ещё раз.', 'i', '3'],
      ['    s = s + i;', 'Берём s (было 3) и i (сейчас 3), складываем: 3 + 3 = 6 и записываем результат обратно в s.', 's', '6'],
      ['printf("%d\\n", s);', 'Вместо %d подставляется значение s — 6. На экран выводится «6», а \\n переводит строку.', '▸', '6'],
    ]
    : [
      ['int a = 5;', 'В памяти появилась ячейка a на 4 байта, в неё записано 5.', 'a', '5'],
      ['int b = a * 2;', 'Берём a (5), умножаем на 2 — получаем 10 и кладём в новую ячейку b.', 'b', '10'],
      ['printf("%d", b);', 'Вместо %d подставляется значение b. На экране появляется 10.', '▸', '10'],
    ];
  return `<div class="demo demo-${kind}" aria-hidden="true">
    <div class="demo-code">${steps.map(([c], i) => `<div class="dl dl${i + 1}"><span class="dn">${i + 1}</span><code>${esc(c)}</code></div>`).join('')}<i class="demo-hl"></i></div>
    <div class="demo-mem">${steps.map(([, , n, v], i) => `<div class="dm dm${i + 1}${n === '▸' ? ' scr' : ''}"><small>${n === '▸' ? 'экран' : 'int ' + esc(n)}</small><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="demo-say">${steps.map(([, t], i) => `<p class="ds ds${i + 1}"><span class="ds-ln">строка ${i + 1}</span>${esc(t)}</p>`).join('')}</div>
  </div>`;
}

export class HomePage {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-home]');
      if (!a) return;
      const [act, arg] = a.dataset.home.split(':');
      this.opts.action(act, arg);
    });
  }

  open() {
    const read = store.get('learn.read', {});
    const solved = store.get('practice.solved', {});
    const files = (store.get('fs.files', []) || []).slice().sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    const lessons = LESSONS.filter(l => l.topic !== 9 && l.topic !== 0);
    const nRead = lessons.filter(l => read[l.id]).length;
    const nSolved = TASKS.filter(t => solved[t.id]).length;
    const next = lessons.find(l => !read[l.id]) || lessons[lessons.length - 1];
    const topic = TOPICS.find(t => t.id === next.topic);
    // следующая задача — из той же темы, что и урок, сначала лёгкие
    const order = { easy: 0, hard: 1, extreme: 2 };
    const unsolved = TASKS.filter(t => !solved[t.id]).sort((a, b) => (String(a.topic) === String(next.topic) ? 0 : 1) - (String(b.topic) === String(next.topic) ? 0 : 1) || order[a.level] - order[b.level]);
    const nextTask = unsolved[0] || TASKS[0];
    const day = Math.floor(Date.now() / 864e5);
    const pool = TASKS.filter(t => !solved[t.id]);
    const daily = pool.length ? pool[day % pool.length] : TASKS[day % TASKS.length];
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const hour = new Date().getHours();
    const hello = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const xp = xpStats();
    const dd = (store.get('drill.daily', {})[new Date().toLocaleDateString('sv')] || { answers: [] }).answers;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const gotN = ACHIEVEMENTS.filter(a => xp.got[a.id]).length;
    const started = nRead + nSolved > 0;
    const lic = license();
    const showPro = paywallOn() && !lic.pro;
    const featured = ['sum2', 'nested-table', 'ptr-swap', 'list'].map(id => EXAMPLES.find(e => e.id === id)).filter(Boolean);
    const minPrice = CONFIG.prices?.[0]?.price?.replace(/\s*\/.*$/, '') || '';

    const ring = (p, n, all) => `<div class="hx-ring" style="--p:${p}"><b data-count="${n}">${n}</b><small>из ${all}</small></div>`;

    this.root.innerHTML = `<div class="home">
      <div class="hm-sky" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="stars"></div></div>
      <div class="home-in stagger">
      <section class="hx-hero">
        <div class="hx-copy">
          <div class="hx-hi"><span class="pulse-dot"></span>${hello}${xp.streak ? ` · ${xp.streak} ${plural(xp.streak, 'день', 'дня', 'дней')} подряд 🔥` : ''}</div>
          <h1>Смотрите, как <span class="grad-t">думает</span> программа</h1>
          <p>Пишете на C — и видите память, каждый шаг и объяснение каждой строки. Сначала понимаете, потом пишете сами.</p>
          <div class="hx-cta">
            <button class="btn primary big" data-home="learn:${next.id}">${started ? 'Продолжить обучение' : 'Начать с первого урока'}${ARROW}</button>
            <button class="btn big" data-home="lab">${I('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>')}Открыть редактор</button>
          </div>
          <div class="hx-next">Следующий урок: <b>${esc(next.num)}. ${esc(next.title)}</b><span>${esc(topic?.title || '')}</span></div>
        </div>
        ${demoScene('hero')}
      </section>

      <section class="hx-path">
        <button class="hx-step" data-home="learn:${next.id}">
          <span class="hx-num">1</span>
          <div class="hx-st"><small>Понять</small><h3>Теория</h3><p>${esc(next.num)}. ${esc(next.title)}</p></div>
          ${ring(pct(nRead, lessons.length), nRead, lessons.length)}
        </button>
        <i class="hx-link" aria-hidden="true"></i>
        <button class="hx-step" data-home="task:${nextTask.id}">
          <span class="hx-num">2</span>
          <div class="hx-st"><small>Потренироваться</small><h3>Задачи</h3><p>${esc(nextTask.title)} · <span class="lvl lvl-${nextTask.level}">${LEVELS[nextTask.level].name}</span></p></div>
          ${ring(pct(nSolved, TASKS.length), nSolved, TASKS.length)}
        </button>
        <i class="hx-link" aria-hidden="true"></i>
        <button class="hx-step" data-home="lab">
          <span class="hx-num">3</span>
          <div class="hx-st"><small>Писать своё</small><h3>Редактор</h3><p>${files.length ? `${files.length} ${plural(files.length, 'файл', 'файла', 'файлов')} · последний ${esc(files[0].name)}` : 'Запустите код и посмотрите на память'}</p></div>
          <div class="hx-ring go">${I('<path d="M7 5l12 7-12 7z"/>')}</div>
        </button>
      </section>

      <section class="hx-row">
        <button class="hx-card" data-home="task:${daily.id}">
          <div class="hx-k">${I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>')}Задача дня</div>
          <h3>${esc(daily.title)}</h3>
          <p><span class="lvl lvl-${daily.level}">${LEVELS[daily.level].name}</span> · ${esc(TASK_TOPICS[daily.topic] || '')}</p>
        </button>
        <button class="hx-card ${dd.length >= 5 ? 'done' : 'hot'}" data-home="drill:daily">
          <div class="hx-k">${I('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>')}Испытание дня</div>
          <h3>${dd.length >= 5 ? `Пройдено: ${dd.filter(Boolean).length} из 5` : dd.length ? `Осталось ${5 - dd.length} из 5` : '5 вопросов на сегодня'}</h3>
          <div class="hx-dd">${Array.from({ length: 5 }, (_, i) => `<i class="${i < dd.length ? (dd[i] ? 'ok' : 'no') : ''}"></i>`).join('')}</div>
        </button>
        <button class="hx-card hx-lv" data-home="drill">
          <div class="hx-k">${I('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>')}Уровень ${xp.level}</div>
          <h3><span data-count="${xp.xp}">${xp.xp}</span> опыта</h3>
          <div class="bar thick"><i style="width:${Math.round((xp.into / xp.need) * 100)}%"></i></div>
          <p>до уровня ${xp.level + 1}: ${xp.need - xp.into} · достижений ${gotN} из ${ACHIEVEMENTS.length}</p>
        </button>
      </section>

      ${showPro ? `<section class="hx-pro">
        <div class="hx-pro-copy">
          <div class="pro-kick"><span>PRO</span>Объяснение каждой строки</div>
          <h2>Как личный преподаватель, который никогда не устаёт</h2>
          <p>Нажали «Запуск» — и рядом с каждой выполненной строкой появляется понятное объяснение: что она делает, откуда взялось значение и почему получилось именно так.</p>
          <ul class="pro-ticks"><li>Каждый шаг — простыми словами, без терминов «на вырост»</li><li>Полная хроника выполнения: вернитесь к любой строке</li><li>Плюс все темы, 60+ задач и тренажёры</li></ul>
          <div class="hx-cta"><a class="btn primary big" href="#/pro/buy">Открыть PRO${minPrice ? ` · от ${esc(minPrice)}` : ''}${ARROW}</a><a class="btn ghost big" href="#/pro">У меня есть ключ</a></div>
        </div>
        ${demoScene('pro')}
      </section>` : ''}

      <section class="hx-sec">
        <h2>Запустите пример — и посмотрите внутрь</h2>
        <div class="hx-ex">${featured.map((ex, i) => `<button class="hx-exi" data-home="example:${ex.id}" style="--i:${i}"><small>${esc(ex.group)}</small><b>${esc(ex.title)}</b><code>${esc(ex.code.split('\n').find(l => /printf|scanf|for|while|->/.test(l))?.trim() || '')}</code><span class="hx-play">${I('<path d="M7 5l12 7-12 7z"/>')}</span></button>`).join('')}</div>
      </section>

      <footer class="hx-foot">
        <button data-home="tour">${I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.5v.01"/>')}Как пользоваться</button>
        ${standalone ? '' : `<button data-home="install">${I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>')}Установить приложение</button>`}
        <button data-home="export">${I('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>')}Сохранить прогресс в файл</button>
        <button data-home="import">${I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>')}Загрузить прогресс</button>
        <a href="#/pro/terms">Соглашение</a><a href="#/pro/privacy">Конфиденциальность</a>
      </footer>
    </div></div>`;
    countUp(this.root);
  }
}

/** Числа «набегают» от нуля — один раз при открытии. */
function countUp(root) {
  if (document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count;
    if (!to) continue;
    const t0 = performance.now(), dur = Math.min(1200, 400 + to * 15);
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  }
}
