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
import { showWhatsNew } from './ui/whatsnew.js';
import { ProPage } from './pages/pro.js';
import { refresh as refreshLicense, onLicense, license, paywallOn, activate, watch as watchLicense } from './license.js';
import { confetti } from './ui/fx.js';
import { Tour } from './ui/tour.js';
import { Palette } from './ui/palette.js';
import { settings, applyUi, SettingsDialog } from './ui/settings.js';
import { THEMES, themeId } from './ui/theme.js';
import { EXAMPLES } from './content/examples.js';
import { LESSONS, TOPICS } from './content/lessons.js';
import { TASKS, LEVELS } from './content/tasks.js';
import { store } from './store.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ——— защита от «смеси версий»: страница и код должны быть из одного обновления ———
export const APP_VERSION = '16';
{
  const pageVer = document.querySelector('meta[name="app-version"]')?.content;
  if (pageVer !== APP_VERSION && !sessionStorage.getItem('cu.verfix')) {
    sessionStorage.setItem('cu.verfix', '1');
    Promise.resolve(self.caches?.keys()).then((ks) => Promise.all((ks || []).map((k) => caches.delete(k)))).finally(() => location.reload());
  }
}
// если что-то всё же сломалось — показываем понятное сообщение, а не «мёртвые» кнопки
function showCrash(msg) {
  if (document.querySelector('.crash')) return;
  const el = document.createElement('div');
  el.className = 'crash';
  el.innerHTML = `<b>Что-то пошло не так</b><span>${String(msg).replace(/</g, '&lt;').slice(0, 160)}</span><button class="btn primary small" data-crash-reload>Перезагрузить</button><button class="btn small" data-crash-copy title="Скопировать техническую информацию, чтобы отправить разработчику">Скопировать отчёт</button><button class="btn ghost small" data-crash-close>×</button>`;
  const report = { version: APP_VERSION, page: document.querySelector('meta[name="app-version"]')?.content, url: location.href, ua: navigator.userAgent, message: String(msg), stack: lastStack, time: new Date().toISOString() };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-crash-reload]')) Promise.resolve(self.caches?.keys()).then((ks) => Promise.all((ks || []).map((k) => caches.delete(k)))).finally(() => location.reload());
    if (e.target.closest('[data-crash-close]')) el.remove();
    const cp = e.target.closest('[data-crash-copy]');
    if (cp) navigator.clipboard?.writeText(JSON.stringify(report, null, 2)).then(() => { cp.textContent = 'Скопировано'; }).catch(() => prompt('Скопируйте отчёт:', JSON.stringify(report)));
  });
  document.body.appendChild(el);
}
let lastStack = '';
addEventListener('error', (e) => { if (e.error) { lastStack = String(e.error.stack || '').slice(0, 1500); showCrash(e.message); } });
addEventListener('unhandledrejection', (e) => { const m = e.reason?.message || ''; if (m && !/fetch|network|abort/i.test(m)) showCrash(m); });

applyUi();
initPwa();
settings.on((k) => { if (k.startsWith('ui.') || k.startsWith('editor.')) applyUi(); });
const settingsDlg = new SettingsDialog();
$('[data-settings]').addEventListener('click', () => settingsDlg.open());
// «Код» в панели активности: повторное нажатие прячет/показывает проводник
$('[data-explorer]').addEventListener('click', (e) => {
  if (currentView === 'lab' && lab) { e.preventDefault(); lab.toggleSide(); }
});

let lab, learn, practice, home, drill, pro, currentView = '';

function ensure(name) {
  if (name === 'lab' && !lab) lab = new Lab(document.getElementById('view-lab'), { openSettings: (cat) => settingsDlg.open(cat), onCrumb: () => crumb() });
  if (name === 'pro' && !pro) pro = new ProPage(document.getElementById('view-pro'), { celebrate: () => confetti(innerWidth / 2, innerHeight / 3) });
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
const NAMES = { home: 'Главная', lab: 'Код', learn: 'Теория', practice: 'Задачи', drill: 'Тренажёр', pro: 'Подписка' };
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
  // ссылка активации: #/activate/CU1.… — ключ подставляется сам
  if (name === 'activate' && rest.length) {
    const key = decodeURIComponent(rest.join('/'));
    history.replaceState(null, '', '#/pro');
    activate(key).then((r) => { ensure('pro'); pro.msg = r; if (currentView === 'pro') pro.open(''); if (r.ok) confetti(innerWidth / 2, innerHeight / 3); });
    route();
    return;
  }
  const view = ['home', 'lab', 'learn', 'practice', 'drill', 'pro'].includes(name) ? name : 'home';
  try { ensure(view); } catch (err) { console.error(err); lastStack = String(err.stack || '').slice(0, 1500); showCrash(err.message); if (view === 'lab') lab = null; return; }
  currentView = view;
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
  moveRailInd();
  if (view === 'home') home.open();
  if (view === 'learn') learn.open(rest[0]);
  if (view === 'practice') practice.open(rest[0]);
  if (view === 'drill') drill.open(rest[0]);
  if (view === 'pro') pro.open(rest[0] || '');
  if (view === 'lab') {
    lab.renderer.resize();
    if (rest[0] === 's' && rest[1]) { const enc = rest[1]; history.replaceState(null, '', '#/lab'); lab.openShared(enc); }
  }
  const v = document.getElementById('view-' + view);
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  document.title = view === 'lab' ? 'Вселенная Си' : `${NAMES[view]} · Вселенная Си`;
  crumb();
}

// ——— подсветка раздела в боковой панели плавно переезжает к выбранному ———
function moveRailInd() {
  const ind = $('.rail-ind'), a = $('.rail-i.active');
  if (!ind) return;
  if (!a || !a.offsetHeight) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.transform = `translateY(${a.offsetTop}px)`;
  ind.style.height = a.offsetHeight + 'px';
}
addEventListener('resize', () => moveRailInd());

// ——— заголовок: тема ———
const THEME_ORDER = Object.keys(THEMES);
function cycleTheme(name) {
  const cur = themeId(settings.get('ui.theme'));
  const next = name || THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
  const flip = () => { settings.set('ui.theme', next); lab?.renderer.resize(); };
  // плавная смена темы: новая тема раскрывается кругом от кнопки
  if (document.startViewTransition && !settings.get('ui.reduceMotion')) document.startViewTransition(flip);
  else flip();
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
    C('Показать / скрыть терминал', () => L().togglePane('panel'), 'Ctrl+J', 'terminal console консоль панель логи объяснения'),
    C('Показать / скрыть поле памяти', () => L().togglePane('uni'), 'Ctrl+Shift+M', 'universe визуализация вселенная'),
    C('Показать / скрыть объяснение строки', () => L().togglePane('op'), '', 'операция op объяснение разбор'),
    ...THEME_ORDER.map(n => C(`Тема: ${THEMES[n].name}`, () => cycleTheme(n), '', 'theme цвет оформление')),
    C('Выровнять отступы в коде', () => L().formatCode(), 'Shift+Alt+F', 'format форматировать prettier'),
    C('Поделиться кодом: скопировать ссылку', () => L().share(), '', 'share ссылка link'),
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
    C('Распечатать урок / сохранить в PDF', () => { location.hash.startsWith('#/learn') ? print() : toast('Откройте урок в разделе «Теория»'); }, '', 'print pdf печать'),
    C('Подписка: ввести ключ', () => { location.hash = '#/pro'; }, '', 'pro ключ подписка лицензия оплата'),
    C('Что нового в обновлении', () => showWhatsNew(true, APP_VERSION), '', 'changelog обновление версия'),
    C('Сбросить кэш и перезагрузить', () => { Promise.resolve(self.caches?.keys()).then((ks) => Promise.all((ks || []).map((k) => caches.delete(k)))).finally(() => location.reload()); }, '', 'cache кэш reload обновить сломалось'),
    C('Очистить терминал', () => L().console.clear?.(), '', 'clear'),
    C('Открыть настройки', () => settingsDlg.open(), 'Ctrl+,', 'settings preferences'),
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
// масштаб кода: Ctrl+= / Ctrl+− / Ctrl+0
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || currentView !== 'lab') return;
  const k = e.key;
  if (k !== '=' && k !== '+' && k !== '-' && k !== '0') return;
  e.preventDefault();
  const cur = settings.get('editor.fontSize');
  const v = k === '0' ? 13.5 : Math.max(11, Math.min(22, cur + (k === '-' ? -1 : 1)));
  settings.set('editor.fontSize', v);
  toast(`Размер кода: ${v}px · Ctrl+0 — сбросить`);
});
$('[data-cmdk]').addEventListener('click', () => palette.open());

window.addEventListener('hashchange', route);
updateProgressPill();
// ——— подписка: проверяем ключ до первого показа, затем каждые 10 минут и при возвращении во вкладку ———
function renderPro() {
  const s = license(), el = $('[data-prochip]');
  el.hidden = !paywallOn();
  el.className = 'tb-pro ' + (s.pro ? 'on' : 'off');
  el.textContent = s.pro ? `PRO · ${s.daysLeft} дн.` : 'Подписка';
  el.title = s.pro ? `Подписка активна до ${new Date(s.until).toLocaleDateString('ru')}` : 'Бесплатная версия — открыть PRO';
  document.documentElement.classList.toggle('is-pro', !!s.pro);
}
let lastPro = null;
onLicense((s) => {
  renderPro();
  if (lastPro !== null && lastPro !== s.pro && currentView && currentView !== 'pro') route(); // доступ изменился — перерисовать раздел
  lastPro = s.pro;
  if (s.status === 'active' && s.daysLeft <= 3) toast(`Подписка заканчивается через ${s.daysLeft} дн. — продлите у продавца`);
});
await refreshLicense(false).catch(() => {});
refreshLicense(true).catch(() => {});
watchLicense();
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
else {
  if (!Welcome.seen()) localStorage.setItem('cuniverse.welcome.done', 'true');
  setTimeout(() => showWhatsNew(false, APP_VERSION), 900);
}
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
keys.addEventListener('click', (e) => { if (e.target === keys || e.target.closest('[data-close]')) keys.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') keys.hidden = true; });
$('[data-tour]').addEventListener('click', () => startTour());
window.__app = { get lab() { return lab; }, palette };
