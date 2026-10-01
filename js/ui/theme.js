// Темы оформления: одна палитра на интерфейс, подсветку кода и поле памяти (canvas).
import { C } from '../universe/renderer.js';
import { TYPE_COLORS } from '../universe/scene.js';

const DARK_TYPES = { int: '#c8f05a', long: '#8fd46a', char: '#e3b36b', dbl: '#e9d85c', bool: '#a9d6a0' };

export const THEMES = {
  graphite: {
    name: 'Графит', dark: true,
    css: {
      '--bg': '#0b0c0a', '--bg2': '#0e100d', '--panel': '#111310', '--panel2': '#161915', '--panel3': '#1c1f1a', '--chrome': '#090a08',
      '--line': '#1f231d', '--line2': '#2b3027', '--text': '#e7eae0', '--text2': '#b4b9aa', '--muted': '#7c8372', '--faint': '#4d5347',
      '--yellow': '#e9d85c', '--green': '#8fd46a', '--red': '#e0705f', '--blue': '#8fb8f0', '--violet': '#d9a6f0', '--orange': '#f0a36b',
      '--shadow': 'rgba(0,0,0,.5)', '--hover': 'rgba(255,255,255,.035)', '--code-bg': '#0b0c0a',
      '--syn-kw': '#c8f05a', '--syn-type': '#9fd67a', '--syn-str': '#e9d85c', '--syn-fmt': '#f3e99a', '--syn-chr': '#e3b36b', '--syn-com': '#5d6455',
      '--syn-pre': '#8f9885', '--syn-num': '#e3b36b', '--syn-fn': '#e7eae0', '--syn-const': '#d8e29a', '--syn-op': '#8f9885', '--syn-id': '#cfd4c5',
    },
    canvas: { bg: '#0b0c0a', panel: '#0f110e', card: '#121411', line: '#20241e', line2: '#2c3128', line3: '#3a4034', faint: '#4d5347', muted: '#7c8372', text: '#e7eae0', text2: '#b4b9aa', yellow: '#e9d85c', green: '#8fd46a', red: '#e0705f', amber: '#e3b36b', screen: '#080907', code: '#0d0f0c', cell: '#161914', zebra: 'rgba(255,255,255,0.018)', ptr: '#9fc7a8', star: '210,220,190' },
    types: DARK_TYPES,
  },
  midnight: {
    name: 'Полночь', dark: true,
    css: {
      '--bg': '#0b0e14', '--bg2': '#0e121a', '--panel': '#121722', '--panel2': '#171d2a', '--panel3': '#1e2535', '--chrome': '#090c12',
      '--line': '#1d2433', '--line2': '#2a3346', '--text': '#e4e9f2', '--text2': '#aeb8cb', '--muted': '#7a869c', '--faint': '#4b556a',
      '--yellow': '#e8d27a', '--green': '#86d6a4', '--red': '#ef7f73', '--blue': '#86b4f5', '--violet': '#c9a6f5', '--orange': '#f0a36b',
      '--shadow': 'rgba(0,0,0,.55)', '--hover': 'rgba(255,255,255,.04)', '--code-bg': '#0b0e14',
      '--syn-kw': '#86b4f5', '--syn-type': '#7fd6c2', '--syn-str': '#e8d27a', '--syn-fmt': '#f5e6a6', '--syn-chr': '#f0a36b', '--syn-com': '#56627a',
      '--syn-pre': '#8d98ae', '--syn-num': '#f0a36b', '--syn-fn': '#e4e9f2', '--syn-const': '#c9a6f5', '--syn-op': '#8d98ae', '--syn-id': '#cdd5e3',
    },
    canvas: { bg: '#0b0e14', panel: '#0f131b', card: '#121722', line: '#1d2433', line2: '#2a3346', line3: '#3a4560', faint: '#4b556a', muted: '#7a869c', text: '#e4e9f2', text2: '#aeb8cb', yellow: '#e8d27a', green: '#86d6a4', red: '#ef7f73', amber: '#f0a36b', screen: '#080b10', code: '#0d1118', cell: '#171d2a', zebra: 'rgba(255,255,255,0.02)', ptr: '#9ab8e8', star: '190,205,235' },
    types: { int: '#86b4f5', long: '#7fd6c2', char: '#f0a36b', dbl: '#e8d27a', bool: '#c9a6f5' },
  },
  light: {
    name: 'Светлая', dark: false,
    css: {
      '--bg': '#f7f7f3', '--bg2': '#f1f1ec', '--panel': '#ffffff', '--panel2': '#efefe9', '--panel3': '#e6e6df', '--chrome': '#eceee6',
      '--line': '#e0e1d9', '--line2': '#cfd1c6', '--text': '#1d2019', '--text2': '#454a3f', '--muted': '#6f7566', '--faint': '#9ea395',
      '--yellow': '#8a6d00', '--green': '#2f7d32', '--red': '#c0392b', '--blue': '#2459b3', '--violet': '#7b3fb3', '--orange': '#b05a12',
      '--shadow': 'rgba(40,45,30,.18)', '--hover': 'rgba(0,0,0,.035)', '--code-bg': '#fbfbf8',
      '--syn-kw': '#4b6f00', '--syn-type': '#1f7a5c', '--syn-str': '#8a5a00', '--syn-fmt': '#a86b00', '--syn-chr': '#b05a12', '--syn-com': '#9aa08f',
      '--syn-pre': '#6f7566', '--syn-num': '#b05a12', '--syn-fn': '#1d2019', '--syn-const': '#7b3fb3', '--syn-op': '#6f7566', '--syn-id': '#2c3027',
    },
    canvas: { bg: '#f4f4ef', panel: '#fbfbf8', card: '#ffffff', line: '#e0e1d9', line2: '#cfd1c6', line3: '#b9bcb0', faint: '#a6ab9c', muted: '#6f7566', text: '#1d2019', text2: '#454a3f', yellow: '#8a6d00', green: '#2f7d32', red: '#c0392b', amber: '#b05a12', screen: '#1b1d18', code: '#f7f7f3', cell: '#f0f0ea', zebra: 'rgba(0,0,0,0.025)', ptr: '#3f7a5a', star: '120,125,110' },
    types: { int: '#4b6f00', long: '#2f7d32', char: '#b05a12', dbl: '#8a6d00', bool: '#1f7a5c' },
    screenText: '#e7eae0',
  },
  sepia: {
    name: 'Сепия', dark: false,
    css: {
      '--bg': '#f4ecdc', '--bg2': '#efe5d1', '--panel': '#fbf6ea', '--panel2': '#ebe0c8', '--panel3': '#e2d5b8', '--chrome': '#e9dec7',
      '--line': '#ddd0b3', '--line2': '#cbbb98', '--text': '#3b3125', '--text2': '#5a4d3b', '--muted': '#857559', '--faint': '#ab9b7c',
      '--yellow': '#8a6400', '--green': '#4d7a1f', '--red': '#b0412e', '--blue': '#2f5f9a', '--violet': '#7c4a9a', '--orange': '#a65318',
      '--shadow': 'rgba(70,50,20,.18)', '--hover': 'rgba(60,40,10,.04)', '--code-bg': '#f8f1e2',
      '--syn-kw': '#7a3e8f', '--syn-type': '#2f6f5e', '--syn-str': '#8a5a00', '--syn-fmt': '#a86b00', '--syn-chr': '#a65318', '--syn-com': '#a69575',
      '--syn-pre': '#857559', '--syn-num': '#a65318', '--syn-fn': '#3b3125', '--syn-const': '#7c4a9a', '--syn-op': '#857559', '--syn-id': '#46392b',
    },
    canvas: { bg: '#f1e8d6', panel: '#f8f1e2', card: '#fdf9ef', line: '#ddd0b3', line2: '#cbbb98', line3: '#b8a682', faint: '#ab9b7c', muted: '#857559', text: '#3b3125', text2: '#5a4d3b', yellow: '#8a6400', green: '#4d7a1f', red: '#b0412e', amber: '#a65318', screen: '#2b241b', code: '#f6eedd', cell: '#f1e7d2', zebra: 'rgba(60,40,10,0.03)', ptr: '#5a7a4a', star: '150,130,95' },
    types: { int: '#7a3e8f', long: '#4d7a1f', char: '#a65318', dbl: '#8a6400', bool: '#2f6f5e' },
    screenText: '#efe4cc',
  },
  contrast: {
    name: 'Контраст', dark: true,
    css: {
      '--bg': '#000000', '--bg2': '#050505', '--panel': '#0b0b0b', '--panel2': '#151515', '--panel3': '#202020', '--chrome': '#000000',
      '--line': '#3a3a3a', '--line2': '#5a5a5a', '--text': '#ffffff', '--text2': '#e6e6e6', '--muted': '#bdbdbd', '--faint': '#8a8a8a',
      '--yellow': '#ffe14d', '--green': '#5dff7a', '--red': '#ff5c5c', '--blue': '#6ab8ff', '--violet': '#e29bff', '--orange': '#ffab4d',
      '--shadow': 'rgba(0,0,0,.8)', '--hover': 'rgba(255,255,255,.08)', '--code-bg': '#000000',
      '--syn-kw': '#6ab8ff', '--syn-type': '#5dffd0', '--syn-str': '#ffe14d', '--syn-fmt': '#fff27a', '--syn-chr': '#ffab4d', '--syn-com': '#9a9a9a',
      '--syn-pre': '#d0d0d0', '--syn-num': '#ffab4d', '--syn-fn': '#ffffff', '--syn-const': '#e29bff', '--syn-op': '#d0d0d0', '--syn-id': '#ffffff',
    },
    canvas: { bg: '#000000', panel: '#080808', card: '#0e0e0e', line: '#3a3a3a', line2: '#5a5a5a', line3: '#7a7a7a', faint: '#8a8a8a', muted: '#bdbdbd', text: '#ffffff', text2: '#e6e6e6', yellow: '#ffe14d', green: '#5dff7a', red: '#ff5c5c', amber: '#ffab4d', screen: '#000000', code: '#050505', cell: '#1a1a1a', zebra: 'rgba(255,255,255,0.05)', ptr: '#7fffb0', star: '255,255,255' },
    types: { int: '#6ab8ff', long: '#5dff7a', char: '#ffab4d', dbl: '#ffe14d', bool: '#e29bff' },
  },
};

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function darken(h, k) { const [r, g, b] = hexToRgb(h); const f = (x) => Math.round(x * (1 - k)).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }

/** Применить тему и акцентный цвет. Светлая тема затемняет акцент, чтобы он читался на белом. */
export function applyTheme(name, accent) {
  const t = THEMES[name] || THEMES.graphite;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.css)) root.style.setProperty(k, v);
  const acc = t.dark ? accent : darken(accent, 0.45);
  const [r, g, b] = hexToRgb(acc);
  root.style.setProperty('--accent', acc);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--accent-ink', t.dark ? '#10130a' : '#ffffff');
  root.dataset.theme = name;
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.css['--chrome']);
  // поле памяти рисуется на canvas — обновляем его палитру
  Object.assign(C, t.canvas, { accent: acc, screenText: t.screenText || t.canvas.text });
  const ty = t.types;
  for (const k of Object.keys(TYPE_COLORS)) {
    TYPE_COLORS[k] = /char/.test(k) ? ty.char : /float|double/.test(k) ? ty.dbl : /bool/i.test(k) ? ty.bool : /long|size_t/.test(k) ? ty.long : ty.int;
  }
  C.typeDefault = t.canvas.text2;
}
