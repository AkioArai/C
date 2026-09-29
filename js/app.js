// Маршрутизация между разделами: Вселенная (лаборатория), Теория, Практика.
import { Lab } from './lab.js';
import { LearnPage } from './pages/learn.js';
import { PracticePage, updateProgressPill } from './pages/practice.js';

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
window.__app = { get lab() { return lab; } };
