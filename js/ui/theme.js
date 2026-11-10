// Темы оформления: одна палитра на интерфейс, подсветку кода и поле памяти (canvas).
import { C } from '../universe/renderer.js';
import { TYPE_COLORS } from '../universe/scene.js';

export const THEMES = {
  dark: {
    name: 'Тёмная', dark: true, accent: '#4f8cff', accent2: '#ffb224', ink: '#06101f',
    css: {
      '--bg': '#0d0e10', '--bg2': '#111316', '--panel': '#15171b', '--panel2': '#1b1e23', '--panel3': '#23272e', '--chrome': '#0a0b0d',
      '--line': '#24272d', '--line2': '#353a43', '--text': '#eceef1', '--text2': '#b9bec7', '--muted': '#7f8792', '--faint': '#4c525c',
      '--yellow': '#f5c542', '--green': '#3fcf8e', '--red': '#ff5d5d', '--blue': '#4f8cff', '--violet': '#b08cff', '--orange': '#ff9447',
      '--shadow': 'rgba(0,0,0,.55)', '--hover': 'rgba(255,255,255,.04)', '--code-bg': '#0f1013',
      '--syn-kw': '#7aa8ff', '--syn-type': '#4fd1c5', '--syn-str': '#e6c15a', '--syn-fmt': '#f5d98a', '--syn-chr': '#ff9447', '--syn-com': '#5f6672',
      '--syn-pre': '#d58cff', '--syn-num': '#ff9447', '--syn-fn': '#eceef1', '--syn-const': '#d58cff', '--syn-op': '#9aa1ad', '--syn-id': '#dfe2e7',
    },
    canvas: { bg: '#0d0e10', panel: '#121418', card: '#181b20', line: '#282c33', line2: '#3a404a', line3: '#4d5460', faint: '#4c525c', muted: '#7f8792', text: '#eceef1', text2: '#b9bec7', yellow: '#f5c542', green: '#3fcf8e', red: '#ff5d5d', amber: '#ff9447', blue: '#4f8cff', violet: '#b08cff', screen: '#07080a', code: '#0f1013', cell: '#20242a', zebra: 'rgba(255,255,255,0.025)', ptr: '#e879c6', star: '160,170,185' },
    types: { int: '#6ea8ff', long: '#4fd1c5', char: '#ff9447', dbl: '#f5c542', bool: '#d58cff' },
  },
  light: {
    name: 'Светлая', dark: false, accent: '#1d5fe0', accent2: '#b45f00', ink: '#ffffff',
    css: {
      '--bg': '#f4f5f7', '--bg2': '#eceef1', '--panel': '#ffffff', '--panel2': '#f0f1f4', '--panel3': '#e4e6ea', '--chrome': '#ffffff',
      '--line': '#dcdfe4', '--line2': '#c3c8d0', '--text': '#14171c', '--text2': '#3c424c', '--muted': '#646b77', '--faint': '#9aa1ac',
      '--yellow': '#8a6400', '--green': '#0f7f4f', '--red': '#c8322f', '--blue': '#1d5fe0', '--violet': '#7446c9', '--orange': '#b4540a',
      '--shadow': 'rgba(20,25,35,.16)', '--hover': 'rgba(0,0,0,.04)', '--code-bg': '#fbfbfc',
      '--syn-kw': '#1d5fe0', '--syn-type': '#0b7f86', '--syn-str': '#8a6400', '--syn-fmt': '#a07400', '--syn-chr': '#b4540a', '--syn-com': '#9aa1ac',
      '--syn-pre': '#8a3fc9', '--syn-num': '#b4540a', '--syn-fn': '#14171c', '--syn-const': '#8a3fc9', '--syn-op': '#646b77', '--syn-id': '#262b33',
    },
    canvas: { bg: '#f4f5f7', panel: '#fafbfc', card: '#ffffff', line: '#dcdfe4', line2: '#c3c8d0', line3: '#a9afb9', faint: '#9aa1ac', muted: '#646b77', text: '#14171c', text2: '#3c424c', yellow: '#8a6400', green: '#0f7f4f', red: '#c8322f', amber: '#b4540a', blue: '#1d5fe0', violet: '#7446c9', screen: '#15171b', code: '#f6f7f9', cell: '#eef0f3', zebra: 'rgba(0,0,0,0.03)', ptr: '#b0308a', star: '120,128,140' },
    types: { int: '#1d5fe0', long: '#0b7f86', char: '#b4540a', dbl: '#8a6400', bool: '#8a3fc9' },
    screenText: '#eceef1',
  },
};
/** Темы прошлых версий → новые. */
export const themeId = (n) => (THEMES[n] ? n : /light|sepia|day/.test(n || '') ? 'light' : 'dark');

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
  root.style.setProperty('--accent-ink', t.ink);
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
