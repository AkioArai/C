// Лёгкий редактор кода: textarea поверх подсвеченного <pre>, номера строк,
// точки останова, подчёркивание ошибок и подсветка выполняемой строки.
import { highlight } from './highlight.js';
import { complete, signatureAt, expandSnippet, recordUse, kindIcon, kindLabel } from './complete.js';
import { settings } from './settings.js';
import { FindBar } from './find.js';

const escH = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class Editor {
  constructor(root, opts = {}) {
    this.opts = opts;
    this.root = root;
    this.breakpoints = new Set();
    this.diags = [];
    this.execLine = 0;
    root.innerHTML = `<div class="ed">
      <div class="ed-scroll">
        <div class="ed-inner">
          <div class="ed-gutter" aria-hidden="true"></div>
          <div class="ed-code">
            <div class="ed-bg" aria-hidden="true"></div>
            <pre class="ed-hl" aria-hidden="true"></pre>
            <div class="ed-marks" aria-hidden="true"></div>
            <div class="ed-ac" hidden></div>
            <div class="ed-sig" hidden></div>
            <textarea class="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Код программы на C"></textarea>
          </div>
        </div>
      </div></div>`;
    this.edEl = root.querySelector('.ed');
    this.scroll = root.querySelector('.ed-scroll');
    this.gutter = root.querySelector('.ed-gutter');
    this.hl = root.querySelector('.ed-hl');
    this.bg = root.querySelector('.ed-bg');
    this.marks = root.querySelector('.ed-marks');
    this.ta = root.querySelector('.ed-ta');
    this.ac = root.querySelector('.ed-ac');
    this.sig = root.querySelector('.ed-sig');
    this.ta.addEventListener('input', (e) => { this.trackSnippet(); this.refresh(true); this.updateComplete(e.inputType); this.updateSignature(); });
    this.ta.addEventListener('blur', () => setTimeout(() => { this.hideComplete(); this.sig.hidden = true; }, 150));
    this.ta.addEventListener('click', () => { this.hideComplete(); this.snip = null; this.updateSignature(); this.emitCursor(); });
    this.ta.addEventListener('keyup', (e) => { if (/^Arrow|Home|End|Page/.test(e.key)) { this.updateSignature(); this.emitCursor(); } });
    this.ac.addEventListener('mousedown', (e) => {
      const it = e.target.closest('[data-i]');
      if (!it) return;
      e.preventDefault();
      this.acSel = +it.dataset.i;
      this.acceptComplete();
    });
    this.ac.addEventListener('mousemove', (e) => {
      const it = e.target.closest('[data-i]');
      if (it && +it.dataset.i !== this.acSel) { this.acSel = +it.dataset.i; this.renderComplete(true); }
    });
    this.ta.addEventListener('keydown', (e) => this.onKey(e));
    this.gutter.addEventListener('click', (e) => {
      const ln = +e.target.closest('[data-ln]')?.dataset.ln;
      if (!ln) return;
      if (this.breakpoints.has(ln)) this.breakpoints.delete(ln); else this.breakpoints.add(ln);
      this.renderGutter();
      this.opts.onBreakpoints?.(this.breakpoints);
    });
    new ResizeObserver(() => this.measure()).observe(root);
    settings.on((k) => { if (k.startsWith('editor.')) setTimeout(() => { this.measure(); this.refresh(false); }, 30); });
    this.measure();
    this.find = new FindBar(this);
  }

  measure() {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(50);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    this.hl.appendChild(probe);
    this.cw = probe.getBoundingClientRect().width / 50 || 8.4;
    probe.remove();
    const cs = getComputedStyle(this.hl);
    this.lh = parseFloat(cs.lineHeight) || 21;
    this.pad = parseFloat(cs.paddingTop) || 10;
    this.padL = parseFloat(cs.paddingLeft) || 12;
    this.renderMarks();
    this.renderBg();
  }

  get value() { return this.ta.value; }
  set value(v) {
    this.ta.value = v.replace(/\t/g, '    ').replace(/\r/g, '');
    this.refresh(false);
  }

  refresh(changed) {
    const v = this.ta.value;
    this.hl.innerHTML = highlight(v) + '\n';
    const lines = v.split('\n');
    this.lineCount = lines.length;
    const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
    this.ta.style.height = (lines.length * this.lh + this.pad * 2 + 40) + 'px';
    this.ta.style.width = `max(100%, ${Math.ceil((maxLen + 4) * this.cw + this.padL * 2)}px)`;
    this.hl.style.width = this.ta.style.width;
    this.renderGutter();
    if (changed) {
      this.diags = [];
      this.renderMarks();
      this.opts.onChange?.(v);
    }
    this.drawMini();
  }

  /** Миникарта справа: силуэт всего кода, текущая строка, ошибки и видимая область. */
  drawMini() {
    if (!this.mini) {
      this.mini = document.createElement('canvas');
      this.mini.className = 'ed-mini';
      this.edEl.appendChild(this.mini);
      const jump = (e) => {
        const r = this.mini.getBoundingClientRect();
        const line = (e.clientY - r.top) / this.miniScale;
        this.scroll.scrollTop = Math.max(0, line * this.lh - this.scroll.clientHeight / 2);
      };
      this.mini.addEventListener('pointerdown', (e) => { e.preventDefault(); this.mini.setPointerCapture(e.pointerId); jump(e); const mv = (ev) => jump(ev); this.mini.addEventListener('pointermove', mv); this.mini.addEventListener('pointerup', () => this.mini.removeEventListener('pointermove', mv), { once: true }); });
      this.scroll.addEventListener('scroll', () => this.drawMini(), { passive: true });
    }
    const on = settings.get('editor.minimap') !== false;
    this.mini.hidden = !on;
    this.edEl.classList.toggle('has-mini', on);
    if (!on) return;
    const lines = this.ta.value.split('\n');
    const W = 64, H = this.edEl.clientHeight;
    if (!H) return;
    const dpr = devicePixelRatio || 1;
    if (this.mini.width !== W * dpr || this.mini.height !== H * dpr) { this.mini.width = W * dpr; this.mini.height = H * dpr; this.mini.style.height = H + 'px'; }
    const g = this.mini.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const lh = Math.min(3, Math.max(1, (H - 8) / Math.max(1, lines.length)));
    this.miniScale = lh;
    const css = getComputedStyle(document.documentElement);
    const c = (v) => css.getPropertyValue(v).trim();
    // видимая область
    const top = this.scroll.scrollTop / this.lh * lh, vis = this.scroll.clientHeight / this.lh * lh;
    g.fillStyle = c('--tint2') || 'rgba(255,255,255,.07)';
    g.fillRect(0, top, W, Math.max(8, vis));
    const errs = new Set((this.diags || []).filter(d => d.severity === 'error').map(d => d.line));
    lines.forEach((l, i) => {
      const y = 4 + i * lh;
      const ind = l.length - l.trimStart().length, len = l.trim().length;
      if (!len) return;
      g.fillStyle = errs.has(i + 1) ? c('--red') : /^\s*(\/\/|\/\*|\*)/.test(l) ? c('--syn-com') : /^\s*#/.test(l) ? c('--syn-pre') : /\b(for|while|if|else|do|switch|return)\b/.test(l) ? c('--syn-kw') : c('--muted');
      g.globalAlpha = 0.75;
      g.fillRect(4 + Math.min(ind, 30) * 0.9, y, Math.min(len, 60) * 0.9, Math.max(1, lh - 0.6));
    });
    g.globalAlpha = 1;
    if (this.execLine) { g.fillStyle = c('--accent'); g.fillRect(0, 4 + (this.execLine - 1) * lh - 1, W, Math.max(2, lh + 1)); }
    for (const b of this.breakpoints) { g.fillStyle = c('--red'); g.fillRect(0, 4 + (b - 1) * lh, 3, Math.max(2, lh)); }
  }

  renderGutter() {
    let h = '';
    const byLine = new Map();
    for (const d of this.diags) {
      const cur = byLine.get(d.line);
      const rank = { error: 3, warning: 2, note: 1 };
      if (!cur || rank[d.severity] > rank[cur.severity]) byLine.set(d.line, d);
    }
    for (let i = 1; i <= this.lineCount; i++) {
      const d = byLine.get(i);
      const cls = ['g-ln'];
      if (this.breakpoints.has(i)) cls.push('bp');
      if (d) cls.push('d-' + d.severity);
      if (i === this.execLine) cls.push('exec');
      h += `<div class="${cls.join(' ')}" data-ln="${i}" ${d ? `title="${d.message.replace(/"/g, '&quot;')}"` : ''}>${i}</div>`;
    }
    this.gutter.innerHTML = h;
  }

  setDiagnostics(diags) {
    this.diags = diags || [];
    this.renderGutter();
    this.renderMarks();
    this.renderBg();
    this.drawMini?.();
  }

  renderMarks() {
    if (!this.marks) return;
    let h = '';
    for (const d of this.diags) {
      if (!d.line) continue;
      const top = this.pad + (d.line - 1) * this.lh + this.lh - 3;
      const left = this.padL + (d.col - 1) * this.cw;
      const w = Math.max(1, d.len) * this.cw;
      h += `<div class="sq sq-${d.severity}" style="top:${top}px;left:${left}px;width:${w}px" title="${d.message.replace(/"/g, '&quot;')}"></div>`;
    }
    // значения переменных справа от строки (как в отладчике)
    if (this.inline?.size) {
      const lines = this.ta.value.split('\n');
      for (const [ln, vals] of this.inline) {
        const src = lines[ln - 1];
        if (src == null) continue;
        const width = src.replace(/\t/g, '    ').length;
        const txt = [...vals.entries()].map(([k, v]) => `${k} = ${v}`).join('   ');
        const fresh = this.inlineFresh === ln ? ' fresh' : '';
        h += `<div class="ed-inl${fresh}" style="top:${this.pad + (ln - 1) * this.lh}px;left:${this.padL + (width + 3) * this.cw}px;height:${this.lh}px;line-height:${this.lh}px">${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`;
      }
    }
    this.marks.innerHTML = h;
  }

  /** map: номер строки -> Map(имя -> значение); fresh — строка последней записи (подсвечивается). */
  setInline(map, fresh) { this.inline = map; this.inlineFresh = fresh; this.renderMarks(); }

  renderBg() {
    let h = '';
    const lines = new Set(this.diags.filter(d => d.severity === 'error').map(d => d.line));
    for (const l of lines) h += `<div class="lb lb-err" style="top:${this.pad + (l - 1) * this.lh}px;height:${this.lh}px"></div>`;
    for (const l of this.breakpoints) h += `<div class="lb lb-bp" style="top:${this.pad + (l - 1) * this.lh}px;height:${this.lh}px"></div>`;
    if (this.execLine) h += `<div class="lb lb-exec ${this.execKind || ''}" style="top:${this.pad + (this.execLine - 1) * this.lh}px;height:${this.lh}px"></div>`;
    if (this.flashLine) h += `<div class="lb lb-flash" style="top:${this.pad + (this.flashLine - 1) * this.lh}px;height:${this.lh}px"></div>`;
    this.bg.innerHTML = h;
  }

  setExecLine(line, kind = '') {
    this.execLine = line;
    this.execKind = kind;
    this.drawMini?.();
    this.renderBg();
    this.renderGutter();
    if (line) this.reveal(line);
  }

  reveal(line) {
    const top = this.pad + (line - 1) * this.lh;
    const s = this.scroll;
    if (top < s.scrollTop + this.lh || top > s.scrollTop + s.clientHeight - this.lh * 2)
      s.scrollTo({ top: Math.max(0, top - s.clientHeight / 3), behavior: 'smooth' });
  }

  flash(line, col) {
    this.flashLine = line;
    this.renderBg();
    this.reveal(line);
    clearTimeout(this._fl);
    this._fl = setTimeout(() => { this.flashLine = 0; this.renderBg(); }, 1600);
    if (col != null) {
      const lines = this.ta.value.split('\n');
      let off = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
      off += Math.max(0, col - 1);
      this.ta.focus({ preventScroll: true });
      this.ta.setSelectionRange(off, off);
    }
  }

  setReadOnly(ro) { this.ta.readOnly = ro; this.edEl.classList.toggle('ro', ro); }

  insert(text) {
    const ta = this.ta;
    ta.focus();
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      this.refresh(true);
    }
  }

  emitCursor() {
    const p = this.ta.selectionStart, v = this.ta.value;
    const ln = v.slice(0, p).split('\n').length, col = p - v.lastIndexOf('\n', p - 1);
    this.opts.onCursor?.(ln, col);
  }
  caretXY(pos = this.ta.selectionStart) {
    const before = this.ta.value.slice(0, pos);
    const line = before.split('\n').length - 1;
    const col = pos - (before.lastIndexOf('\n') + 1);
    return { top: this.pad + line * this.lh, left: this.padL + col * this.cw, line, col };
  }
  get tabStr() { return ' '.repeat(settings.get('editor.tabSize')); }

  // ——— подсказки при наборе ———
  updateComplete(inputType, force) {
    if (this._accepting) return;
    const on = settings.get('complete.enabled') && this.opts.complete !== false;
    if (this.ta.readOnly || !on || (!force && inputType && !inputType.startsWith('insert'))) { this.hideComplete(); return; }
    const pos = this.ta.selectionStart;
    if (pos !== this.ta.selectionEnd) { this.hideComplete(); return; }
    const r = complete(this.ta.value, pos, {
      fuzzy: settings.get('complete.fuzzy'), snippets: settings.get('complete.snippets'), formats: settings.get('complete.formats'),
      minChars: settings.get('complete.minChars'), force,
    });
    if (!r || !r.items.length) { this.hideComplete(); return; }
    this.acData = r;
    this.acSel = 0;
    this.renderComplete();
  }
  renderComplete(keepScroll) {
    const r = this.acData;
    const { top, left } = this.caretXY();
    const it = r.items[this.acSel];
    const ghostOn = settings.get('complete.ghost') && it.label.startsWith(r.prefix) && it.kind !== 'snip';
    const rest = ghostOn ? it.label.slice(r.prefix.length) : '';
    const key = { right: '→', right_enter: '→', tab: 'Tab', all: '→' }[settings.get('complete.accept')];
    const hl = (x) => { let o = ''; for (let i = 0; i < x.label.length; i++) o += x.hits.includes(i) ? `<b>${escH(x.label[i])}</b>` : escH(x.label[i]); return o; };
    const listLeft = Math.max(0, left - r.prefix.length * this.cw - 26);
    const doc = it.kind === 'snip' ? `<pre class="ac-snip">${escH(expandSnippet(it.insert, '').text)}</pre>` : '';
    this.ac.innerHTML = `${rest ? `<div class="ac-ghost" style="top:${top}px;left:${left}px">${escH(rest)}<span class="ac-key">${key}</span></div>` : ''}
      <div class="ac-box" style="top:${top + this.lh + 2}px;left:${listLeft}px">
        <div class="ac-list">${r.items.slice(0, 40).map((x, i) =>
          `<div class="ac-it${i === this.acSel ? ' on' : ''}" data-i="${i}"><span class="ac-ic k-${x.kind}">${escH(kindIcon(x.kind))}</span><code>${hl(x)}</code><span class="ac-dt">${escH(x.detail || '')}</span></div>`).join('')}</div>
        <div class="ac-doc"><div class="ac-doc-h"><b>${escH(it.label)}</b><span>${escH(kindLabel(it.kind))}${it.header ? ' · ' + escH(it.header) : ''}</span></div>${it.detail && it.kind === 'fn' ? `<code class="ac-sigl">${escH(it.detail)}</code>` : ''}<p>${escH(it.desc || '')}</p>${doc}
          <div class="ac-hint">${key} или Enter — вставить · ↑↓ — выбрать · Esc — скрыть</div></div>
      </div>`;
    this.ac.hidden = false;
    // не вылезать за правый край экрана
    const box = this.ac.querySelector('.ac-box');
    const over = box.getBoundingClientRect().right - innerWidth + 8;
    if (over > 0) box.style.left = Math.max(0, listLeft - over) + 'px';
    const on = this.ac.querySelector('.ac-it.on');
    if (on && !keepScroll) on.scrollIntoView({ block: 'nearest' });
  }
  hideComplete() { if (this.ac) { this.ac.hidden = true; this.acData = null; } }
  acceptComplete() {
    const r = this.acData;
    if (!r) return false;
    const it = r.items[this.acSel];
    this.hideComplete();
    recordUse(it.label);
    const ta = this.ta;
    const v = ta.value;
    const lineStart = v.lastIndexOf('\n', r.from - 1) + 1;
    const indent = v.slice(lineStart).match(/^ */)[0];
    let body = it.insert;
    // не дублировать уже стоящие скобку/угловую скобку
    if (body.endsWith('($1)') && v[r.to] === '(') body = body.slice(0, -4);
    ta.setSelectionRange(r.from, r.to);
    this._accepting = true;
    if (/\$\{?\d/.test(body)) this.insertSnippet(body, indent);
    else this.insert(body);
    this._accepting = false;
    if (it.kind === 'hdr' || body.endsWith('<')) this.updateComplete('insertText');
    this.updateSignature();
    return true;
  }

  // ——— шаблоны с полями (Tab — следующее поле) ———
  insertSnippet(body, indent) {
    const { text, stops } = expandSnippet(body, indent, this.tabStr);
    const start = this.ta.selectionStart;
    this.insert(text);
    this.snip = { stops: stops.map(s => ({ ...s, start: s.start + start, end: s.end + start })), idx: -1, len: this.ta.value.length };
    this.nextStop();
  }
  nextStop(back) {
    const sn = this.snip;
    if (!sn) return false;
    sn.idx += back ? -1 : 1;
    if (sn.idx < 0) sn.idx = 0;
    const st = sn.stops[sn.idx];
    if (!st) { this.snip = null; return false; }
    this.ta.setSelectionRange(st.start, st.end);
    if (st.n === 0 || sn.idx === sn.stops.length - 1) this.snip = null;
    this.renderSnipMarks();
    return true;
  }
  /** Сдвинуть поля шаблона после правки внутри текущего поля. */
  trackSnippet() {
    const sn = this.snip;
    if (!sn) return;
    const delta = this.ta.value.length - sn.len;
    sn.len = this.ta.value.length;
    const cur = sn.stops[sn.idx];
    const p = this.ta.selectionStart;
    if (!cur || p < cur.start || p > cur.end + Math.max(0, delta)) { this.snip = null; this.renderSnipMarks(); return; }
    cur.end += delta;
    for (let k = sn.idx + 1; k < sn.stops.length; k++) { sn.stops[k].start += delta; sn.stops[k].end += delta; }
    this.renderSnipMarks();
  }
  renderSnipMarks() {
    this.root.querySelectorAll('.snip-mark').forEach(e => e.remove());
    if (!this.snip) return;
    for (const st of this.snip.stops.slice(this.snip.idx + 1)) {
      if (st.n === 0) continue;
      const a = this.caretXY(st.start);
      const d = document.createElement('div');
      d.className = 'snip-mark';
      d.style.cssText = `top:${a.top}px;left:${a.left}px;width:${Math.max(2, (st.end - st.start) * this.cw)}px;height:${this.lh}px`;
      this.marks.appendChild(d);
    }
  }

  // ——— подсказка параметров функции ———
  updateSignature() {
    if (!settings.get('complete.signature') || this.ta.readOnly) { this.sig.hidden = true; return; }
    const pos = this.ta.selectionStart;
    const sg = signatureAt(this.ta.value, pos);
    if (!sg) { this.sig.hidden = true; return; }
    const { top, left } = this.caretXY();
    const ps = sg.params.map((p, k) => {
      const act = sg.variadic && k === sg.params.length - 1 ? sg.active >= sg.params.length - 1 : k === sg.active;
      return `<span class="${act ? 'act' : ''}">${escH(p)}</span>`;
    }).join(', ');
    let extra = '';
    if (sg.spec?.text) extra = `<div class="sg-spec">аргумент ${sg.spec.n} из ${sg.spec.total} → для <code>${escH(sg.spec.text)}</code>: ${escH(sg.spec.desc)}${sg.spec.needAddr ? '. Нужен <b>адрес</b>: поставьте &amp; перед именем' : ''}</div>`;
    else if (sg.spec?.extra) extra = `<div class="sg-spec warn">лишний аргумент: в строке формата всего ${sg.spec.total} спецификатор(а)</div>`;
    this.sig.innerHTML = `<code>${escH(sg.ret)} <b>${escH(sg.name)}</b>(${ps})</code>${sg.desc ? `<div class="sg-d">${escH(sg.desc)}</div>` : ''}${extra}`;
    this.sig.style.top = Math.max(0, top - 6) + 'px';
    this.sig.style.left = Math.max(0, left - 40) + 'px';
    this.sig.hidden = false;
  }

  acceptKey(e) {
    const mode = settings.get('complete.accept');
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false;
    if (e.key === 'ArrowRight') return mode !== 'tab';
    if (e.key === 'Enter') return mode === 'right_enter' || mode === 'all';
    if (e.key === 'Tab') return mode === 'tab' || mode === 'all';
    return false;
  }

  onKey(e) {
    const ta = this.ta;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h') && !e.shiftKey) { e.preventDefault(); this.hideComplete(); this.find.open(e.key.toLowerCase() === 'h'); return; }
    if (this.acData && !this.ac.hidden) {
      if (this.acceptKey(e)) { e.preventDefault(); this.acceptComplete(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        const n = Math.min(40, this.acData.items.length);
        const step = e.key.startsWith('Page') ? 8 : 1;
        const down = e.key === 'ArrowDown' || e.key === 'PageDown';
        if (step === 1) this.acSel = (this.acSel + (down ? 1 : n - 1)) % n;
        else this.acSel = down ? Math.min(n - 1, this.acSel + step) : Math.max(0, this.acSel - step);
        this.renderComplete();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); this.hideComplete(); return; }
      if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') this.hideComplete();
    }
    if (e.key === 'Escape') { this.sig.hidden = true; this.snip = null; this.renderSnipMarks(); }
    if (mod && e.key === ' ') { e.preventDefault(); this.updateComplete('insertText', true); return; }
    // Tab внутри шаблона — к следующему полю
    if (e.key === 'Tab' && this.snip && !mod) { e.preventDefault(); this.nextStop(e.shiftKey); return; }
    const v = ta.value;
    const s = ta.selectionStart, en = ta.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const lineEndI = v.indexOf('\n', en); const lineEnd = lineEndI < 0 ? v.length : lineEndI;
    const curLine = v.slice(lineStart, s);
    const indent = curLine.match(/^ */)[0];
    const T = this.tabStr;
    if (mod && e.key === 'Enter') { e.preventDefault(); this.opts.onRun?.(); return; }
    // дублировать строку
    if (mod && e.key.toLowerCase() === 'd' && !e.shiftKey) {
      e.preventDefault();
      const text = v.slice(lineStart, lineEnd);
      ta.setSelectionRange(lineEnd, lineEnd);
      this.insert('\n' + text);
      ta.setSelectionRange(s + text.length + 1, en + text.length + 1);
      return;
    }
    // переместить строку вверх/вниз
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const up = e.key === 'ArrowUp';
      if (up && lineStart === 0) return;
      if (!up && lineEnd >= v.length) return;
      const text = v.slice(lineStart, lineEnd);
      if (up) {
        const pStart = v.lastIndexOf('\n', lineStart - 2) + 1;
        const prev = v.slice(pStart, lineStart - 1);
        ta.setSelectionRange(pStart, lineEnd);
        this.insert(text + '\n' + prev);
        ta.setSelectionRange(s - prev.length - 1, en - prev.length - 1);
      } else {
        const nEndI = v.indexOf('\n', lineEnd + 1); const nEnd = nEndI < 0 ? v.length : nEndI;
        const next = v.slice(lineEnd + 1, nEnd);
        ta.setSelectionRange(lineStart, nEnd);
        this.insert(next + '\n' + text);
        ta.setSelectionRange(s + next.length + 1, en + next.length + 1);
      }
      return;
    }
    if (mod && e.key === '/') {
      e.preventDefault();
      const block = v.slice(lineStart, lineEnd);
      const ls = block.split('\n');
      const all = ls.every(l => /^\s*\/\//.test(l) || !l.trim());
      const nb = ls.map(l => (all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
      ta.setSelectionRange(lineStart, lineEnd);
      this.insert(nb);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (s !== en && v.slice(s, en).includes('\n')) {
        const le = v.indexOf('\n', en - 1); const end = le < 0 ? v.length : le;
        const ls = v.slice(lineStart, end).split('\n');
        const re = new RegExp(`^ {1,${T.length}}`);
        const nb = ls.map(l => (e.shiftKey ? l.replace(re, '') : T + l)).join('\n');
        ta.setSelectionRange(lineStart, end);
        this.insert(nb);
        ta.setSelectionRange(lineStart, lineStart + nb.length);
      } else if (e.shiftKey) {
        const m = curLine.match(new RegExp(`^ {1,${T.length}}`));
        if (m) { ta.setSelectionRange(lineStart, lineStart + m[0].length); this.insert(''); }
      } else this.insert(T.slice(curLine.length % T.length));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.snip = null;
      const before = v.slice(0, s).trimEnd();
      const after = v.slice(en);
      let add = indent;
      if (before.endsWith('{') || /^\s*(case\b.*|default\s*):\s*$/.test(v.slice(lineStart, s))) {
        add = indent + T;
        if (/^\s*}/.test(after)) { this.insert('\n' + add + '\n' + indent); ta.setSelectionRange(s + 1 + add.length, s + 1 + add.length); return; }
      }
      this.insert('\n' + add);
      return;
    }
    if (e.key === '}' && /^ +$/.test(curLine)) {
      e.preventDefault();
      ta.setSelectionRange(lineStart, s);
      this.insert(curLine.slice(T.length) + '}');
      return;
    }
    // автозакрытие скобок и кавычек
    if (settings.get('editor.autoClose') && !mod && !e.altKey) {
      const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
      const next = v[s] || '';
      const prev = v[s - 1] || '';
      if ([')', ']', '}', '"', "'"].includes(e.key) && s === en && next === e.key) {
        e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); this.updateSignature(); return;
      }
      if (PAIRS[e.key]) {
        const quote = e.key === '"' || e.key === "'";
        const inWord = /\w/.test(prev) && quote;
        if (s !== en) { e.preventDefault(); const sel = v.slice(s, en); this.insert(e.key + sel + PAIRS[e.key]); ta.setSelectionRange(s + 1, s + 1 + sel.length); return; }
        if (!inWord && (!next || /[\s)\]};,]/.test(next))) {
          e.preventDefault(); this.insert(e.key + PAIRS[e.key]); ta.setSelectionRange(s + 1, s + 1);
          this.updateSignature();
          if (e.key === '"') this.updateComplete('insertText');
          return;
        }
      }
      if (e.key === 'Backspace' && s === en && PAIRS[prev] && next === PAIRS[prev]) {
        e.preventDefault(); ta.setSelectionRange(s - 1, s + 1); this.insert(''); return;
      }
    }
  }
}
