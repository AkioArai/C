// Маршрутизация между разделами: Главная, Код (лаборатория), Теория, Практика.
import { Lab } from './lab.js';
import { LearnPage } from './pages/learn.js';
import { PracticePage, updateProgressPill } from './pages/practice.js';
import { HomePage } from './pages/home.js';
import { DrillPage } from './pages/drill.js';
import { stats as xpStats, onXp } from './ui/xp.js';
import { initPwa, install, canInstall, isStandalone, onInstallChange } from './ui/install.js';
import { exportAll, importAll } from './ui/backup.js';
import { Welcome } from './ui/welcome.js';
import { Tour } from './ui/tour.js';
import { Palette } from './ui/palette.js';
import { settings, applyUi, SettingsDialog } from './ui/settings.js';
import { THEMES } from './ui/theme.js';
import { EXAMPLES } from './content/examples.js';
import { LESSONS, TOPICS } from './content/lessons.js';
import { TASKS, LEVELS } from './content/tasks.js';
import { store } from './store.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

applyUi();
initPwa();
settings.on((k) => { if (k.startsWith('ui.') || k.startsWith('editor.')) applyUi(); });
const settingsDlg = new SettingsDialog();
$('[data-settings]').addEventListener('click', () => settingsDlg.open());
$('[data-sb="settings"]').addEventListener('click', () => settingsDlg.open());
$('[data-sb="problems"]').addEventListener('click', () => { go('lab'); setTimeout(() => lab?.console.show('prob'), 30); });
// «Код» в панели активности: повторное нажатие прячет/показывает проводник
$('[data-explorer]').addEventListener('click', (e) => {
  if (currentView === 'lab' && lab) { e.preventDefault(); lab.toggleSide(); }
});

let lab, learn, practice, home, drill, currentView = '';

function ensure(name) {
  if (name === 'lab' && !lab) lab = new Lab(document.getElementById('view-lab'), { openSettings: (cat) => settingsDlg.open(cat), onCrumb: () => crumb(), toggleZen });
  if (name === 'drill' && !drill) drill = new DrillPage(document.getElementById('view-drill'), { openInLab });
  if (name === 'learn' && !learn) learn = new LearnPage(document.getElementById('view-learn'), { openInLab });
  if (name === 'practice' && !practice) practice = new PracticePage(document.getElementById('view-practice'), { openInLab });
  if (name === 'home' && !home) home = new HomePage(document.getElementById('view-home'), { action: homeAction });
}
function go(name) { if (!location.hash.startsWith('#/' + name)) location.hash = '#/' + name; }

function openInLab(code, stdin = '', title = '') {
  ensure('lab');
  go('lab');
  lab.load(code, stdin, title);
}
function openFile(id) { ensure('lab'); go('lab'); lab.ws.switchTo(id); }
function openExample(ex) { ensure('lab'); go('lab'); lab.ws.openExample(ex); }

function homeAction(act, arg) {
  if (act === 'lab') go('lab');
  else if (act === 'newfile') { ensure('lab'); go('lab'); setTimeout(() => lab.ws.startNew(), 60); }
  else if (act === 'palette') palette.open();
  else if (act === 'learn') location.hash = '#/learn/' + arg;
  else if (act === 'task') location.hash = '#/practice/' + arg;
  else if (act === 'file') openFile(arg);
  else if (act === 'example') { const ex = EXAMPLES.find(e => e.id === arg); if (ex) openExample(ex); }
  else if (act === 'tour') startTour();
  else if (act === 'drill') location.hash = '#/drill/' + (arg || 'quiz');
  else if (act === 'install') install().then(toast);
  else if (act === 'export') exportAll();
  else if (act === 'import') importAll(toast);
}

// ——— «хлебные крошки» в заголовке: где я и что открыто ———
const NAMES = { home: 'Главная', lab: 'Код', learn: 'Теория', practice: 'Задачи', drill: 'Тренажёр' };
function crumb() {
  const el = $('[data-crumb]');
  let tail = '';
  if (currentView === 'lab' && lab?.ws.current) {
    const f = lab.ws.current;
    tail = `<b>${esc(f.name)}</b>${f.preview ? '<em>пример</em>' : ''}${lab.ws.dirty.has(f.id) ? '<i class="dot" title="Есть несохранённые изменения"></i>' : ''}`;
  } else if (currentView === 'learn') {
    const l = LESSONS.find(x => x.id === store.get('learn.last'));
    if (l) tail = `<span>${esc(TOPICS.find(t => t.id === l.topic)?.title.replace(/\..*/, '') || '')}</span><span class="sep">/</span><b>${esc(l.num)}. ${esc(l.title)}</b>`;
  } else if (currentView === 'practice') {
    const id = (location.hash.split('/')[2]) || '';
    const t = TASKS.find(x => x.id === id);
    if (t) tail = `<b>${esc(t.title)}</b>`;
  }
  el.innerHTML = `<span>${NAMES[currentView] || ''}</span>${tail ? '<span class="sep">/</span>' + tail : ''}`;
}

function route() {
  const [, name = 'home', ...rest] = (location.hash || '#/home').split('/');
  const view = ['home', 'lab', 'learn', 'practice', 'drill'].includes(name) ? name : 'home';
  ensure(view);
  currentView = view;
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
  if (view === 'home') home.open();
  if (view === 'learn') learn.open(rest[0]);
  if (view === 'practice') practice.open(rest[0]);
  if (view === 'drill') drill.open(rest[0]);
  if (view === 'lab') {
    lab.renderer.resize();
    if (rest[0] === 's' && rest[1]) { const enc = rest[1]; history.replaceState(null, '', '#/lab'); lab.openShared(enc); }
  }
  const v = document.getElementById('view-' + view);
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  document.title = view === 'lab' ? 'Вселенная Си' : `${NAMES[view]} · Вселенная Си`;
  crumb();
}

// ——— заголовок: запуск, панели, раскладки, тема ———
$('[data-tbrun]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-trun]');
  if (!b) return;
  ensure('lab');
  if (currentView !== 'lab') go('lab');
  const a = b.dataset.trun;
  if (a === 'run') { if (lab.state === 'running') lab.pause(); else if (lab.state === 'paused') lab.resume(); else lab.run('anim'); }
  if (a === 'step') lab.stepOnce();
  if (a === 'stop') lab.stop();
});
document.querySelectorAll('[data-lay]').forEach(b => b.addEventListener('click', () => {
  ensure('lab'); go('lab');
  if (b.dataset.lay === 'side') lab.toggleSide(); else lab.togglePane(b.dataset.lay);
}));
const layPop = $('[data-laypop]');
$('[data-laymenu]').addEventListener('click', (e) => {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  layPop.style.top = r.bottom + 6 + 'px';
  layPop.style.right = Math.max(8, innerWidth - r.right) + 'px';
  layPop.hidden = !layPop.hidden;
});
layPop.addEventListener('click', (e) => {
  const p = e.target.closest('[data-preset]');
  if (!p) return;
  layPop.hidden = true;
  ensure('lab'); go('lab');
  if (p.dataset.preset === 'zen') toggleZen(true); else lab.preset(p.dataset.preset);
});
document.addEventListener('click', (e) => { if (!layPop.hidden && !e.target.closest('[data-laypop]')) layPop.hidden = true; });
const THEME_ORDER = Object.keys(THEMES);
function cycleTheme(name) {
  const cur = settings.get('ui.theme');
  settings.set('ui.theme', name || THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length]);
  lab?.renderer.resize();
  toast(`Тема: ${THEMES[settings.get('ui.theme')].name}`);
}
$('[data-themetoggle]').addEventListener('click', () => cycleTheme());

function toast(text) {
  let t = $('.toast.global');
  if (!t) { t = document.createElement('div'); t.className = 'toast global'; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1600);
}

// ——— режим дзен: только рабочая область ———
function toggleZen(force) {
  const on = document.documentElement.classList.toggle('zen', force);
  if (on) { ensure('lab'); go('lab'); toast('Режим дзен · Esc или Alt+Z — выйти'); }
  setTimeout(() => { lab?.renderer.resize(); lab?.applyLayout(); }, 60);
}
$('[data-zenexit]').addEventListener('click', () => toggleZen(false));
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); toggleZen(); }
  else if (e.key === 'Escape' && document.documentElement.classList.contains('zen') && !document.querySelector('.pal:not([hidden]), .sdlg:not([hidden]), .keys:not([hidden])')) toggleZen(false);
});

// ——— уровень и серия в заголовке ———
function renderXp() {
  const s = xpStats();
  $('[data-xpchip]').innerHTML = `<span class="xp-lvl">${s.level}</span><span class="xp-bar"><i style="width:${Math.round((s.into / s.need) * 100)}%"></i></span>${s.streak ? `<span class="xp-fire" title="Дней подряд">${s.streak}</span>` : ''}`;
  $('[data-xpchip]').title = `Уровень ${s.level} · ${s.xp} опыта (до следующего уровня ${s.need - s.into}) · серия ${s.streak} дн.`;
}
renderXp();
onXp(() => { renderXp(); if (currentView === 'home') home.open(); });

// ——— палитра команд ———
function commands() {
  const L = () => { ensure('lab'); go('lab'); return lab; };
  const C = (title, run, keys = '', tags = '') => ({ kind: 'cmd', title, run, keys, tags });
  const list = [
    C('Запуск с анимацией', () => L().run('anim'), 'F5', 'run старт выполнить'),
    C('Один шаг', () => L().stepOnce(), 'F10', 'step отладка'),
    C('Шаг назад', () => L().stepBack(), 'Shift+F10', 'back'),
    C('Выполнить мгновенно', () => L().run('instant'), 'F8', 'instant быстро'),
    C('Остановить программу', () => L().stop(), 'Shift+F5', 'stop'),
    C('Новый файл', () => { L(); setTimeout(() => lab.ws.startNew(), 60); }, 'Ctrl+Alt+N', 'create создать'),
    C('Сохранить файл', () => L().ws.save(), 'Ctrl+S', 'save'),
    C('Скачать текущий файл (.c)', () => { L(); lab.ws.download(lab.ws.active); }, '', 'download экспорт'),
    C('Загрузить файлы с компьютера', () => L().ws.upload(), '', 'upload импорт открыть'),
    C('Показать / скрыть проводник', () => L().toggleSide(), 'Ctrl+B', 'explorer sidebar боковая'),
    C('Показать / скрыть терминал и логи', () => L().togglePane('panel'), 'Ctrl+J', 'terminal console консоль панель'),
    C('Показать / скрыть поле памяти', () => L().togglePane('uni'), 'Ctrl+Shift+M', 'universe визуализация вселенная'),
    C('Показать / скрыть редактор', () => L().togglePane('editor'), '', 'editor код'),
    C('Показать / скрыть разбор шага', () => L().togglePane('op'), '', 'операция op объяснение'),
    C('Показать / скрыть плеер', () => L().togglePane('player'), '', 'player кнопки'),
    C('Раскладка: сбалансированная', () => L().preset('balanced'), '', 'layout preset'),
    C('Раскладка: фокус на коде', () => L().preset('code'), '', 'layout preset'),
    C('Раскладка: фокус на памяти', () => L().preset('visual'), '', 'layout preset'),
    C('Раскладка: разбор по шагам', () => L().preset('study'), '', 'layout preset'),
    C('Раскладка: терминал крупно', () => L().preset('terminal'), '', 'layout preset'),
    ...THEME_ORDER.map(n => C(`Тема: ${THEMES[n].name}`, () => cycleTheme(n), '', 'theme цвет оформление')),
    C('Выровнять отступы в коде', () => L().formatCode(), 'Shift+Alt+F', 'format форматировать prettier'),
    C('Поделиться кодом: скопировать ссылку', () => L().share(), '', 'share ссылка link'),
    C('Режим дзен', () => toggleZen(), 'Alt+Z', 'zen focus фокус полный экран'),
    C('Тренажёр: угадай вывод', () => { location.hash = '#/drill/quiz'; }, '', 'drill quiz викторина'),
    C('Таблица ASCII', () => { location.hash = '#/drill/ascii'; }, '', 'ascii коды символов'),
    C('Приоритет операций и расстановка скобок', () => { location.hash = '#/drill/prec'; }, '', 'precedence приоритет скобки'),
    C('История версий файла', () => L().showHistory(), '', 'history версии откат restore'),
    C('Испытание дня', () => { location.hash = '#/drill/daily'; }, '', 'daily challenge ежедневное'),
    C('Тренажёр: найди ошибку', () => { location.hash = '#/drill/bugs'; }, '', 'bugs ошибки debug'),
    C('Установить как приложение (работает без интернета)', () => install().then(toast), '', 'install pwa офлайн offline'),
    C('Сохранить прогресс и файлы в файл', () => exportAll(), '', 'export backup резервная копия'),
    C('Загрузить прогресс из файла', () => importAll(toast), '', 'import restore восстановить'),
    C('Показать знакомство заново', () => showWelcome(), '', 'welcome onboarding мастер'),
    C('Очистить терминал', () => L().console.clear?.(), '', 'clear'),
    C('Открыть настройки', () => settingsDlg.open(), 'Ctrl+,', 'settings preferences'),
    C('Настройки терминала', () => settingsDlg.open('term'), '', 'terminal settings шрифт'),
    C('Горячие клавиши', () => { keys.hidden = false; }, '', 'keys shortcuts'),
    C('Пройти обучение заново', () => startTour(), '', 'tour помощь help'),
    C('Перейти: Главная', () => go('home'), '', 'home'),
    C('Перейти: Код', () => go('lab'), '', 'lab'),
    C('Перейти: Теория', () => go('learn'), '', 'learn'),
    C('Перейти: Задачи', () => go('practice'), '', 'practice'),
    C('Перейти: Тренажёр', () => go('drill'), '', 'drill'),
  ];
  const files = (lab ? lab.ws.files : store.get('fs.files', [])).map(f => ({ kind: 'file', title: f.name, sub: f.code.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim().slice(0, 50) || '', run: () => openFile(f.id) }));
  const ex = EXAMPLES.map(e => ({ kind: 'ex', title: e.title, sub: e.group, run: () => openExample(e) }));
  const read = store.get('learn.read', {});
  lessonText ||= new Map(LESSONS.map(l => [l.id, l.html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').toLowerCase()]));
  const marks = store.get('learn.marks', {});
  const les = LESSONS.map(l => ({ kind: 'lesson', title: `${marks[l.id] ? '★ ' : ''}${l.num}. ${l.title}`, sub: (read[l.id] ? '✓ ' : '') + (TOPICS.find(t => t.id === l.topic)?.title || ''), body: lessonText.get(l.id) + ' ' + (store.get('learn.notes', {})[l.id] || '').toLowerCase(), run: () => { location.hash = '#/learn/' + l.id; } }));
  const solved = store.get('practice.solved', {});
  const tasks = TASKS.map(t => ({ kind: 'task', title: t.title, sub: (solved[t.id] ? '✓ решена · ' : '') + LEVELS[t.level].name, run: () => { location.hash = '#/practice/' + t.id; } }));
  return [...list, ...files, ...ex, ...les, ...tasks];
}
let lessonText;
const palette = new Palette(commands);
$('[data-cmdk]').addEventListener('click', () => palette.open());

window.addEventListener('hashchange', route);
updateProgressPill();
route();

// ——— первое знакомство ———
function showWelcome() {
  new Welcome({
    onFinish(where) {
      if (where === 'learn') location.hash = '#/learn/universe';
      else if (where === 'drill') location.hash = '#/drill/quiz';
      else if (where === 'lab') startTour();
      else if (where === 'home') go('home');
    },
  });
}
if (!Welcome.seen() && !Tour.seen()) setTimeout(showWelcome, 300);
else if (!Welcome.seen()) localStorage.setItem('cuniverse.welcome.done', 'true');
onInstallChange(() => { if (currentView === 'home') home.open(); });
window.__app_install = { canInstall, isStandalone };

const tour = new Tour({
  before() {
    ensure('lab');
    go('lab');
    lab.splash.hidden = true;
  },
});
function startTour() { go('lab'); setTimeout(() => tour.start(), 120); }
const keys = $('[data-keysdlg]');
$('[data-keys]').addEventListener('click', () => { keys.hidden = false; });
keys.addEventListener('click', (e) => { if (e.target === keys || e.target.closest('[data-close]')) keys.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { keys.hidden = true; layPop.hidden = true; } });
$('[data-tour]').addEventListener('click', () => startTour());
window.__app = { get lab() { return lab; }, palette };
