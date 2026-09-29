// Байтовая память программы: сегменты стека, глобальных данных, строковых констант и кучи.
// Адреса — обычные числа (как в 64-битном процессе Linux).
import { convert } from './types.js';

export const STACK_TOP = 0x7ffd5c3b2000;
export const STACK_SIZE = 4 << 20;
export const DATA_BASE = 0x4c3020;
export const RODATA_BASE = 0x402004;
export const HEAP_BASE = 0x5555555592a0;
export const TEXT_BASE = 0x401136;

export class MemFault extends Error {
  constructor(kind, addr, extra = {}) { super(kind); this.kind = kind; this.addr = addr; Object.assign(this, extra); }
}

class Segment {
  constructor(name, base, size, opts = {}) {
    this.name = name;
    this.base = base;
    this.buf = new Uint8Array(size);
    this.dv = new DataView(this.buf.buffer);
    this.init = new Uint8Array(size);
    this.readonly = !!opts.readonly;
    this.top = 0; // для «растущих» сегментов (данные, строки, куча)
  }
  get size() { return this.buf.length; }
  grow(need) {
    let n = this.buf.length;
    while (n < need) n *= 2;
    if (n > (64 << 20)) throw new MemFault('oom', this.base + need);
    const b = new Uint8Array(n); b.set(this.buf);
    const i = new Uint8Array(n); i.set(this.init);
    this.buf = b; this.init = i; this.dv = new DataView(b.buffer);
  }
}

export class Memory {
  constructor(seed = 12345) {
    this.stack = new Segment('stack', STACK_TOP - STACK_SIZE, STACK_SIZE);
    this.data = new Segment('data', DATA_BASE, 1 << 16);
    this.rodata = new Segment('rodata', RODATA_BASE, 1 << 14, { readonly: true });
    this.heap = new Segment('heap', HEAP_BASE, 1 << 16);
    this.segs = [this.rodata, this.data, this.heap, this.stack];
    // стек заполнен «мусором», оставшимся от прошлых программ
    let s = seed >>> 0;
    const dv = this.stack.dv;
    for (let off = 0; off < STACK_SIZE; off += 8) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const kind = s % 7;
      if (kind < 3) continue; // нули
      if (kind === 3) { dv.setUint32(off, 0x7ffd5c00 + (s >>> 20), true); dv.setUint32(off + 4, 0x7ffd, true); }
      else if (kind === 4) dv.setUint32(off, s >>> 22, true);
      else { dv.setUint32(off, s, true); dv.setUint32(off + 4, (s >>> 3) & 0xffff, true); }
    }
    // куча тоже содержит мусор
    this.fillGarbage(this.heap, 0, this.heap.size, seed ^ 0x9e3779b9);
  }

  fillGarbage(seg, from, to, seed) {
    let s = seed >>> 0;
    for (let off = from; off < to; off++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      seg.buf[off] = (s >>> 24) % 5 === 0 ? s & 0xff : 0;
    }
  }

  seg(addr, len = 1) {
    for (const s of this.segs) {
      const off = addr - s.base;
      if (off >= 0 && off + len <= s.size) return s;
    }
    return null;
  }

  locate(addr, len, write) {
    if (!Number.isFinite(addr)) throw new MemFault('bad', addr);
    if (addr >= 0 && addr < 4096) throw new MemFault('null', addr);
    const s = this.seg(addr, len);
    if (!s) throw new MemFault('segv', addr);
    if (write && s.readonly) throw new MemFault('readonly', addr);
    return [s, addr - s.base];
  }

  isInit(addr, len) {
    const s = this.seg(addr, len);
    if (!s) return true;
    const off = addr - s.base;
    for (let k = 0; k < len; k++) if (!s.init[off + k]) return false;
    return true;
  }
  markInit(addr, len, v = 1) {
    const s = this.seg(addr, len);
    if (s) s.init.fill(v, addr - s.base, addr - s.base + len);
  }

  read(addr, t) {
    const size = t.k === 'long double' ? 8 : t.size;
    const [s, o] = this.locate(addr, size, false);
    const dv = s.dv;
    if (t.k === 'ptr') return Number(dv.getBigUint64(o, true));
    if (t.float) return t.k === 'float' ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
    if (t.k === '_Bool') return dv.getUint8(o) ? 1 : 0;
    switch (t.size) {
      case 1: return t.signed ? dv.getInt8(o) : dv.getUint8(o);
      case 2: return t.signed ? dv.getInt16(o, true) : dv.getUint16(o, true);
      case 4: return t.signed ? dv.getInt32(o, true) : dv.getUint32(o, true);
      case 8: return t.signed ? dv.getBigInt64(o, true) : dv.getBigUint64(o, true);
    }
    return 0;
  }

  write(addr, t, v) {
    const size = t.k === 'long double' ? 8 : t.size;
    const [s, o] = this.locate(addr, size, true);
    const dv = s.dv;
    v = convert(v, t);
    if (t.k === 'ptr') dv.setBigUint64(o, BigInt.asUintN(64, BigInt(Math.trunc(v))), true);
    else if (t.float) { if (t.k === 'float') dv.setFloat32(o, v, true); else dv.setFloat64(o, v, true); }
    else if (t.k === '_Bool') dv.setUint8(o, v ? 1 : 0);
    else switch (t.size) {
      case 1: dv.setUint8(o, v & 0xff); break;
      case 2: dv.setUint16(o, v & 0xffff, true); break;
      case 4: dv.setUint32(o, v >>> 0, true); break;
      case 8: dv.setBigUint64(o, BigInt.asUintN(64, v), true); break;
    }
    s.init.fill(1, o, o + t.size);
    return v;
  }

  readBytes(addr, n) {
    if (n === 0) return new Uint8Array(0);
    const [s, o] = this.locate(addr, n, false);
    return s.buf.slice(o, o + n);
  }
  writeBytes(addr, bytes) {
    if (!bytes.length) return;
    const [s, o] = this.locate(addr, bytes.length, true);
    s.buf.set(bytes, o);
    s.init.fill(1, o, o + bytes.length);
  }
  fill(addr, n, byte) {
    if (!n) return;
    const [s, o] = this.locate(addr, n, true);
    s.buf.fill(byte & 0xff, o, o + n);
    s.init.fill(1, o, o + n);
  }
  copy(dst, src, n) {
    if (!n) return;
    const [ss, so] = this.locate(src, n, false);
    const bytes = ss.buf.slice(so, so + n);
    const init = ss.init.slice(so, so + n);
    const [ds, dO] = this.locate(dst, n, true);
    ds.buf.set(bytes, dO);
    ds.init.set(init, dO);
  }

  /** Строка C: байты до '\0' (не больше max). */
  cstring(addr, max = 1 << 20) {
    const out = [];
    for (let k = 0; k < max; k++) {
      const [s, o] = this.locate(addr + k, 1, false);
      const b = s.buf[o];
      if (b === 0) return out;
      out.push(b);
    }
    return out;
  }

  // ——— выделение ———
  allocStatic(size, align, readonly = false) {
    const s = readonly ? this.rodata : this.data;
    let off = Math.ceil(s.top / Math.max(1, align)) * Math.max(1, align);
    if (off + size > s.size) s.grow(off + size + 16);
    s.top = off + Math.max(size, 1);
    s.init.fill(1, off, off + size);
    return s.base + off;
  }

  heapAlloc(size) {
    const s = this.heap;
    const off = Math.ceil((s.top + 16) / 16) * 16; // 16 байт заголовка блока, как у malloc
    if (off + size > s.size) { const old = s.size; s.grow(off + size + 64); this.fillGarbage(s, old, s.size, off); }
    s.top = off + Math.max(size, 1);
    s.init.fill(0, off, off + size);
    return s.base + off;
  }
}
