// Раздел «Теория»: уроки с запускаемыми примерами и мини-тестами.
import { LESSONS, TOPICS, SNIPPETS } from '../content/lessons.js';
import { highlight } from '../ui/highlight.js';
import { store } from '../store.js';

export class LearnPage {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    root.innerHTML = `<div class="page"><nav class="side" data-side></nav><div class="content" data-content></div></div>`;
    this.side = root.querySelector('[data-side]');
    this.content = root.querySelector('[data-content]');
    this.content.addEventListener('click', (e) => this.onClick(e));
  }

  renderSide(active) {
    const read = store.get('learn.read', {});
    let h = '';
    for (const t of TOPICS) {
      const list = LESSONS.filter(l => l.topic === t.id);
      if (!list.length) continue;
      h += `<h3>${t.title}</h3>`;
      for (const l of list)
        h += `<a href="#/learn/${l.id}" class="${l.id === active ? 'active' : ''}"><span class="num">${l.num}</span><span>${l.title}</span>${read[l.id] ? '<span class="done"></span>' : ''}</a>`;
    }
    this.side.innerHTML = h;
  }

  open(id) {
    const lesson = LESSONS.find(l => l.id === id) || LESSONS.find(l => l.id === store.get('learn.last')) || LESSONS[0];
    store.set('learn.last', lesson.id);
    const read = store.get('learn.read', {});
    read[lesson.id] = true;
    store.set('learn.read', read);
    this.renderSide(lesson.id);
    const idx = LESSONS.indexOf(lesson);
    const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
    const topic = TOPICS.find(t => t.id === lesson.topic);
    let html = lesson.html.replace(/<div data-snip="(\d+)"><\/div>/g, (_, n) => {
      const s = SNIPPETS[+n];
      return `<div class="codebox"><div class="codebox-head"><span class="t">${s.title}</span>${s.stdin ? `<span class="muted">· ввод: ${s.stdin.replace(/\n/g, ' ⏎ ').replace(/</g, '&lt;')}</span>` : ''}<button class="btn small primary" data-run="${n}">▶ Во вселенной</button><button class="btn small ghost" data-copy="${n}" title="Копировать код">Копировать</button></div><pre>${highlight(s.code)}</pre></div>`;
    });
    const quiz = lesson.quiz?.length ? `
      <div class="quiz"><h4>Проверь себя</h4>
      ${lesson.quiz.map((q, qi) => `<div class="q" data-q="${qi}"><div class="q-t">${qi + 1}. ${q.q}</div><div class="q-opts">${q.opts.map((o, oi) => `<button class="q-opt" data-opt="${oi}">${o}</button>`).join('')}</div><div class="q-ex" hidden></div></div>`).join('')}
      </div>` : '';
    this.content.innerHTML = `<article class="article">
      <div class="kicker">${topic.title}</div>
      <h1>${lesson.num !== '★' && lesson.num !== '0' ? lesson.num + '. ' : ''}${lesson.title}</h1>
      ${html}
      ${quiz}
      <div class="pager">
        ${prev ? `<a href="#/learn/${prev.id}"><small>← назад</small>${prev.title}</a>` : '<span></span>'}
        ${next ? `<a href="#/learn/${next.id}" style="text-align:right"><small>далее →</small>${next.title}</a>` : `<a href="#/practice" style="text-align:right"><small>далее →</small>К задачам</a>`}
      </div>
    </article>`;
    this.lesson = lesson;
    this.content.scrollTop = 0;
  }

  onClick(e) {
    const run = e.target.closest('[data-run]');
    if (run) { const s = SNIPPETS[+run.dataset.run]; this.opts.openInLab(s.code, s.stdin ? s.stdin + '\n' : '', s.title); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const s = SNIPPETS[+cp.dataset.copy];
      navigator.clipboard?.writeText(s.code).then(() => { cp.textContent = 'Скопировано'; setTimeout(() => (cp.textContent = 'Копировать'), 1400); }).catch(() => {});
      return;
    }
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      const qEl = opt.closest('[data-q]');
      const q = this.lesson.quiz[+qEl.dataset.q];
      const oi = +opt.dataset.opt;
      qEl.querySelectorAll('.q-opt').forEach((b, i) => { b.disabled = true; if (i === q.a) b.classList.add('right'); });
      if (oi !== q.a) opt.classList.add('wrong');
      const ex = qEl.querySelector('.q-ex');
      ex.hidden = false;
      ex.innerHTML = (oi === q.a ? 'Верно. ' : 'Не совсем. ') + q.ex;
    }
  }
}
