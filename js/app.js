// Маршрутизация между разделами: Вселенная (лаборатория), Теория, Практика.
import { Lab } from './lab.js';
import { LearnPage } from './pages/learn.js';
import { PracticePage, updateProgressPill } from './pages/practice.js';
import { Tour } from './ui/tour.js';

const views = {};
let lab, learn, practice;

function ensure(name) {
  if (name === 'lab' && !lab) lab = new Lab(document.getElementById('view-lab'));
  if (name === 'learn' && !learn) learn = new LearnPage(document.getElementById('view-learn'), { openInLab });
  if (name === 'practice' && !practice) practice = new PracticePage(document.getElementById('view-practice'), { openInLab });
}

function openInLab(code, stdin = '', title = '') {
  ensure('lab');
  location.hash = '#/lab';
  lab.load(code, stdin, title);
}

function route() {
  const [, name = 'lab', ...rest] = (location.hash || '#/lab').split('/');
  const view = ['lab', 'learn', 'practice'].includes(name) ? name : 'lab';
  ensure(view);
  document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
  if (view === 'learn') learn.open(rest[0]);
  if (view === 'practice') practice.open(rest[0]);
  if (view === 'lab') lab.renderer.resize();
  document.title = { lab: 'Вселенная Си', learn: 'Теория · Вселенная Си', practice: 'Практика · Вселенная Си' }[view];
}

window.addEventListener('hashchange', route);
updateProgressPill();
route();

const tour = new Tour({
  before() {
    if (!location.hash.startsWith('#/lab')) location.hash = '#/lab';
    ensure('lab');
    lab.splash.hidden = true;
  },
});
const keys = document.querySelector('[data-keysdlg]');
document.querySelector('[data-keys]').addEventListener('click', () => { keys.hidden = false; });
keys.addEventListener('click', (e) => { if (e.target === keys || e.target.closest('[data-close]')) keys.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') keys.hidden = true; });
document.querySelector('[data-tour]').addEventListener('click', () => setTimeout(() => tour.start(), 60));
if (!Tour.seen() && (location.hash || '#/lab').startsWith('#/lab')) setTimeout(() => tour.start(), 700);
window.__app = { get lab() { return lab; } };
