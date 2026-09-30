// Единые настройки приложения: схема, хранение, окно с поиском (в духе VS Code).
import { store } from '../store.js';
import { applyTheme } from './theme.js';

const ACCENTS = [
  ['#c8f05a', 'Салатовый'], ['#e9d85c', 'Жёлтый'], ['#7fd6c2', 'Мятный'],
  ['#8fb8f0', 'Голубой'], ['#f0a36b', 'Янтарный'], ['#d9a6f0', 'Сиреневый'],
];

export const SCHEMA = [
  { id: 'ui', title: 'Интерфейс', icon: 'M4 5h16v14H4zM4 9h16', items: [
    { key: 'ui.theme', label: 'Тема', desc: 'Оформление всего приложения, подсветки кода и поля памяти.', type: 'seg', options: [['graphite', 'Графит'], ['midnight', 'Полночь'], ['light', 'Светлая']], def: 'graphite' },
    { key: 'ui.density', label: 'Плотность', desc: 'Размер кнопок, отступов и панелей.', type: 'seg', options: [['compact', 'Компактная'], ['normal', 'Обычная'], ['touch', 'Для пальцев']], def: 'normal' },
    { key: 'ui.fontSize', label: 'Размер текста интерфейса', desc: 'Меню, панели, пояснения.', type: 'range', min: 11, max: 16, step: 0.5, unit: 'px', def: 13 },
    { key: 'ui.accent', label: 'Акцентный цвет', desc: 'Цвет кнопки запуска, выделений и текущей строки.', type: 'swatch', options: ACCENTS, def: '#c8f05a' },
    { key: 'ui.tips', label: 'Подсказки при наведении на поле памяти', desc: 'Что это за элемент и за что он отвечает.', type: 'bool', def: true },
    { key: 'ui.statusBar', label: 'Строка состояния внизу', desc: 'Состояние программы, шаг, строка и столбец курсора.', type: 'bool', def: true },
    { key: 'ui.reduceMotion', label: 'Меньше движения', desc: 'Отключить плавные анимации интерфейса.', type: 'bool', def: false },
  ] },
  { id: 'layout', title: 'Раскладка', icon: 'M4 4h16v16H4zM10 4v16M10 14h10', items: [
    { key: 'layout.side', label: 'Проводник файлов', desc: 'Ctrl+B', type: 'bool', def: true },
    { key: 'layout.editor', label: 'Редактор кода', type: 'bool', def: true },
    { key: 'layout.uni', label: 'Поле памяти (визуализация)', desc: 'Ctrl+Shift+M', type: 'bool', def: true },
    { key: 'layout.panel', label: 'Нижняя панель: терминал, логи, процессы, проблемы', desc: 'Ctrl+J', type: 'bool', def: true },
    { key: 'layout.op', label: 'Панель «Операция» поверх поля памяти', desc: 'Разбор текущего шага картинками.', type: 'bool', def: true },
    { key: 'layout.player', label: 'Пульт выполнения на поле памяти', desc: 'Кнопки запуска всегда есть и в шапке.', type: 'bool', def: true },
  ] },
  { id: 'editor', title: 'Редактор', icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5', items: [
    { key: 'editor.fontSize', label: 'Размер шрифта кода', type: 'range', min: 11, max: 22, step: 0.5, unit: 'px', def: 13.5 },
    { key: 'editor.lineHeight', label: 'Высота строки', type: 'range', min: 1.2, max: 2, step: 0.05, unit: '×', def: 1.55 },
    { key: 'editor.tabSize', label: 'Размер отступа', desc: 'Сколько пробелов вставляет Tab.', type: 'seg', options: [[2, '2'], [4, '4'], [8, '8']], def: 4 },
    { key: 'editor.autoClose', label: 'Автозакрытие скобок и кавычек', desc: 'Набрали ( — сразу появится ). Повторный набор ) просто перешагнёт её.', type: 'bool', def: true },
    { key: 'editor.autoSave', label: 'Автосохранение файлов', desc: 'Изменения сохраняются в браузере сразу. Выключено — сохранение по Ctrl+S.', type: 'bool', def: true },
    { key: 'editor.liveCheck', label: 'Проверка ошибок при наборе', desc: 'Подчёркивать ошибки, не дожидаясь запуска.', type: 'bool', def: true },
  ] },
  { id: 'complete', title: 'Автодополнение', icon: 'M4 12h10M4 7h16M4 17h7', items: [
    { key: 'complete.enabled', label: 'Подсказки при наборе', type: 'bool', def: true },
    { key: 'complete.accept', label: 'Принимать подсказку клавишей', desc: 'Tab по умолчанию оставлен для отступов.', type: 'seg', options: [['right', '→'], ['right_enter', '→ и Enter'], ['tab', 'Tab'], ['all', '→, Enter, Tab']], def: 'right_enter' },
    { key: 'complete.minChars', label: 'Показывать после символов', type: 'seg', options: [[1, '1'], [2, '2'], [3, '3']], def: 1 },
    { key: 'complete.fuzzy', label: 'Нечёткий поиск', desc: '«prf» найдёт printf, «sqr» — sqrt.', type: 'bool', def: true },
    { key: 'complete.snippets', label: 'Шаблоны (сниппеты)', desc: '«for» разворачивается в целый цикл; Tab переходит к следующему полю.', type: 'bool', def: true },
    { key: 'complete.signature', label: 'Подсказка параметров функции', desc: 'Внутри скобок printf(…) показывает, какие аргументы ожидаются.', type: 'bool', def: true },
    { key: 'complete.formats', label: 'Спецификаторы внутри строки', desc: 'После % в строке формата — список %d, %lf, %c…', type: 'bool', def: true },
    { key: 'complete.ghost', label: 'Серый хвост подсказки в строке', type: 'bool', def: true },
  ] },
  { id: 'run', title: 'Выполнение и анимации', icon: 'M7 5l12 7-12 7z', items: [
    { key: 'run.speed', label: 'Скорость по умолчанию', type: 'range', min: 1, max: 10, step: 1, unit: '', def: 4 },
    { key: 'run.follow', label: 'Камера следует за выполнением', type: 'bool', def: true },
    { key: 'run.typewriter', label: 'Вывод на экран компьютера по буквам', type: 'bool', def: true },
    { key: 'run.beams', label: 'Летящие значения по лучам', type: 'bool', def: true },
    { key: 'run.flashes', label: 'Вспышки строк с условиями', type: 'bool', def: true },
    { key: 'run.visuals', label: 'Картинки операций в панели «Операция»', type: 'bool', def: true },
    { key: 'run.opAuto', label: 'Панель «Операция» развёрнута', desc: 'Выключите, чтобы видеть только заголовок шага.', type: 'bool', def: true },
  ] },
  { id: 'term', title: 'Терминал', icon: 'M4 17l5-5-5-5M11 18h9', items: [
    { key: 'term.fs', label: 'Размер текста', type: 'range', min: 9, max: 24, step: 0.5, unit: 'px', def: 14 },
    { key: 'term.lh', label: 'Межстрочный интервал', type: 'range', min: 1.1, max: 2.2, step: 0.05, unit: '×', def: 1.6 },
    { key: 'term.wrap', label: 'Длинные строки', type: 'seg', options: [[false, 'листать вправо-влево'], [true, 'переносить']], def: false },
    { key: 'term.font', label: 'Шрифт', type: 'seg', options: [['jet', 'JetBrains Mono'], ['system', 'Системный'], ['serif', 'С засечками']], def: 'jet' },
    { key: 'term.theme', label: 'Цветовая схема', type: 'theme', def: 'default' },
    { key: 'term.cursor', label: 'Курсор как в kitty', desc: 'Блочный мигающий курсор, который плавно едет к новому тексту.', type: 'bool', def: true },
    { key: 'term.trail', label: 'След курсора', desc: 'За курсором тянется затухающий шлейф.', type: 'bool', def: true },
    { key: 'term.typeOut', label: 'Печать вывода по буквам', type: 'bool', def: true },
    { key: 'term.fadeIn', label: 'Плавное появление строк', type: 'bool', def: true },
    { key: 'term.invis', label: 'Невидимые символы', desc: 'Пробел — ·, табуляция — →, перевод строки — ↵.', type: 'bool', def: false },
    { key: 'term.autoscroll', label: 'Автопрокрутка вниз', type: 'bool', def: true },
    { key: 'term.echo', label: 'Показывать «Входные данные заранее»', type: 'bool', def: true },
    { key: 'term.compact', label: 'Компактный режим', desc: 'Скрыть строки команд gcc и ./main.', type: 'bool', def: false },
  ] },
  { id: 'logs', title: 'Логи', icon: 'M5 6h14M5 12h14M5 18h9', items: [
    { key: 'logs.max', label: 'Сколько записей хранить', desc: 'Больше — подробнее хроника, но медленнее на долгих программах.', type: 'seg', options: [[500, '500'], [2500, '2 500'], [10000, '10 000'], [50000, '50 000'], [0, 'без ограничения']], def: 2500 },
    { key: 'logs.fs', label: 'Размер текста терминала и для логов', type: 'bool', def: true },
    { key: 'logs.stepNumbers', label: 'Номера шагов у записей', type: 'bool', def: true },
  ] },
];

export const DEFAULTS = Object.fromEntries(SCHEMA.flatMap(c => c.items.map(i => [i.key, i.def])));
const listeners = new Set();
let values = { ...DEFAULTS, ...store.get('settings', {}) };
// перенос старых настроек терминала
const oldTerm = store.get('term.cfg', null);
if (oldTerm && !store.get('settings', null)) for (const [k, v] of Object.entries(oldTerm)) if (('term.' + k) in DEFAULTS) values['term.' + k] = v;

export const settings = {
  get: (k) => (k in values ? values[k] : DEFAULTS[k]),
  set(k, v) {
    const d = DEFAULTS[k];
    if (typeof d === 'number') v = +v;
    if (typeof d === 'boolean') v = v === true || v === 'true';
    if (values[k] === v) return;
    values[k] = v;
    store.set('settings', values);
    for (const fn of listeners) fn(k, v);
  },
  reset(cat) {
    for (const c of SCHEMA) if (!cat || c.id === cat) for (const i of c.items) settings.set(i.key, i.def);
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export const TERM_THEMES = [
  ['default', 'Графит', '#0a0b09', '#e6e9df'], ['phosphor', 'Фосфор', '#040804', '#9ff07a'],
  ['amber', 'Янтарь', '#0c0904', '#f0bd62'], ['ice', 'Лёд', '#070a0e', '#cfe3f5'],
  ['paper', 'Бумага', '#f3f0e6', '#23261f'], ['contrast', 'Контраст', '#000000', '#ffffff'],
];

/** Применить настройки интерфейса к документу. */
export function applyUi() {
  const r = document.documentElement;
  r.dataset.density = settings.get('ui.density');
  r.style.setProperty('--ui-fs', settings.get('ui.fontSize') + 'px');
  applyTheme(settings.get('ui.theme'), settings.get('ui.accent'));
  const fs = settings.get('editor.fontSize');
  r.style.setProperty('--fs-code', fs + 'px');
  r.style.setProperty('--lh-code', Math.round(fs * settings.get('editor.lineHeight')) + 'px');
  r.classList.toggle('reduce-motion', settings.get('ui.reduceMotion'));
  r.classList.toggle('no-status', !settings.get('ui.statusBar'));
}

// ——— окно настроек ———
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class SettingsDialog {
  constructor() {
    this.cat = 'ui';
    this.q = '';
    this.el = document.createElement('div');
    this.el.className = 'sdlg';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="sd-card" role="dialog" aria-label="Настройки">
      <div class="sd-head"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
        <b>Настройки</b><input type="search" class="sd-search" placeholder="Поиск настроек…" aria-label="Поиск настроек"><button class="in-close" data-close aria-label="Закрыть">×</button></div>
      <div class="sd-body"><nav class="sd-cats"></nav><div class="sd-list"></div></div>
      <div class="sd-foot"><span class="muted">Сохраняется автоматически в этом браузере.</span><button class="btn small ghost" data-reset>Сбросить раздел</button></div>
    </div>`;
    document.body.appendChild(this.el);
    this.cats = this.el.querySelector('.sd-cats');
    this.list = this.el.querySelector('.sd-list');
    this.search = this.el.querySelector('.sd-search');
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target.closest('[data-close]')) this.close();
      const c = e.target.closest('[data-cat]');
      if (c) { this.cat = c.dataset.cat; this.q = ''; this.search.value = ''; this.render(); }
      const b = e.target.closest('[data-set]');
      if (b) { settings.set(b.dataset.set, parseVal(b.dataset.set, b.dataset.v)); this.render(); }
      if (e.target.closest('[data-reset]')) { settings.reset(this.q ? null : this.cat); this.render(); }
    });
    this.el.addEventListener('input', (e) => {
      if (e.target === this.search) { this.q = this.search.value.trim().toLowerCase(); this.render(); return; }
      const k = e.target.dataset.k;
      if (!k) return;
      settings.set(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
      const v = e.target.closest('.sd-item')?.querySelector('.sd-v');
      if (v) v.textContent = fmtVal(k, e.target.value);
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); this.open(); }
      if (e.key === 'Escape' && !this.el.hidden) this.close();
    });
  }
  open(cat) { if (cat) this.cat = cat; this.el.hidden = false; this.render(); setTimeout(() => this.search.focus(), 30); }
  close() { this.el.hidden = true; }
  render() {
    this.cats.innerHTML = SCHEMA.map(c => `<button data-cat="${c.id}" class="${c.id === this.cat && !this.q ? 'on' : ''}"><svg class="ic" viewBox="0 0 24 24"><path d="${c.icon}"/></svg>${esc(c.title)}</button>`).join('');
    const groups = this.q
      ? SCHEMA.map(c => ({ ...c, items: c.items.filter(i => (i.label + ' ' + (i.desc || '') + ' ' + c.title).toLowerCase().includes(this.q)) })).filter(c => c.items.length)
      : SCHEMA.filter(c => c.id === this.cat);
    this.list.innerHTML = groups.length ? groups.map(c => `<h3>${esc(c.title)}</h3>${c.items.map(item).join('')}`).join('') : '<p class="muted">Ничего не найдено.</p>';
  }
}

function parseVal(k, v) {
  const d = DEFAULTS[k];
  if (typeof d === 'boolean') return v === 'true';
  if (typeof d === 'number') return +v;
  return v;
}
function fmtVal(k, v) {
  const it = SCHEMA.flatMap(c => c.items).find(i => i.key === k);
  return it?.unit === '×' ? (+v).toFixed(2) + '×' : `${v}${it?.unit ? ' ' + it.unit : ''}`;
}

function item(i) {
  const v = settings.get(i.key);
  let ctl = '';
  if (i.type === 'bool') ctl = `<label class="sw"><input type="checkbox" data-k="${i.key}" ${v ? 'checked' : ''}><span class="sw-t"></span></label>`;
  else if (i.type === 'range') ctl = `<div class="sd-range"><input type="range" data-k="${i.key}" min="${i.min}" max="${i.max}" step="${i.step}" value="${v}"><span class="sd-v">${fmtVal(i.key, v)}</span></div>`;
  else if (i.type === 'seg') ctl = `<div class="seg">${i.options.map(([ov, l]) => `<button data-set="${i.key}" data-v="${ov}" class="${String(ov) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  else if (i.type === 'swatch') ctl = `<div class="swatches">${i.options.map(([ov, l]) => `<button data-set="${i.key}" data-v="${ov}" class="swc ${ov === v ? 'on' : ''}" style="--c:${ov}" title="${esc(l)}"></button>`).join('')}</div>`;
  else if (i.type === 'theme') ctl = `<div class="themes">${TERM_THEMES.map(([id, name, bg, fg]) => `<button data-set="${i.key}" data-v="${id}" class="th ${v === id ? 'on' : ''}" style="--th-bg:${bg};--th-fg:${fg}"><span>$ ./main</span><small>${esc(name)}</small></button>`).join('')}</div>`;
  const changed = String(v) !== String(i.def);
  return `<div class="sd-item${changed ? ' changed' : ''}"><div class="sd-l"><b>${esc(i.label)}</b>${i.desc ? `<small>${esc(i.desc)}</small>` : ''}</div><div class="sd-c">${ctl}</div></div>`;
}
