// Единые настройки приложения: схема, хранение, окно с поиском (в духе VS Code).
import { store } from '../store.js';
import { applyTheme, themeId } from './theme.js';

// Для новичка видно только нужное. Остальные настройки остаются с разумными значениями:
// hidden — не показываются в окне (но кнопки интерфейса могут их менять), fixed — всегда по умолчанию.
export const SCHEMA = [
  { id: 'ui', title: 'Внешний вид', icon: 'M4 5h16v14H4zM4 9h16', items: [
    { key: 'ui.theme', label: 'Тема', desc: 'Оформление приложения, кода и поля памяти. Переключается и кнопкой в шапке.', type: 'seg', options: [['cosmos', 'Космос'], ['day', 'День']], def: 'cosmos' },
    { key: 'ui.fontSize', label: 'Размер текста', desc: 'Меню, панели, объяснения.', type: 'range', min: 12, max: 17, step: 0.5, unit: 'px', def: 13.5 },
    { key: 'ui.tips', label: 'Подсказки при наведении на поле памяти', desc: 'Что это за элемент и за что он отвечает.', type: 'bool', def: true },
    { key: 'ui.reduceMotion', label: 'Меньше движения', desc: 'Отключить плавные анимации интерфейса.', type: 'bool', def: false },
    { key: 'ui.accent', type: 'text', def: '', fixed: true },
    { key: 'ui.density', type: 'text', def: 'normal', fixed: true },
    { key: 'ui.statusBar', type: 'bool', def: false, fixed: true },
  ] },
  { id: 'editor', title: 'Код', icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5', items: [
    { key: 'editor.fontSize', label: 'Размер шрифта кода', desc: 'Ещё быстрее — Ctrl+= и Ctrl+−.', type: 'range', min: 11, max: 22, step: 0.5, unit: 'px', def: 14 },
    { key: 'editor.inlineValues', label: 'Значения переменных прямо в коде', desc: 'Во время выполнения справа от строки видно, что в неё записалось: s = 11.', type: 'bool', def: true },
    { key: 'complete.enabled', label: 'Подсказки при наборе', desc: 'Напечатайте «prf» — появится printf. Принять — → или Enter.', type: 'bool', def: true },
    { key: 'editor.autoClose', label: 'Автозакрытие скобок и кавычек', type: 'bool', def: true },
    { key: 'editor.liveCheck', label: 'Проверять ошибки при наборе', type: 'bool', def: true },
    { key: 'editor.lineHeight', type: 'range', def: 1.6, hidden: true },
    { key: 'editor.minimap', type: 'bool', def: false, fixed: true },
    { key: 'editor.tabSize', type: 'seg', def: 4, hidden: true },
    { key: 'editor.autoSave', type: 'bool', def: true, hidden: true },
    { key: 'complete.accept', type: 'seg', def: 'right_enter', hidden: true },
    { key: 'complete.minChars', type: 'seg', def: 1, hidden: true },
    { key: 'complete.fuzzy', type: 'bool', def: true, hidden: true },
    { key: 'complete.snippets', type: 'bool', def: true, hidden: true },
    { key: 'complete.signature', type: 'bool', def: true, hidden: true },
    { key: 'complete.formats', type: 'bool', def: true, hidden: true },
    { key: 'complete.ghost', type: 'bool', def: true, hidden: true },
  ] },
  { id: 'run', title: 'Выполнение', icon: 'M7 5l12 7-12 7z', items: [
    { key: 'run.speed', label: 'Скорость по умолчанию', desc: 'Сколько шагов в секунду при запуске с анимацией.', type: 'range', min: 1, max: 10, step: 1, unit: '', def: 4 },
    { key: 'run.follow', label: 'Камера следует за выполнением', desc: 'Выключите, чтобы самим двигать и рассматривать поле памяти.', type: 'bool', def: true },
    { key: 'term.fs', label: 'Размер текста в терминале', type: 'range', min: 11, max: 22, step: 0.5, unit: 'px', def: 14 },
    { key: 'run.typewriter', type: 'bool', def: true, hidden: true },
    { key: 'run.beams', type: 'bool', def: true, hidden: true },
    { key: 'run.anims', type: 'bool', def: true, hidden: true },
    { key: 'run.flashes', type: 'bool', def: true, hidden: true },
    { key: 'run.visuals', type: 'bool', def: true, hidden: true },
    { key: 'run.opAuto', type: 'bool', def: true, hidden: true },
    { key: 'layout.side', type: 'bool', def: false, hidden: true },
    { key: 'layout.editor', type: 'bool', def: true, hidden: true },
    { key: 'layout.uni', type: 'bool', def: true, hidden: true },
    { key: 'layout.panel', type: 'bool', def: true, hidden: true },
    { key: 'layout.op', type: 'bool', def: true, hidden: true },
    { key: 'layout.player', type: 'bool', def: true, fixed: true },
    { key: 'term.lh', type: 'range', def: 1.6, hidden: true },
    { key: 'term.wrap', type: 'bool', def: true, hidden: true },
    { key: 'term.font', type: 'seg', def: 'jet', fixed: true },
    { key: 'term.theme', type: 'theme', def: 'default', fixed: true },
    { key: 'term.cursor', type: 'bool', def: true, hidden: true },
    { key: 'term.trail', type: 'bool', def: true, hidden: true },
    { key: 'term.typeOut', type: 'bool', def: true, hidden: true },
    { key: 'term.fadeIn', type: 'bool', def: true, hidden: true },
    { key: 'term.invis', type: 'bool', def: false, hidden: true },
    { key: 'term.autoscroll', type: 'bool', def: true, hidden: true },
    { key: 'term.echo', type: 'bool', def: true, hidden: true },
    { key: 'term.compact', type: 'bool', def: false, hidden: true },
    { key: 'logs.max', type: 'seg', def: 2500, fixed: true },
    { key: 'logs.fs', type: 'bool', def: true, fixed: true },
    { key: 'logs.stepNumbers', type: 'bool', def: true, fixed: true },
  ] },
];

export const DEFAULTS = Object.fromEntries(SCHEMA.flatMap(c => c.items.map(i => [i.key, i.def])));
const listeners = new Set();
const FIXED = new Set(SCHEMA.flatMap(c => c.items.filter(i => i.fixed).map(i => i.key)));
let values = { ...DEFAULTS, ...store.get('settings', {}) };
values['ui.theme'] = themeId(values['ui.theme']);
// перенос старых настроек терминала
const oldTerm = store.get('term.cfg', null);
if (oldTerm && !store.get('settings', null)) for (const [k, v] of Object.entries(oldTerm)) if (('term.' + k) in DEFAULTS) values['term.' + k] = v;

export const settings = {
  get: (k) => (FIXED.has(k) || !(k in values) ? DEFAULTS[k] : values[k]),
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
    for (const c of SCHEMA) if (!cat || c.id === cat) for (const i of c.items) if (!i.hidden && !i.fixed) settings.set(i.key, i.def);
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
  applyTheme(settings.get('ui.theme'));
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
    const shown = SCHEMA.map(c => ({ ...c, items: c.items.filter(i => !i.hidden && !i.fixed) }));
    const groups = this.q
      ? shown.map(c => ({ ...c, items: c.items.filter(i => (i.label + ' ' + (i.desc || '') + ' ' + c.title).toLowerCase().includes(this.q)) })).filter(c => c.items.length)
      : shown.filter(c => c.id === this.cat);
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
