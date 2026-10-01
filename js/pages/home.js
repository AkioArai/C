// Главная: быстрый старт, прогресс по темам, недавние файлы.
import { LESSONS, TOPICS } from '../content/lessons.js';
import { TASKS, TASK_TOPICS, LEVELS } from '../content/tasks.js';
import { EXAMPLES } from '../content/examples.js';
import { store } from '../store.js';
import { stats as xpStats, ACHIEVEMENTS, icon } from '../ui/xp.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const I = (d) => `<svg class="ic" viewBox="0 0 24 24">${d}</svg>`;

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
    const unsolved = TASKS.filter(t => !solved[t.id]);
    const day = Math.floor(Date.now() / 864e5);
    const daily = unsolved.length ? unsolved[day % unsolved.length] : TASKS[day % TASKS.length];
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const hour = new Date().getHours();
    const hello = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const last = files[0];
    const xp = xpStats();
    const dd = (store.get('drill.daily', {})[new Date().toLocaleDateString('sv')] || { answers: [] }).answers;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const dstat = store.get('drill.stats', { ok: 0, all: 0 });
    // последние 14 дней: были ли занятия
    const days = new Set(xp.days);
    const dx = xp.dayXp || {};
    const days14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
    const maxXp = Math.max(20, ...days14.map(d => dx[d.toLocaleDateString('sv')] || 0));
    const cal = days14.map((d, i) => { const k = d.toLocaleDateString('sv'), v = dx[k] || 0, on = days.has(k); return `<div class="act-col${i === 13 ? ' today' : ''}" title="${d.toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'long' })}: ${v} опыта"><i class="${on ? 'on' : ''}" style="height:${on ? Math.max(10, (v / maxXp) * 100) : 4}%"></i><small>${d.getDate()}</small></div>`; }).join('');
    const gotN = ACHIEVEMENTS.filter(a => xp.got[a.id]).length;
    const achs = ACHIEVEMENTS.map(a => `<div class="ach ${xp.got[a.id] ? 'got' : ''}" title="${a.desc}${xp.got[a.id] ? ' — получено ' + new Date(xp.got[a.id]).toLocaleDateString('ru') : ''}"><i>${icon(a.icon)}</i><b>${a.title}</b><small>${a.desc}</small></div>`).join('');

    const topicRows = TOPICS.filter(t => t.id >= 1 && t.id <= 8).map(t => {
      const ls = lessons.filter(l => l.topic === t.id);
      const ts = TASKS.filter(x => String(x.topic) === String(t.id));
      const done = ls.filter(l => read[l.id]).length + ts.filter(x => solved[x.id]).length;
      const all = ls.length + ts.length;
      return `<button class="hm-topic" data-home="learn:${ls[0]?.id || ''}"><div class="hm-topic-h"><span>${esc(t.title)}</span><b>${pct(done, all)}%</b></div>
        <div class="bar"><i style="width:${pct(done, all)}%"></i></div><small>уроков ${ls.filter(l => read[l.id]).length}/${ls.length} · задач ${ts.filter(x => solved[x.id]).length}/${ts.length}</small></button>`;
    }).join('');
    const lvl = Object.entries(LEVELS).map(([k, v]) => {
      const all = TASKS.filter(t => t.level === k).length, d = TASKS.filter(t => t.level === k && solved[t.id]).length;
      return `<div class="hm-lvl"><span class="lvl lvl-${k}">${v.name}</span><b>${d}<small>/${all}</small></b><div class="bar"><i class="l-${k}" style="width:${pct(d, all)}%"></i></div></div>`;
    }).join('');
    const recent = files.slice(0, 5).map(f => `<button class="hm-file" data-home="file:${f.id}">${I('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')}<span>${esc(f.name)}</span><small>${f.mtime ? new Date(f.mtime).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</small></button>`).join('');
    const featured = ['sum2', 'nested-table', 'ptr-swap', 'list'].map(id => EXAMPLES.find(e => e.id === id)).filter(Boolean);

    this.root.innerHTML = `<div class="home"><div class="home-in">
      <section class="hm-hero">
        <div>
          <div class="kicker">${hello}</div>
          <h1>Вселенная Си</h1>
          <p>Пишите на C и смотрите, что происходит внутри: память, переменные, циклы и каждый шаг — наглядно и с объяснением.</p>
          <div class="hm-cta">
            <button class="btn primary big" data-home="lab">${I('<path d="M7 5l12 7-12 7z"/>')}${last ? `Продолжить: ${esc(last.name)}` : 'Открыть редактор'}</button>
            <button class="btn big" data-home="newfile">${I('<path d="M12 5v14M5 12h14"/>')}Новый файл</button>
            <button class="btn ghost big" data-home="palette">${I('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>')}Найти…<kbd>Ctrl K</kbd></button>
          </div>
        </div>
        <div class="hm-stats">
          <div class="hm-ring" style="--p:${pct(nRead, lessons.length)}"><b>${nRead}</b><small>из ${lessons.length}<br>уроков</small></div>
          <div class="hm-ring alt" style="--p:${pct(nSolved, TASKS.length)}"><b>${nSolved}</b><small>из ${TASKS.length}<br>задач</small></div>
        </div>
      </section>

      <section class="hm-level">
        <div class="hm-lv-main">
          <div class="hm-lv-badge"><small>уровень</small><b>${xp.level}</b></div>
          <div class="hm-lv-txt">
            <div class="hm-lv-row"><b>${xp.xp} опыта</b><span class="muted">до уровня ${xp.level + 1}: ${xp.need - xp.into}</span></div>
            <div class="bar thick"><i style="width:${Math.round((xp.into / xp.need) * 100)}%"></i></div>
            <small class="muted">Опыт дают прочитанные уроки, решённые задачи, верные ответы в тренажёре и запуски программ.</small>
          </div>
        </div>
        <div class="hm-lv-streak">
          <div class="hm-lv-row"><b>${xp.streak} ${xp.streak % 10 === 1 && xp.streak % 100 !== 11 ? 'день' : xp.streak % 10 >= 2 && xp.streak % 10 <= 4 && (xp.streak % 100 < 10 || xp.streak % 100 >= 20) ? 'дня' : 'дней'} подряд</b><span class="muted">опыт за 2 недели</span></div>
          <div class="hm-act">${cal}</div>
        </div>
      </section>

      <section class="hm-grid">
        <button class="hm-card" data-home="learn:${next.id}">
          <div class="hm-card-k">${I('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>')}Следующий урок</div>
          <h3>${esc(next.num)}. ${esc(next.title)}</h3>
          <p>${esc(TOPICS.find(t => t.id === next.topic)?.title || '')}</p>
        </button>
        <button class="hm-card" data-home="task:${daily.id}">
          <div class="hm-card-k">${I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>')}Задача дня</div>
          <h3>${esc(daily.title)}</h3>
          <p><span class="lvl lvl-${daily.level}">${LEVELS[daily.level].name}</span> · ${esc(TASK_TOPICS[daily.topic] || '')}</p>
        </button>
        <button class="hm-card" data-home="drill">
          <div class="hm-card-k">${icon('bolt')}Тренажёр</div>
          <h3>Угадай, что выведет программа</h3>
          <p>${dstat.all ? `Верно ${dstat.ok} из ${dstat.all} · лучшая серия ${xp.best}` : 'Короткие задачки на деление, ++, приоритеты, форматы printf. Минута — и вы разогрелись.'}</p>
        </button>
        <button class="hm-card ${dd.length >= 5 ? 'done' : 'hot'}" data-home="drill:daily">
          <div class="hm-card-k">${icon('star')}Испытание дня</div>
          <h3>${dd.length >= 5 ? `Пройдено: ${dd.filter(Boolean).length} из 5` : dd.length ? `Осталось ${5 - dd.length} из 5` : '5 вопросов на сегодня'}</h3>
          <div class="hm-dd">${Array.from({ length: 5 }, (_, i) => `<i class="${i < dd.length ? (dd[i] ? 'ok' : 'no') : ''}"></i>`).join('')}</div>
          <p>${dd.length >= 5 ? 'Новое испытание появится завтра.' : 'Одинаковые для всех, каждый день новые.'}</p>
        </button>
      </section>

      <div class="hm-cols">
        <section class="hm-sec">
          <h2>Прогресс по темам</h2>
          <div class="hm-topics">${topicRows}</div>
        </section>
        <aside class="hm-side">
          <section class="hm-sec">
            <h2>Задачи по сложности</h2>
            <div class="hm-lvls">${lvl}</div>
          </section>
          <section class="hm-sec">
            <h2>Недавние файлы</h2>
            <div class="hm-files">${recent || '<p class="muted">Пока нет файлов.</p>'}</div>
          </section>
        </aside>
      </div>

      <section class="hm-sec">
        <h2>Попробуйте примеры</h2>
        <div class="hm-ex">${featured.map(ex => `<button class="hm-exi" data-home="example:${ex.id}"><small>${esc(ex.group)}</small><b>${esc(ex.title)}</b><code>${esc(ex.code.split('\n').find(l => /printf|scanf|for|while|->/.test(l))?.trim() || '')}</code></button>`).join('')}</div>
      </section>

      <section class="hm-sec">
        <h2>Достижения <span class="muted">${gotN} из ${ACHIEVEMENTS.length}</span></h2>
        <div class="hm-achs">${achs}</div>
      </section>

      <section class="hm-sec">
        <h2>Полезное</h2>
        <div class="hm-util">
          <button class="hm-u" data-home="tour"><i>${I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.5v.01"/>')}</i><b>Обучение интерфейсу</b><small>Минутная экскурсия по экрану с кодом</small></button>
          ${standalone ? '' : `<button class="hm-u" data-home="install"><i>${I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>')}</i><b>Установить приложение</b><small>Иконка на рабочем столе, работает без интернета</small></button>`}
          <button class="hm-u" data-home="export"><i>${I('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>')}</i><b>Резервная копия</b><small>Прогресс, файлы и настройки — в один файл</small></button>
          <button class="hm-u" data-home="import"><i>${I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>')}</i><b>Восстановить из копии</b><small>Перенести прогресс на другое устройство</small></button>
        </div>
      </section>

      <section class="hm-sec hm-keys">
        <h2>Горячие клавиши</h2>
        <div class="hm-kgrid">
          <span><kbd>F5</kbd> запуск / пауза</span><span><kbd>F10</kbd> шаг</span><span><kbd>Shift</kbd><kbd>F10</kbd> шаг назад</span><span><kbd>Ctrl</kbd><kbd>K</kbd> поиск и команды</span>
          <span><kbd>Ctrl</kbd><kbd>S</kbd> сохранить</span><span><kbd>Ctrl</kbd><kbd>B</kbd> проводник</span><span><kbd>Ctrl</kbd><kbd>J</kbd> терминал</span><span><kbd>Ctrl</kbd><kbd>,</kbd> настройки</span>
        </div>
      </section>
    </div></div>`;
  }
}
