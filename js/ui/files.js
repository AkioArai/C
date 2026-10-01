// Файлы пользователя: проводник, вкладки, сохранение в браузере, скачивание и открытие с диска.
import { store, confirmClick } from '../store.js';
import { settings } from './settings.js';
import { award } from './xp.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = () => Math.random().toString(36).slice(2, 9);
const BLANK = '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n';
const I = {
  file: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  open: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10H3z"/></svg>',
  down: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  edit: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  del: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  chev: '<svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  x: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

export class Workspace {
  /**
   * opts: { side, tabs, examples, getCode(), setCode(code), getStdin(), setStdin(v), onSwitch(file) }
   */
  constructor(opts) {
    this.o = opts;
    this.files = store.get('fs.files', null);
    if (!this.files) {
      const code = store.get('lab.code', null) ?? opts.examples[0]?.code ?? BLANK;
      this.files = [{ id: uid(), name: 'main.c', code, stdin: store.get('lab.stdin', ''), mtime: Date.now() }];
    }
    this.open = store.get('fs.open', [this.files[0].id]).filter(id => this.byId(id) || id.startsWith('ex:'));
    this.preview = null;           // вкладка-просмотр примера (курсивом), ещё не файл
    this.active = store.get('fs.active', this.open[0] || this.files[0].id);
    if (!this.byId(this.active)) this.active = this.files[0].id;
    if (!this.open.includes(this.active)) this.open.push(this.active);
    this.dirty = new Set();
    this.collapsed = new Set(store.get('fs.collapsed', []));
    this.bind();
    this.persist();
  }

  byId(id) { return this.files.find(f => f.id === id) || (this.preview?.id === id ? this.preview : null); }
  get current() { return this.byId(this.active); }
  persist() {
    store.set('fs.files', this.files);
    store.set('fs.open', this.open.filter(id => !id.startsWith('ex:')));
    store.set('fs.active', this.active?.startsWith?.('ex:') ? (this.files[0]?.id) : this.active);
  }

  // ——— операции ———
  switchTo(id) {
    if (id === this.active) return;
    this.capture();
    this.active = id;
    if (!this.open.includes(id)) this.open.push(id);
    const f = this.current;
    this.o.setCode(f.code);
    this.o.setStdin(f.stdin || '');
    this.persist();
    this.render();
    this.o.onSwitch?.(f);
  }
  /** Забрать текст из редактора в текущий файл (без сохранения на диск, если автосохранение выключено). */
  capture() {
    const f = this.current;
    if (!f) return;
    f.code = this.o.getCode();
    f.stdin = this.o.getStdin();
  }
  /** Вызывается при каждом изменении текста в редакторе. */
  edited() {
    const f = this.current;
    if (!f) return;
    if (f.preview) { this.promote(f); return; }
    f.code = this.o.getCode();
    f.stdin = this.o.getStdin();
    f.mtime = Date.now();
    if (settings.get('editor.autoSave')) { clearTimeout(this._sv); this._sv = setTimeout(() => this.persist(), 300); this.dirty.delete(f.id); }
    else if (!this.dirty.has(f.id)) { this.dirty.add(f.id); this.renderTabs(); }
  }
  save() {
    this.capture();
    const f = this.current;
    if (f?.preview) this.promote(f);
    this.dirty.clear();
    this.persist();
    this.render();
    this.toast('Сохранено в браузере');
  }
  create(name, code = BLANK, stdin = '') {
    name = this.uniqueName(name || 'program.c');
    const f = { id: uid(), name, code, stdin, mtime: Date.now() };
    this.files.push(f);
    this.persist();
    this.switchTo(f.id);
    award('file');
    return f;
  }
  /** Пример, открытый для просмотра, стал настоящим файлом (его начали менять). */
  promote(p) {
    const f = { id: uid(), name: this.uniqueName(p.name), code: this.o.getCode(), stdin: this.o.getStdin(), mtime: Date.now() };
    this.files.push(f);
    this.open = this.open.map(id => (id === p.id ? f.id : id));
    this.preview = null;
    this.active = f.id;
    this.persist();
    this.render();
    this.toast(`Пример сохранён как «${f.name}» в «Мои файлы»`);
  }
  openExample(ex) {
    this.capture();
    if (this.preview) this.open = this.open.filter(id => id !== this.preview.id);
    this.preview = { id: 'ex:' + ex.id, name: (ex.file || ex.id) + '.c', code: ex.code, stdin: ex.stdin || '', preview: true, title: ex.title };
    this.active = null;
    this.switchTo(this.preview.id);
  }
  openText(title, code, stdin = '') {
    this.openExample({ id: 'ext' + uid(), file: title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 28) || 'program', code, stdin, title });
  }
  close(id) {
    if (this.dirty.has(id) && !confirm('Файл не сохранён. Закрыть без сохранения изменений?')) return;
    this.dirty.delete(id);
    if (id === this.active) this.capture();
    const i = this.open.indexOf(id);
    this.open = this.open.filter(x => x !== id);
    if (this.preview?.id === id) this.preview = null;
    if (!this.open.length) this.open = [this.files[0]?.id || this.create('main.c').id];
    if (id === this.active) { this.active = null; this.switchTo(this.open[Math.max(0, i - 1)] ?? this.open[0]); }
    else { this.persist(); this.render(); }
  }
  rename(id, name) {
    const f = this.files.find(x => x.id === id);
    if (!f || !name.trim()) return;
    name = name.trim();
    if (!/\.[a-z]+$/i.test(name)) name += '.c';
    if (name !== f.name) f.name = this.uniqueName(name, id);
    this.persist();
    this.render();
  }
  remove(id) {
    this.files = this.files.filter(f => f.id !== id);
    if (!this.files.length) this.files.push({ id: uid(), name: 'main.c', code: BLANK, stdin: '', mtime: Date.now() });
    this.dirty.delete(id);
    const wasActive = id === this.active;
    this.open = this.open.filter(x => x !== id);
    if (!this.open.length) this.open = [this.files[0].id];
    if (wasActive) { this.active = null; this.switchTo(this.open[0]); } else { this.persist(); this.render(); }
  }
  download(id) {
    const f = id === this.active ? (this.capture(), this.current) : this.byId(id);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.code], { type: 'text/x-c' }));
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  upload() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.c,.h,.txt,text/plain';
    inp.multiple = true;
    inp.onchange = async () => { for (const file of inp.files) this.create(file.name, (await file.text()).replace(/\r\n/g, '\n')); };
    inp.click();
  }
  uniqueName(name, selfId) {
    const taken = new Set(this.files.filter(f => f.id !== selfId).map(f => f.name));
    if (!taken.has(name)) return name;
    const m = name.match(/^(.*?)(\.[^.]+)?$/);
    for (let k = 2; ; k++) { const n = `${m[1]}-${k}${m[2] || ''}`; if (!taken.has(n)) return n; }
  }
  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1600);
    setTimeout(() => t.remove(), 2100);
  }

  // ——— интерфейс ———
  bind() {
    const { side, tabs } = this.o;
    side.addEventListener('click', (e) => {
      const act = e.target.closest('[data-fa]');
      if (act) {
        e.stopPropagation();
        const id = act.closest('[data-fid]')?.dataset.fid;
        const a = act.dataset.fa;
        if (a === 'new') this.startNew();
        else if (a === 'upload') this.upload();
        else if (a === 'hideside') this.o.hideSide?.();
        else if (a === 'download') this.download(id);
        else if (a === 'rename') this.startRename(id);
        else if (a === 'delete') { if (confirmClick(act, 'Удалить?')) this.remove(id); }
        return;
      }
      const g = e.target.closest('[data-grp]');
      if (g) { const k = g.dataset.grp; this.collapsed.has(k) ? this.collapsed.delete(k) : this.collapsed.add(k); store.set('fs.collapsed', [...this.collapsed]); this.renderSide(); return; }
      const f = e.target.closest('[data-fid]');
      if (f && !e.target.closest('input')) this.switchTo(f.dataset.fid);
      const ex = e.target.closest('[data-ex]');
      if (ex) this.openExample(this.o.examples.find(x => x.id === ex.dataset.ex));
    });
    side.addEventListener('dblclick', (e) => { const f = e.target.closest('[data-fid]'); if (f && !f.dataset.fid.startsWith('ex:')) this.startRename(f.dataset.fid); });
    tabs.addEventListener('click', (e) => {
      const x = e.target.closest('[data-close]');
      const t = e.target.closest('[data-tab]');
      if (x && t) { e.stopPropagation(); this.close(t.dataset.tab); return; }
      if (t) this.switchTo(t.dataset.tab);
      if (e.target.closest('[data-fa="new"]')) this.startNew();
    });
    tabs.addEventListener('auxclick', (e) => { const t = e.target.closest('[data-tab]'); if (t && e.button === 1) this.close(t.dataset.tab); });
    document.addEventListener('keydown', (e) => {
      if (this.o.root?.hidden) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
      else if (mod && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); this.startNew(); }
      else if (e.key === 'F2' && this.current && !this.current.preview) { e.preventDefault(); this.startRename(this.active); }
    });
  }
  startNew() {
    this.o.showSide?.();
    this.renderSide(true);
    const inp = this.o.side.querySelector('.fi-new input');
    inp?.focus();
  }
  startRename(id) {
    this.renamingId = id;
    this.renderSide();
    const inp = this.o.side.querySelector(`[data-fid="${id}"] input`);
    if (inp) { inp.focus(); inp.setSelectionRange(0, inp.value.replace(/\.[^.]+$/, '').length); }
  }
  bindInput(inp, done) {
    let fin = false;
    const finish = (ok) => { if (fin) return; fin = true; done(ok ? inp.value : null); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => finish(true));
  }

  render() { this.renderSide(); this.renderTabs(); }
  renderSide(adding) {
    const side = this.o.side;
    const cur = this.active;
    const fileRow = (f) => {
      const ren = this.renamingId === f.id;
      return `<div class="fi ${f.id === cur ? 'on' : ''}" data-fid="${f.id}" title="${esc(f.name)}">${I.file}${ren ? `<input value="${esc(f.name)}" spellcheck="false">` : `<span class="fi-n">${esc(f.name)}</span>${this.dirty.has(f.id) ? '<i class="dot"></i>' : ''}`}
        <span class="fi-a"><button data-fa="rename" title="Переименовать (F2)">${I.edit}</button><button data-fa="download" title="Скачать на компьютер">${I.down}</button><button data-fa="delete" title="Удалить">${I.del}</button></span></div>`;
    };
    const groups = {};
    for (const ex of this.o.examples) (groups[ex.group] ||= []).push(ex);
    const sec = (key, title, body, actions = '') => `<div class="fsec ${this.collapsed.has(key) ? 'closed' : ''}"><div class="fsec-h" data-grp="${key}">${I.chev}<span>${title}</span><span class="fsec-a">${actions}</span></div><div class="fsec-b">${body}</div></div>`;
    side.innerHTML = `<div class="side-h"><span>Проводник</span><span class="side-a"><button data-fa="new" title="Новый файл (Ctrl+Alt+N)">${I.plus}</button><button data-fa="upload" title="Открыть файл с компьютера">${I.open}</button><button data-fa="hideside" title="Скрыть проводник (Ctrl+B)">${I.x}</button></span></div>
      <div class="side-scroll">
      ${sec('mine', 'Мои файлы', this.files.map(fileRow).join('') + (adding ? `<div class="fi fi-new">${I.file}<input value="program.c" spellcheck="false"></div>` : ''),
        `<button data-fa="new" title="Новый файл (Ctrl+Alt+N)">${I.plus}</button><button data-fa="upload" title="Открыть файл с компьютера">${I.open}</button>`)}
      ${sec('examples', 'Примеры', Object.entries(groups).map(([g, list]) => sec('g:' + g, esc(g), list.map(ex => `<div class="fi ex ${cur === 'ex:' + ex.id ? 'on' : ''}" data-ex="${ex.id}" title="${esc(ex.title)}">${I.file}<span class="fi-n">${esc(ex.title)}</span></div>`).join(''))).join(''))}
      </div>`;
    const nw = side.querySelector('.fi-new input');
    if (nw) { this.bindInput(nw, (v) => { this.renderSide(); if (v && v.trim()) this.create(/\.[a-z]+$/i.test(v.trim()) ? v.trim() : v.trim() + '.c'); }); nw.setSelectionRange(0, 7); }
    const rn = this.renamingId && side.querySelector(`[data-fid="${this.renamingId}"] input`);
    if (rn) this.bindInput(rn, (v) => { const id = this.renamingId; this.renamingId = null; if (v) this.rename(id, v); else this.renderSide(); });
  }
  renderTabs() {
    const t = this.o.tabs;
    t.innerHTML = this.open.map(id => {
      const f = this.byId(id);
      if (!f) return '';
      return `<div class="tab ${id === this.active ? 'on' : ''} ${f.preview ? 'preview' : ''}" data-tab="${id}" title="${esc(f.preview ? (f.title || f.name) + ' — пример (изменения сохранятся как новый файл)' : f.name)}">${I.file}<span>${esc(f.name)}</span>${this.dirty.has(id) ? '<i class="dot"></i>' : ''}<button data-close title="Закрыть">${I.x}</button></div>`;
    }).join('') + `<button class="tab-new" data-fa="new" title="Новый файл (Ctrl+Alt+N)">${I.plus}</button>`;
    t.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
