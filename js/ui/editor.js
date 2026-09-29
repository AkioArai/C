// Лёгкий редактор кода: textarea поверх подсвеченного <pre>, номера строк,
// точки останова, подчёркивание ошибок и подсветка выполняемой строки.
import { highlight } from './highlight.js';
import { suggest, kindLabel } from './complete.js';

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
    this.ta.addEventListener('input', (e) => { this.refresh(true); this.updateComplete(e.inputType); });
    this.ta.addEventListener('blur', () => setTimeout(() => this.hideComplete(), 120));
    this.ta.addEventListener('click', () => this.hideComplete());
    this.ac.addEventListener('mousedown', (e) => {
      const it = e.target.closest('[data-i]');
      if (!it) return;
      e.preventDefault();
      this.acSel = +it.dataset.i;
      this.acceptComplete();
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
    this.measure();
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
    this.marks.innerHTML = h;
  }

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

  // ——— подсказки ———
  updateComplete(inputType) {
    if (this.ta.readOnly || this.opts.complete === false || (inputType && !inputType.startsWith('insert'))) { this.hideComplete(); return; }
    const pos = this.ta.selectionStart;
    if (pos !== this.ta.selectionEnd) { this.hideComplete(); return; }
    const r = suggest(this.ta.value, pos);
    if (!r) { this.hideComplete(); return; }
    this.acData = r;
    this.acSel = 0;
    this.renderComplete();
  }
  renderComplete() {
    const r = this.acData;
    const pos = this.ta.selectionStart;
    const before = this.ta.value.slice(0, pos);
    const line = before.split('\n').length - 1;
    const col = pos - (before.lastIndexOf('\n') + 1);
    const it = r.items[this.acSel];
    const rest = it.ins.slice(r.prefix.length);
    const top = this.pad + line * this.lh;
    const left = this.padL + col * this.cw;
    this.ac.innerHTML = `<div class="ac-ghost" style="top:${top}px;left:${left}px">${escH(rest)}<span class="ac-key">→</span></div>
      <div class="ac-list" style="top:${top + this.lh + 2}px;left:${Math.max(0, left - r.prefix.length * this.cw - 6)}px">${r.items.map((x, i) =>
        `<div class="ac-it${i === this.acSel ? ' on' : ''}" data-i="${i}"><code><b>${escH(r.prefix)}</b>${escH(x.w.slice(r.prefix.length))}</code><span class="ac-d">${escH(x.d)}</span><span class="ac-k">${kindLabel(x.kind)}</span></div>`).join('')}</div>`;
    this.ac.hidden = false;
  }
  hideComplete() { if (this.ac) { this.ac.hidden = true; this.acData = null; } }
  acceptComplete() {
    const r = this.acData;
    if (!r) return false;
    const it = r.items[this.acSel];
    this.hideComplete();
    let ins = it.ins.slice(r.prefix.length);
    // автоматически закрываем скобку: scanf( → scanf(|)
    let back = 0;
    if (ins.endsWith('(') && !/^\s*\)/.test(this.ta.value.slice(this.ta.selectionStart))) { ins += ')'; back = 1; }
    if (ins.endsWith('<') && !this.ta.value.slice(this.ta.selectionStart).startsWith('>')) { /* заголовок подскажем следующим шагом */ }
    this.insert(ins);
    if (back) { const p = this.ta.selectionStart - back; this.ta.setSelectionRange(p, p); }
    if (ins.endsWith('<')) this.updateComplete('insertText');
    return true;
  }

  onKey(e) {
    const ta = this.ta;
    if (this.acData && !this.ac.hidden) {
      // → принимает подсказку (курсор стоит в конце набираемого слова); Tab остаётся отступом
      if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); this.acceptComplete(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = this.acData.items.length;
        this.acSel = (this.acSel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        this.renderComplete();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); this.hideComplete(); return; }
      if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') this.hideComplete();
    }
    const v = ta.value;
    const s = ta.selectionStart, en = ta.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const curLine = v.slice(lineStart, s);
    const indent = curLine.match(/^ */)[0];
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.opts.onRun?.(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const le = v.indexOf('\n', en); const end = le < 0 ? v.length : le;
      const block = v.slice(lineStart, end);
      const ls = block.split('\n');
      const all = ls.every(l => /^\s*\/\//.test(l) || !l.trim());
      const nb = ls.map(l => (all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
      ta.setSelectionRange(lineStart, end);
      this.insert(nb);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (s !== en && v.slice(s, en).includes('\n')) {
        const le = v.indexOf('\n', en - 1); const end = le < 0 ? v.length : le;
        const ls = v.slice(lineStart, end).split('\n');
        const nb = ls.map(l => (e.shiftKey ? l.replace(/^ {1,4}/, '') : '    ' + l)).join('\n');
        ta.setSelectionRange(lineStart, end);
        this.insert(nb);
        ta.setSelectionRange(lineStart, lineStart + nb.length);
      } else if (e.shiftKey) {
        const m = curLine.match(/^ {1,4}/);
        if (m) { ta.setSelectionRange(lineStart, lineStart + m[0].length); this.insert(''); }
      } else this.insert('    '.slice((curLine.length) % 4));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const before = v.slice(0, s).trimEnd();
      const after = v.slice(en);
      let add = indent;
      if (before.endsWith('{')) {
        add = indent + '    ';
        if (/^\s*}/.test(after)) { this.insert('\n' + add + '\n' + indent); ta.setSelectionRange(s + 1 + add.length, s + 1 + add.length); return; }
      }
      this.insert('\n' + add);
      return;
    }
    if (e.key === '}' && /^ +$/.test(curLine)) {
      e.preventDefault();
      ta.setSelectionRange(lineStart, s);
      this.insert(curLine.slice(4) + '}');
      return;
    }
  }
}
