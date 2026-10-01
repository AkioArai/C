// Тренажёр: «Угадай вывод», таблица ASCII и приоритет операций с расстановкой скобок.
import { makeQuestion, choices, DRILL_CATS } from '../content/drill.js';
import { runToEnd, HEADERS } from '../compiler/index.js';
import { tokenize, preprocess } from '../compiler/lexer.js';
import { parse } from '../compiler/parser.js';
import { typeName } from '../compiler/types.js';
import { highlight } from '../ui/highlight.js';
import { award, stats } from '../ui/xp.js';
import { store } from '../store.js';
import { confetti } from '../ui/fx.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TABS = [['quiz', 'Угадай вывод'], ['ascii', 'Таблица ASCII'], ['prec', 'Приоритет операций']];

export class DrillPage {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.tab = 'quiz';
    this.cats = store.get('drill.cats', null);
    root.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => {
      if (root.hidden || this.tab !== 'quiz' || e.ctrlKey || e.metaKey || e.altKey || /input|textarea/i.test(e.target.tagName) || document.querySelector('.pal:not([hidden])')) return;
      if (/^[1-4]$/.test(e.key) && !this.answered) { e.preventDefault(); this.answer(+e.key - 1); }
      else if (e.key === 'Enter' && this.answered) { e.preventDefault(); this.next(); }
    });
  }

  open(sub) {
    if (TABS.some(t => t[0] === sub)) this.tab = sub;
    this.root.innerHTML = `<div class="drill"><div class="drill-in">
      <header class="dr-head">
        <div><div class="kicker">Тренажёр</div><h1>${TABS.find(t => t[0] === this.tab)[1]}</h1></div>
        <nav class="seg dr-tabs">${TABS.map(([k, v]) => `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${v}</button>`).join('')}</nav>
      </header>
      <div class="dr-body" data-body></div>
    </div></div>`;
    this.body = this.root.querySelector('[data-body]');
    if (this.tab === 'quiz') this.renderQuiz();
    if (this.tab === 'ascii') this.renderAscii();
    if (this.tab === 'prec') this.renderPrec();
  }

  onClick(e) {
    const t = e.target.closest('[data-tab]');
    if (t) { location.hash = '#/drill/' + t.dataset.tab; return; }
    const c = e.target.closest('[data-cat]');
    if (c) {
      const k = c.dataset.cat;
      let cats = this.cats ? [...this.cats] : null;
      if (k === 'all') cats = null;
      else {
        cats = cats || [];
        cats = cats.includes(k) ? cats.filter(x => x !== k) : [...cats, k];
        if (!cats.length) cats = null;
      }
      this.cats = cats;
      store.set('drill.cats', cats);
      this.renderCats();
      this.next();
      return;
    }
    const o = e.target.closest('[data-opt]');
    if (o && !this.answered) { this.answer(+o.dataset.opt); return; }
    if (e.target.closest('[data-next]')) { this.next(); return; }
    if (e.target.closest('[data-lab]') && this.q) { this.opts.openInLab(this.q.code, '', 'Тренажёр'); return; }
    const a = e.target.closest('[data-ch]');
    if (a) { this.showChar(+a.dataset.ch); return; }
    const ex = e.target.closest('[data-ex]');
    if (ex) { const inp = this.body.querySelector('[data-expr]'); inp.value = ex.dataset.ex; this.paren(); }
  }

  // ——— угадай вывод ———
  renderQuiz() {
    this.body.innerHTML = `<div class="dr-cats" data-cats></div>
      <div class="dr-stats" data-stats></div>
      <div class="dr-card" data-card></div>`;
    this.renderCats();
    this.next();
  }
  renderCats() {
    const el = this.body.querySelector('[data-cats]');
    if (!el) return;
    el.innerHTML = `<button class="chip ${this.cats ? '' : 'active'}" data-cat="all">Всё вперемешку</button>` +
      Object.entries(DRILL_CATS).map(([k, v]) => `<button class="chip ${this.cats?.includes(k) ? 'active' : ''}" data-cat="${k}">${v}</button>`).join('');
  }
  renderStats() {
    const s = stats();
    const d = store.get('drill.stats', { ok: 0, all: 0 });
    this.body.querySelector('[data-stats]').innerHTML = `
      <span class="dr-st ${s.combo >= 3 ? 'hot' : ''}"><b>${s.combo}</b><small>серия</small></span>
      <span class="dr-st"><b>${s.best}</b><small>лучшая серия</small></span>
      <span class="dr-st"><b>${d.ok}<i>/${d.all}</i></b><small>верных ответов</small></span>
      <span class="dr-st"><b>${d.all ? Math.round((d.ok / d.all) * 100) : 0}%</b><small>точность</small></span>`;
  }
  next() {
    if (!this.body.querySelector('[data-card]')) return;
    this.answered = false;
    let q, r;
    for (let i = 0; i < 20; i++) {
      q = makeQuestion(Math.random, this.cats);
      r = runToEnd(q.code);
      if (!r.compileError && !r.error) break;
    }
    this.q = q;
    this.ans = r.output.replace(/\n$/, '');
    this.opts4 = choices(q, r.output);
    this.renderStats();
    const card = this.body.querySelector('[data-card]');
    card.className = 'dr-card';
    card.innerHTML = `
      <div class="dr-code"><div class="dr-code-h"><span class="dr-tag">${DRILL_CATS[q.cat]}</span><span class="muted">main.c</span></div>
        <pre>${highlight(q.code).split('\n').map((l, i) => `<span class="dr-ln">${i + 1}</span>${l}`).join('\n')}</pre></div>
      <div class="dr-q">
        <h3>Что напечатает программа?</h3>
        <div class="dr-opts">${this.opts4.map((o, i) => `<button class="dr-opt" data-opt="${i}"><kbd>${i + 1}</kbd><code>${esc(o)}</code></button>`).join('')}</div>
        <div class="dr-why" data-why hidden></div>
      </div>`;
    void card.offsetWidth;
    card.classList.add('enter');
  }
  answer(i) {
    if (this.answered) return;
    this.answered = true;
    const ok = this.opts4[i] === this.ans;
    const d = store.get('drill.stats', { ok: 0, all: 0 });
    d.all++; if (ok) d.ok++;
    store.set('drill.stats', d);
    const ev = award(ok ? 'drill' : 'drillMiss');
    if (ok && (stats().combo % 5 === 0 || ev.levelUp)) { const r = this.body.querySelectorAll('[data-opt]')[i].getBoundingClientRect(); confetti(r.left + r.width / 2, r.top); }
    const btns = this.body.querySelectorAll('[data-opt]');
    btns.forEach((b, k) => {
      b.disabled = true;
      if (this.opts4[k] === this.ans) b.classList.add('right');
      else if (k === i) b.classList.add('wrong');
    });
    const card = this.body.querySelector('[data-card]');
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add(ok ? 'is-good' : 'is-bad');
    const why = this.body.querySelector('[data-why]');
    why.hidden = false;
    why.innerHTML = `<div class="dr-verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Верно!' : 'Не совсем.'} <span>Программа выводит:</span> <code>${esc(this.ans)}</code></div>
      <p>${esc(this.q.why)}</p>
      <div class="dr-act"><button class="btn primary" data-next>Следующая <kbd>Enter</kbd></button><button class="btn ghost" data-lab>Посмотреть по шагам во вселенной</button></div>`;
    this.renderStats();
    why.querySelector('[data-next]').focus({ preventScroll: true });
  }

  // ——— ASCII ———
  renderAscii() {
    const cell = (c) => `<button class="as-c ${c >= 48 && c <= 57 ? 'dig' : (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? 'let' : ''}" data-ch="${c}"><b>${c === 32 ? '␣' : esc(String.fromCharCode(c))}</b><small>${c}</small></button>`;
    let grid = '';
    for (let c = 32; c < 127; c++) grid += cell(c);
    this.body.innerHTML = `<div class="as-wrap">
      <div class="as-grid">${grid}</div>
      <aside class="as-side">
        <div class="as-info" data-info></div>
        <h4>Управляющие символы</h4>
        <table class="as-ctl">
          <tr><td><code>'\\0'</code></td><td>0</td><td>конец строки</td></tr>
          <tr><td><code>'\\t'</code></td><td>9</td><td>табуляция</td></tr>
          <tr><td><code>'\\n'</code></td><td>10</td><td>перевод строки</td></tr>
          <tr><td><code>'\\r'</code></td><td>13</td><td>возврат каретки</td></tr>
          <tr><td><code>' '</code></td><td>32</td><td>пробел</td></tr>
        </table>
        <h4>Полезно запомнить</h4>
        <ul class="as-tips">
          <li><code>'0'</code>…<code>'9'</code> = 48…57, поэтому <code>c - '0'</code> — значение цифры.</li>
          <li><code>'A'</code> = 65, <code>'a'</code> = 97: разница 32.</li>
          <li>Буквы идут подряд: <code>'A' + 2 == 'C'</code>.</li>
        </ul>
      </aside></div>`;
    this.showChar(65);
  }
  showChar(c) {
    this.body.querySelectorAll('.as-c').forEach(b => b.classList.toggle('on', +b.dataset.ch === c));
    const ch = String.fromCharCode(c);
    const lit = c === 39 ? "'\\''" : c === 92 ? "'\\\\'" : `'${ch}'`;
    const kind = c >= 48 && c <= 57 ? `цифра ${ch}: <code>${lit} - '0'</code> = ${c - 48}` : c >= 65 && c <= 90 ? `прописная буква, строчная — <code>'${ch.toLowerCase()}'</code> (${c + 32})` : c >= 97 && c <= 122 ? `строчная буква, прописная — <code>'${ch.toUpperCase()}'</code> (${c - 32})` : c === 32 ? 'пробел' : 'знак';
    this.body.querySelector('[data-info]').innerHTML = `<div class="as-big">${c === 32 ? '␣' : esc(ch)}</div>
      <div class="as-rows"><span>в C</span><code>${esc(lit)}</code><span>десятичный</span><code>${c}</code><span>шестнадцатеричный</span><code>0x${c.toString(16).toUpperCase()}</code><span>двоичный</span><code>${c.toString(2).padStart(8, '0')}</code></div>
      <p>${kind}</p>`;
  }

  // ——— приоритет ———
  renderPrec() {
    const rows = [
      ['()  []  ->  .  x++  x--', 'слева направо', 'вызов, индекс, поле, постфиксные ++ --'],
      ['!  ~  ++x  --x  -x  +x  *p  &x  (тип)  sizeof', 'справа налево', 'унарные операции'],
      ['*  /  %', 'слева направо', 'умножение, деление, остаток'],
      ['+  -', 'слева направо', 'сложение, вычитание'],
      ['<<  >>', 'слева направо', 'сдвиги битов'],
      ['<  <=  >  >=', 'слева направо', 'сравнения'],
      ['==  !=', 'слева направо', 'равно, не равно'],
      ['&', 'слева направо', 'побитовое И'],
      ['^', 'слева направо', 'побитовое исключающее ИЛИ'],
      ['|', 'слева направо', 'побитовое ИЛИ'],
      ['&&', 'слева направо', 'логическое И (короткое вычисление)'],
      ['||', 'слева направо', 'логическое ИЛИ (короткое вычисление)'],
      ['?:', 'справа налево', 'тернарная операция'],
      ['=  +=  -=  *=  /=  %=  …', 'справа налево', 'присваивания'],
      [',', 'слева направо', 'запятая'],
    ];
    const samples = ['a + b * c', 'a / b * c', 'x = y = z + 1', 'a < b == c', 'a || b && c', '!a == b', '-x * y++', 'i < n && a[i] > 0', 'x > 0 ? x : -x * 2', 'a & b == c', '*p++ = c', 'k += i * 2 - 1'];
    this.body.innerHTML = `<div class="pr-wrap">
      <section class="pr-try">
        <h3>Расставить скобки</h3>
        <p class="muted">Введите выражение на C — покажем, в каком порядке его на самом деле вычислит компилятор.</p>
        <input class="pr-in" data-expr spellcheck="false" autocomplete="off" value="a + b * c > d && !e">
        <div class="pr-out" data-out></div>
        <div class="pr-ex">${samples.map(s => `<button class="chip" data-ex="${esc(s)}"><code>${esc(s)}</code></button>`).join('')}</div>
      </section>
      <section>
        <h3>Таблица приоритетов <small class="muted">— сверху выполняется раньше</small></h3>
        <table class="pr-tab"><thead><tr><th>#</th><th>Операции</th><th>Порядок</th><th>Что это</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><code>${esc(r[0])}</code></td><td class="muted">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
        </tbody></table>
      </section></div>`;
    const inp = this.body.querySelector('[data-expr]');
    inp.addEventListener('input', () => this.paren());
    this.paren();
  }
  paren() {
    const src = this.body.querySelector('[data-expr]').value.trim();
    const out = this.body.querySelector('[data-out]');
    if (!src) { out.innerHTML = ''; return; }
    try {
      const code = `int main(void) {\n${src};\n}\n`;
      const pp = preprocess(tokenize(code), HEADERS);
      const prog = parse(pp.tokens, { typedefs: {}, lines: code.split('\n') });
      const fn = (prog.body || prog.decls || prog.items || []).find(d => d.type === 'FuncDef');
      const stmt = fn.body.body[0];
      if (!stmt || stmt.type !== 'ExprStmt') throw new Error('Нужно выражение');
      let depth = 0;
      const P = (s) => { const d = depth % 4; return `<span class="pr-p d${d}"><i>(</i>${s}<i>)</i></span>`; };
      const show = (n) => {
        depth++;
        let r;
        switch (n.type) {
          case 'Num': r = esc(n.raw); break;
          case 'Ident': case 'EnumConst': r = esc(n.name); break;
          case 'Char': r = esc(JSON.stringify(String.fromCharCode(n.value)).replace(/^"|"$/g, "'")); break;
          case 'Str': r = '"…"'; break;
          case 'Binary': case 'Logical': r = P(`${show(n.left)} <b>${esc(n.op)}</b> ${show(n.right)}`); break;
          case 'Assign': r = P(`${show(n.target)} <b>${esc(n.op)}</b> ${show(n.value)}`); break;
          case 'Cond': r = P(`${show(n.cond)} <b>?</b> ${show(n.a)} <b>:</b> ${show(n.b)}`); break;
          case 'Unary': r = P(`<b>${esc(n.op)}</b>${show(n.arg)}`); break;
          case 'AddrOf': r = P(`<b>&amp;</b>${show(n.arg)}`); break;
          case 'Deref': r = P(`<b>*</b>${show(n.arg)}`); break;
          case 'Update': r = P(n.prefix ? `<b>${n.op}</b>${show(n.arg)}` : `${show(n.arg)}<b>${n.op}</b>`); break;
          case 'Cast': r = P(`<b>(${esc(typeName(n.ctype))})</b>${show(n.arg)}`); break;
          case 'Index': r = `${show(n.obj)}[${show(n.index)}]`; break;
          case 'Member': r = `${show(n.obj)}${n.arrow ? '-&gt;' : '.'}${esc(n.field)}`; break;
          case 'Call': r = `${n.callee ? esc(n.callee) : show(n.calleeNode)}(${n.args.map(show).join(', ')})`; break;
          case 'SizeofExpr': r = P(`<b>sizeof</b> ${show(n.arg)}`); break;
          case 'SizeofType': r = `sizeof(${esc(typeName(n.ctype))})`; break;
          case 'Comma': r = P(n.list.map(show).join(' <b>,</b> ')); break;
          default: r = '?';
        }
        depth--;
        return r;
      };
      const html = show(stmt.expr);
      const strip = html.replace(/^<span class="pr-p d\d"><i>\(<\/i>([\s\S]*)<i>\)<\/i><\/span>$/, '$1');
      out.innerHTML = `<div class="pr-res">${strip}</div><small class="muted">Цветные скобки — порядок: чем глубже, тем раньше вычисляется.</small>`;
    } catch (e) {
      out.innerHTML = `<div class="pr-err">Не получилось разобрать: ${esc(e.diag?.message || e.message)}</div>`;
    }
  }
}
