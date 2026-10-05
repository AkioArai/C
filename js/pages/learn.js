// Раздел «Теория»: уроки с запускаемыми примерами и мини-тестами.
import { LESSONS, TOPICS, SNIPPETS } from '../content/lessons.js';
import { highlight } from '../ui/highlight.js';
import { award } from '../ui/xp.js';
import { store } from '../store.js';
import { lessonLocked, lockCard } from '../license.js';

export class LearnPage {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    root.innerHTML = `<div class="page"><nav class="side" data-side></nav><div class="content" data-content></div></div>`;
    this.side = root.querySelector('[data-side]');
    this.content = root.querySelector('[data-content]');
    this.content.addEventListener('click', (e) => this.onClick(e));
    this.side.addEventListener('click', (e) => {
      const th = e.target.closest('[data-topic]');
      if (!th) return;
      const k = th.dataset.topic, set = new Set(store.get('learn.closed', []));
      set.has(k) ? set.delete(k) : set.add(k);
      store.set('learn.closed', [...set]);
      th.parentElement.classList.toggle('shut');
    });
    this.content.addEventListener('scroll', () => this.onScroll(), { passive: true });
  }

  /** Полоса прочитанного и подсветка текущего раздела в оглавлении. */
  onScroll() {
    const c = this.content;
    const p = c.scrollHeight - c.clientHeight > 0 ? c.scrollTop / (c.scrollHeight - c.clientHeight) : 1;
    c.querySelector('.read-bar i')?.style.setProperty('width', (p * 100).toFixed(1) + '%');
    const hs = [...c.querySelectorAll('.article h2[id]')];
    let cur = hs[0]?.id;
    for (const h of hs) if (h.getBoundingClientRect().top - c.getBoundingClientRect().top < 120) cur = h.id;
    c.querySelectorAll('.toc a').forEach(a => a.classList.toggle('on', a.dataset.to === cur));
  }

  renderSide(active) {
    const read = store.get('learn.read', {});
    const marks = store.get('learn.marks', {});
    const notes = store.get('learn.notes', {});
    const closed = new Set(store.get('learn.closed', []));
    const activeTopic = LESSONS.find(l => l.id === active)?.topic;
    let h = '';
    const fav = LESSONS.filter(l => marks[l.id]);
    if (fav.length) h += `<h3 class="ls-fav">★ Закладки</h3>` + fav.map(l => `<a href="#/learn/${l.id}" class="${l.id === active ? 'active' : ''}"><span class="num">${l.num}</span><span>${l.title}</span></a>`).join('');
    for (const t of TOPICS) {
      const list = LESSONS.filter(l => l.topic === t.id);
      if (!list.length) continue;
      const done = list.filter(l => read[l.id]).length;
      const shut = closed.has(String(t.id)) && t.id !== activeTopic;
      h += `<div class="ls-topic ${shut ? 'shut' : ''}"><button class="ls-th" data-topic="${t.id}"><span class="ls-tt">${t.title}</span><span class="ls-n">${done}/${list.length}</span><i class="ls-bar"><b style="width:${(done / list.length) * 100}%"></b></i></button><div class="ls-list">`;
      for (const l of list)
        h += `<a href="#/learn/${l.id}" class="${l.id === active ? 'active' : ''}"><span class="num">${l.num}</span><span>${l.title}</span>${lessonLocked(l) ? '<span class="ls-lock" title="В подписке">🔒</span>' : ''}${marks[l.id] ? '<span class="ls-star">★</span>' : ''}${notes[l.id] ? '<span class="ls-note" title="Есть заметка">✎</span>' : ''}${read[l.id] ? '<span class="done"></span>' : ''}</a>`;
      h += '</div></div>';
    }
    this.side.innerHTML = h;
  }

  open(id) {
    const lesson = LESSONS.find(l => l.id === id) || LESSONS.find(l => l.id === store.get('learn.last')) || LESSONS[0];
    if (lessonLocked(lesson)) {
      // закрытый урок: заголовок, начало текста размыто и карточка подписки
      this.renderSide(lesson.id);
      const topicT = TOPICS.find(t => t.id === lesson.topic)?.title || '';
      const teaser = lesson.html.replace(/<div data-snip="\d+"><\/div>/g, '').slice(0, 900);
      this.content.innerHTML = `<div class="lesson-wrap"><article class="article"><div class="kicker">${topicT}</div><h1>${lesson.num}. ${lesson.title}</h1><div class="lock-teaser">${teaser}</div>${lockCard('Этот урок')}</article></div>`;
      this.content.scrollTop = 0;
      this.lesson = lesson;
      return;
    }
    store.set('learn.last', lesson.id);
    const read = store.get('learn.read', {});
    const first = !read[lesson.id];
    read[lesson.id] = true;
    store.set('learn.read', read);
    if (first) award('lesson', { first });
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
    // оглавление по заголовкам h2
    let hn = 0;
    const toc = [];
    html = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, t) => { const id = 'sec' + (++hn); toc.push([id, t.replace(/<[^>]+>/g, '')]); return `<h2 id="${id}">${t}</h2>`; });
    const words = lesson.html.replace(/<[^>]+>/g, ' ').split(/\s+/).length;
    const nSnip = (lesson.html.match(/data-snip=/g) || []).length;
    const meta = [`~${Math.max(1, Math.round(words / 160))} мин`, nSnip ? `${nSnip} ${nSnip === 1 ? 'пример' : nSnip < 5 ? 'примера' : 'примеров'}` : '', lesson.quiz?.length ? `${lesson.quiz.length} ${lesson.quiz.length === 1 ? 'вопрос' : lesson.quiz.length < 5 ? 'вопроса' : 'вопросов'}` : ''].filter(Boolean);
    this.content.innerHTML = `<div class="read-bar"><i></i></div><div class="lesson-wrap"><article class="article">
      <div class="kicker">${topic.title}</div>
      <h1>${lesson.num !== '★' && lesson.num !== '0' ? lesson.num + '. ' : ''}${lesson.title}</h1>
      <div class="lesson-meta">${meta.map(m => `<span>${m}</span>`).join('')}<button class="ls-mark ${store.get('learn.marks', {})[lesson.id] ? 'on' : ''}" data-mark title="Добавить в закладки">${store.get('learn.marks', {})[lesson.id] ? '★ в закладках' : '☆ в закладки'}</button><button class="ls-mark" data-to="notes">✎ заметка</button><button class="ls-mark" data-print title="Распечатать или сохранить в PDF">⎙ печать</button></div>
      ${html}
      ${quiz}
      <section class="notes" id="notes">
        <h4>Мои заметки к уроку</h4>
        <textarea data-note rows="3" placeholder="Что важно запомнить, вопросы к преподавателю, свои примеры… Сохраняется автоматически и ищется через Ctrl+K.">${(store.get('learn.notes', {})[lesson.id] || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
        <small class="muted" data-note-st></small>
      </section>
      <div class="pager">
        ${prev ? `<a href="#/learn/${prev.id}"><small>← назад</small>${prev.title}</a>` : '<span></span>'}
        ${next ? `<a href="#/learn/${next.id}" style="text-align:right"><small>далее →</small>${next.title}</a>` : `<a href="#/practice" style="text-align:right"><small>далее →</small>К задачам</a>`}
      </div>
    </article>
    ${toc.length > 1 ? `<aside class="toc"><b>На этой странице</b>${toc.map(([id, t]) => `<a data-to="${id}">${t}</a>`).join('')}${lesson.quiz?.length ? '<a data-to="quiz">Проверь себя</a>' : ''}</aside>` : ''}</div>`;
    this.content.querySelector('.quiz')?.setAttribute('id', 'quiz');
    const na = this.content.querySelector('[data-note]');
    const fit = () => { na.style.height = 'auto'; na.style.height = Math.max(76, na.scrollHeight + 2) + 'px'; };
    fit();
    na.addEventListener('input', () => {
      fit();
      clearTimeout(this._nt);
      this._nt = setTimeout(() => {
        const all = store.get('learn.notes', {});
        const v = na.value.trim();
        if (v) all[lesson.id] = na.value; else delete all[lesson.id];
        store.set('learn.notes', all);
        this.content.querySelector('[data-note-st]').textContent = 'Сохранено';
        this.renderSide(lesson.id);
      }, 400);
    });
    this.lesson = lesson;
    this.content.scrollTop = 0;
    this.onScroll();
  }

  onClick(e) {
    if (e.target.closest('[data-print]')) { print(); return; }
    if (e.target.closest('[data-mark]')) {
      const m = store.get('learn.marks', {});
      if (m[this.lesson.id]) delete m[this.lesson.id]; else m[this.lesson.id] = Date.now();
      store.set('learn.marks', m);
      const b = e.target.closest('[data-mark]');
      b.classList.toggle('on', !!m[this.lesson.id]);
      b.textContent = m[this.lesson.id] ? '★ в закладках' : '☆ в закладки';
      this.renderSide(this.lesson.id);
      return;
    }
    const to = e.target.closest('[data-to]');
    if (to) { this.content.querySelector('#' + to.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
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
