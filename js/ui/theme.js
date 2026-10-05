// Темы оформления: одна палитра на интерфейс, подсветку кода и поле памяти (canvas).
import { C } from '../universe/renderer.js';
import { TYPE_COLORS } from '../universe/scene.js';

export const THEMES = {
  cosmos: {
    name: 'Космос', dark: true, accent: '#8f7cff', accent2: '#35d6e8',
    css: {
      '--bg': '#0b0c18', '--bg2': '#0e1020', '--panel': '#121427', '--panel2': '#191c33', '--panel3': '#222641', '--chrome': '#090a14',
      '--line': '#1f2340', '--line2': '#2d3256', '--text': '#eef0ff', '--text2': '#bcc1e0', '--muted': '#8189ad', '--faint': '#4f5579',
      '--yellow': '#ffd36e', '--green': '#4fe3a1', '--red': '#ff6b88', '--blue': '#6aa8ff', '--violet': '#b69cff', '--orange': '#ffa463',
      '--shadow': 'rgba(3,4,14,.6)', '--hover': 'rgba(160,170,255,.05)', '--code-bg': '#0d0f1e',
      '--syn-kw': '#b69cff', '--syn-type': '#5fd4ff', '--syn-str': '#ffd36e', '--syn-fmt': '#ffe7a3', '--syn-chr': '#ffa463', '--syn-com': '#5c6390',
      '--syn-pre': '#ff8fc8', '--syn-num': '#ffa463', '--syn-fn': '#e8eaff', '--syn-const': '#ff9fd8', '--syn-op': '#8f96bd', '--syn-id': '#dfe2ff',
    },
    canvas: { bg: '#0b0c18', panel: '#0f1122', card: '#14162b', line: '#22264a', line2: '#2f3460', line3: '#40467a', faint: '#4f5579', muted: '#8189ad', text: '#eef0ff', text2: '#bcc1e0', yellow: '#ffd36e', green: '#4fe3a1', red: '#ff6b88', amber: '#ffa463', screen: '#07080f', code: '#0e1020', cell: '#1a1d36', zebra: 'rgba(255,255,255,0.02)', ptr: '#7fe0ff', star: '200,205,255' },
    types: { int: '#7fb2ff', long: '#4fe3a1', char: '#ffa463', dbl: '#ffd36e', bool: '#ff9fd8' },
  },
  day: {
    name: 'День', dark: false, accent: '#6a4fe0', accent2: '#0aa5b8',
    css: {
      '--bg': '#f5f5fb', '--bg2': '#efeff8', '--panel': '#ffffff', '--panel2': '#eef0f8', '--panel3': '#e4e7f3', '--chrome': '#ffffff',
      '--line': '#e3e5f1', '--line2': '#cdd1e6', '--text': '#151833', '--text2': '#3d4266', '--muted': '#666c92', '--faint': '#9aa0c0',
      '--yellow': '#946b00', '--green': '#0f8a5f', '--red': '#d12f55', '--blue': '#2b62d9', '--violet': '#6a4fe0', '--orange': '#c25a12',
      '--shadow': 'rgba(30,35,80,.14)', '--hover': 'rgba(20,25,80,.04)', '--code-bg': '#fbfbfe',
      '--syn-kw': '#6a4fe0', '--syn-type': '#0b7fa8', '--syn-str': '#9a6a00', '--syn-fmt': '#b07a00', '--syn-chr': '#c25a12', '--syn-com': '#9aa0c0',
      '--syn-pre': '#c02a86', '--syn-num': '#c25a12', '--syn-fn': '#151833', '--syn-const': '#b0359a', '--syn-op': '#666c92', '--syn-id': '#262a4d',
    },
    canvas: { bg: '#f3f3fa', panel: '#fafaff', card: '#ffffff', line: '#e3e5f1', line2: '#cdd1e6', line3: '#b4b9d6', faint: '#9aa0c0', muted: '#666c92', text: '#151833', text2: '#3d4266', yellow: '#946b00', green: '#0f8a5f', red: '#d12f55', amber: '#c25a12', screen: '#14162b', code: '#f7f7fc', cell: '#eef0f8', zebra: 'rgba(0,0,30,0.025)', ptr: '#2b62d9', star: '120,125,170' },
    types: { int: '#2b62d9', long: '#0f8a5f', char: '#c25a12', dbl: '#946b00', bool: '#b0359a' },
    screenText: '#eef0ff',
  },
};
/** Старые темы прошлых версий → новые. */
export const themeId = (n) => (THEMES[n] ? n : /light|sepia/.test(n || '') ? 'day' : 'cosmos');

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/** Применить тему: интерфейс, подсветка кода и поле памяти. */
export function applyTheme(name) {
  const t = THEMES[themeId(name)];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.css)) root.style.setProperty(k, v);
  const acc = t.accent;
  const [r, g, b] = hexToRgb(acc);
  const [r2, g2, b2] = hexToRgb(t.accent2);
  root.style.setProperty('--accent', acc);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--accent2', t.accent2);
  root.style.setProperty('--accent2-rgb', `${r2}, ${g2}, ${b2}`);
  root.style.setProperty('--accent-ink', '#ffffff');
  root.dataset.theme = themeId(name);
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.css['--chrome']);
  // поле памяти рисуется на canvas — обновляем его палитру
  Object.assign(C, t.canvas, { accent: acc, accent2: t.accent2, screenText: t.screenText || t.canvas.text });
  const ty = t.types;
  for (const k of Object.keys(TYPE_COLORS)) {
    TYPE_COLORS[k] = /char/.test(k) ? ty.char : /float|double/.test(k) ? ty.dbl : /bool/i.test(k) ? ty.bool : /long|size_t/.test(k) ? ty.long : ty.int;
  }
  C.typeDefault = t.canvas.text2;
}
