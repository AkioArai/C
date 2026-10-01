// Прогресс ученика: опыт, уровни, серия дней подряд и достижения.
// Всё хранится в браузере; события присылают лаборатория, теория, задачи и тренажёр.
import { store } from '../store.js';
import { confetti } from './fx.js';

const KEY = 'xp';
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD в местном времени

export const ACHIEVEMENTS = [
  { id: 'run1', title: 'Первый запуск', desc: 'Запустить программу', icon: 'play' },
  { id: 'run25', title: 'Испытатель', desc: 'Запустить программы 25 раз', icon: 'play' },
  { id: 'back1', title: 'Машина времени', desc: 'Сделать шаг назад во время выполнения', icon: 'back' },
  { id: 'file1', title: 'Свой проект', desc: 'Создать собственный файл', icon: 'file' },
  { id: 'lesson1', title: 'Читатель', desc: 'Открыть первый урок', icon: 'book' },
  { id: 'lesson10', title: 'Теоретик', desc: 'Прочитать 10 уроков', icon: 'book' },
  { id: 'task1', title: 'Первое решение', desc: 'Решить задачу', icon: 'target' },
  { id: 'task10', title: 'Решала', desc: 'Решить 10 задач', icon: 'target' },
  { id: 'extreme1', title: 'Экстремал', desc: 'Решить задачу уровня «Экстрим»', icon: 'bolt' },
  { id: 'drill10', title: 'Зоркий глаз', desc: '10 верных ответов в тренажёре', icon: 'eye' },
  { id: 'combo5', title: 'Серия ×5', desc: '5 верных ответов в тренажёре подряд', icon: 'bolt' },
  { id: 'combo15', title: 'Серия ×15', desc: '15 верных ответов подряд', icon: 'bolt' },
  { id: 'daily1', title: 'Испытание дня', desc: 'Пройти ежедневное испытание', icon: 'star' },
  { id: 'daily5', title: 'Пять из пяти', desc: 'Ответить верно на все вопросы испытания дня', icon: 'star' },
  { id: 'streak3', title: 'Три дня подряд', desc: 'Заниматься 3 дня подряд', icon: 'flame' },
  { id: 'streak7', title: 'Неделя', desc: 'Заниматься 7 дней подряд', icon: 'flame' },
  { id: 'share1', title: 'Поделился', desc: 'Скопировать ссылку на свой код', icon: 'share' },
  { id: 'level5', title: 'Уровень 5', desc: 'Набрать 5-й уровень', icon: 'star' },
];

const ICONS = {
  play: '<path d="M7 5l12 7-12 7z"/>',
  back: '<path d="M18 5l-9 7 9 7z"/><path d="M6 5v14"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4s.5 2 2 2c0-3 1.5-5.5 1.5-8z"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
};
export const icon = (name) => `<svg class="ic" viewBox="0 0 24 24">${ICONS[name] || ICONS.star}</svg>`;

/** Сколько опыта нужно, чтобы достичь уровня n (уровень 1 — с нуля). */
export const levelStart = (n) => 25 * (n - 1) * n;
export function levelOf(xp) { let n = 1; while (levelStart(n + 1) <= xp) n++; return n; }

function load() {
  return Object.assign({ xp: 0, days: [], got: {}, runs: 0, combo: 0, best: 0, drill: 0, runDay: '', runXp: 0 }, store.get(KEY, {}));
}
let state = load();
const listeners = new Set();
export const onXp = (fn) => listeners.add(fn);

export function stats() {
  const lvl = levelOf(state.xp);
  const from = levelStart(lvl), to = levelStart(lvl + 1);
  return { ...state, level: lvl, into: state.xp - from, need: to - from, streak: streak() };
}

function streak() {
  const set = new Set(state.days);
  let n = 0;
  const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1); // сегодня ещё не занимались — серия жива со вчера
  while (set.has(d.toLocaleDateString('sv'))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/**
 * Сообщить о событии. kind: run, back, file, lesson, task, drill, drillMiss, share, theme.
 * data — подробности (например, уровень задачи).
 */
export function award(kind, data = {}) {
  state = load();
  const before = levelOf(state.xp);
  let gain = 0;
  const t = today();
  if (!state.days.includes(t)) { state.days.push(t); state.days = state.days.slice(-400); }
  if (kind === 'run') {
    state.runs++;
    if (state.runDay !== t) { state.runDay = t; state.runXp = 0; }
    if (state.runXp < 20) { gain = 2; state.runXp += 2; } // за запуски — не больше 20 опыта в день
  }
  if (kind === 'lesson' && data.first) gain = 15;
  if (kind === 'task' && data.first) gain = { easy: 30, hard: 50, extreme: 80 }[data.level] || 30;
  if (kind === 'drill') { state.combo++; state.drill++; state.best = Math.max(state.best, state.combo); gain = 4 + Math.min(state.combo, 10); }
  if (kind === 'drillMiss') state.combo = 0;
  if (kind === 'file') gain = 3;
  if (kind === 'daily') gain = 10 + data.score * 4;
  state.xp += gain;

  const got = [];
  const unlock = (id, cond) => { if (cond && !state.got[id]) { state.got[id] = Date.now(); got.push(ACHIEVEMENTS.find(a => a.id === id)); } };
  const read = Object.keys(store.get('learn.read', {})).length;
  const solved = Object.keys(store.get('practice.solved', {})).length;
  const s = streak();
  unlock('run1', state.runs >= 1);
  unlock('run25', state.runs >= 25);
  unlock('back1', kind === 'back');
  unlock('file1', kind === 'file');
  unlock('lesson1', read >= 1);
  unlock('lesson10', read >= 10);
  unlock('task1', solved >= 1);
  unlock('task10', solved >= 10);
  unlock('extreme1', kind === 'task' && data.level === 'extreme');
  unlock('drill10', state.drill >= 10);
  unlock('combo5', state.combo >= 5);
  unlock('combo15', state.combo >= 15);
  unlock('streak3', s >= 3);
  unlock('streak7', s >= 7);
  unlock('share1', kind === 'share');
  unlock('daily1', kind === 'daily');
  unlock('daily5', kind === 'daily' && data.score === 5);
  for (const a of got) state.xp += 10;
  unlock('level5', levelOf(state.xp) >= 5);
  store.set(KEY, state);

  const after = levelOf(state.xp);
  const ev = { kind, gain: gain + got.length * 10, achievements: got, levelUp: after > before ? after : 0 };
  for (const fn of listeners) fn(ev, stats());
  return ev;
}

// ——— всплывающие награды ———
let host;
function pop(html, cls = '') {
  if (!host) { host = document.createElement('div'); host.className = 'awards'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'award ' + cls;
  el.innerHTML = html;
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), cls ? 3600 : 1600);
  setTimeout(() => el.remove(), cls ? 4100 : 2100);
}
onXp((ev) => {
  if (typeof document === 'undefined') return;
  for (const a of ev.achievements) pop(`<i class="aw-ic">${icon(a.icon)}</i><div><small>Достижение</small><b>${a.title}</b><span>${a.desc}</span></div><em>+10</em>`, 'big');
  if (ev.levelUp) confetti(innerWidth - 160, 80);
  if (ev.levelUp) pop(`<i class="aw-ic">${icon('star')}</i><div><small>Новый уровень</small><b>Уровень ${ev.levelUp}</b><span>Так держать!</span></div>`, 'big lvlup');
  else if (ev.gain && !ev.achievements.length && ev.kind !== 'run') pop(`<b class="aw-xp">+${ev.gain} опыта</b>`);
});
