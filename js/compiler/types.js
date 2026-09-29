// Модель типов языка C (модель данных LP64, как у gcc на Linux x86-64).

const mk = (k, size, extra = {}) => Object.freeze({ k, size, align: extra.align ?? size, ...extra });

export const T = {
  void: mk('void', 1, { align: 1 }),
  bool: mk('_Bool', 1, { int: true, signed: false, rank: 0 }),
  char: mk('char', 1, { int: true, signed: true, rank: 1 }),
  schar: mk('signed char', 1, { int: true, signed: true, rank: 1 }),
  uchar: mk('unsigned char', 1, { int: true, signed: false, rank: 1 }),
  short: mk('short', 2, { int: true, signed: true, rank: 2 }),
  ushort: mk('unsigned short', 2, { int: true, signed: false, rank: 2 }),
  int: mk('int', 4, { int: true, signed: true, rank: 3 }),
  uint: mk('unsigned int', 4, { int: true, signed: false, rank: 3 }),
  long: mk('long', 8, { int: true, signed: true, rank: 4 }),
  ulong: mk('unsigned long', 8, { int: true, signed: false, rank: 4 }),
  llong: mk('long long', 8, { int: true, signed: true, rank: 5 }),
  ullong: mk('unsigned long long', 8, { int: true, signed: false, rank: 5 }),
  float: mk('float', 4, { float: true, rank: 10 }),
  double: mk('double', 8, { float: true, rank: 11 }),
  ldouble: mk('long double', 16, { float: true, rank: 12 }),
};

const ptrCache = new WeakMap();
export function ptr(to) {
  let p = ptrCache.get(to);
  if (!p) { p = { k: 'ptr', size: 8, align: 8, to }; ptrCache.set(to, p); }
  return p;
}
/** Массив; len === null — размер ещё не известен (VLA или int a[] = {...}). */
export const arr = (of, len, lenExpr = null) => ({ k: 'arr', of, len, lenExpr, get size() { return this.len == null ? 0 : this.of.size * this.len; }, get align() { return this.of.align; } });
export const func = (ret, params, variadic = false, unspecified = false) => ({ k: 'func', ret, params, variadic, unspecified, size: 1, align: 1 });

/** Структура/объединение: создаётся неполной при первом упоминании тега и дополняется определением. */
export function record(kind, tag) {
  return { k: kind, tag, fields: null, size: 0, align: 1, complete: false };
}
export function completeRecord(t, fields) {
  let off = 0, align = 1, size = 0;
  for (const f of fields) {
    const a = f.type.align || 1;
    align = Math.max(align, a);
    if (t.k === 'struct') {
      off = Math.ceil(off / a) * a;
      f.offset = off;
      off += f.type.size;
      size = off;
    } else {
      f.offset = 0;
      size = Math.max(size, f.type.size);
    }
  }
  t.fields = fields;
  t.align = align;
  t.size = Math.ceil(size / align) * align || 0;
  t.complete = true;
  return t;
}

export const isInt = (t) => !!t && !!t.int;
export const isFloat = (t) => !!t && !!t.float;
export const isArith = (t) => isInt(t) || isFloat(t);
export const isPtr = (t) => !!t && (t.k === 'ptr' || t.k === 'arr');
export const isPointer = (t) => !!t && t.k === 'ptr';
export const isRecord = (t) => !!t && (t.k === 'struct' || t.k === 'union');
export const isScalar = (t) => isArith(t) || isPointer(t);
export const is64 = (t) => isInt(t) && t.size === 8;
export const isFunc = (t) => !!t && t.k === 'func';
export const isVoid = (t) => !!t && t.k === 'void';
export const isCharType = (t) => !!t && isInt(t) && t.size === 1 && t.k !== '_Bool';

export function typeName(t) {
  if (!t) return '?';
  if (t.typedefName) return t.typedefName;
  switch (t.k) {
    case 'ptr':
      if (t.to.k === 'func') return `${typeName(t.to.ret)} (*)(${t.to.params.map(p => typeName(p.type)).join(', ')})`;
      return typeName(t.to) + ' *';
    case 'arr': {
      let base = t, dims = '';
      while (base.k === 'arr') { dims += `[${base.len ?? ''}]`; base = base.of; }
      return typeName(base) + dims;
    }
    case 'func': return `${typeName(t.ret)} (${t.params.map(p => typeName(p.type)).join(', ')})`;
    case 'struct': case 'union': return `${t.k} ${t.tag || '(без имени)'}`;
    case 'enum': return `enum ${t.tag || ''}`.trim();
    default: return t.k;
  }
}

/** Разбор набора спецификаторов (например ['unsigned','long','int']) в тип. */
export function typeFromSpecifiers(specs) {
  const c = {};
  for (const s of specs) c[s] = (c[s] || 0) + 1;
  const uns = !!c.unsigned;
  const longs = c.long || 0;
  if (c.void) return T.void;
  if (c._Bool) return T.bool;
  if (c.float) return T.float;
  if (c.double) return longs ? T.ldouble : T.double;
  if (c.char) return uns ? T.uchar : c.signed ? T.schar : T.char;
  if (c.short) return uns ? T.ushort : T.short;
  if (longs >= 2) return uns ? T.ullong : T.llong;
  if (longs === 1) return uns ? T.ulong : T.long;
  return uns ? T.uint : T.int;
}

const unsignedOf = (t) => ({ int: T.uint, long: T.ulong, 'long long': T.ullong }[t.k] || t);

/** Целочисленное расширение: всё, что меньше int, становится int. */
export function promote(t) {
  if (isInt(t) && t.rank < 3) return T.int;
  return t;
}

/** Обычные арифметические преобразования (C11 6.3.1.8). */
export function commonType(a, b) {
  if (a.k === 'long double' || b.k === 'long double') return T.ldouble;
  if (a.k === 'double' || b.k === 'double') return T.double;
  if (a.k === 'float' || b.k === 'float') return T.float;
  a = promote(a);
  b = promote(b);
  if (a.k === b.k) return a;
  if (a.signed === b.signed) return a.rank >= b.rank ? a : b;
  const u = a.signed ? b : a;
  const s = a.signed ? a : b;
  if (u.rank >= s.rank) return u;
  if (s.size > u.size) return s;
  return unsignedOf(s);
}

/** Приведение «сырого» значения к типу t с эмуляцией переполнения. Указатели — числа (адреса). */
export function convert(v, t) {
  if (t.k === 'ptr') {
    if (typeof v === 'bigint') return Number(BigInt.asUintN(64, v));
    return typeof v === 'number' ? Math.trunc(v) : 0;
  }
  if (t.float) {
    const n = typeof v === 'bigint' ? Number(v) : v;
    return t.k === 'float' ? Math.fround(n) : n;
  }
  if (t.k === '_Bool') {
    if (typeof v === 'bigint') return v !== 0n ? 1 : 0;
    return v !== 0 && !Number.isNaN(v) ? 1 : (Number.isNaN(v) ? 1 : 0);
  }
  if (!t.int) return v;
  if (t.size === 8) {
    let b;
    if (typeof v === 'bigint') b = v;
    else if (!Number.isFinite(v)) b = -(2n ** 63n);
    else b = BigInt(Math.trunc(v));
    return t.signed ? BigInt.asIntN(64, b) : BigInt.asUintN(64, b);
  }
  let n;
  if (typeof v === 'bigint') n = Number(BigInt.asIntN(32, v));
  else if (!Number.isFinite(v)) n = t.signed ? -2147483648 : 0;
  else {
    n = Math.trunc(v);
    if (Math.abs(n) > 2 ** 52) n = Number(BigInt.asIntN(32, BigInt(n)));
  }
  switch (t.size) {
    case 1: return t.signed ? (n << 24) >> 24 : n & 0xff;
    case 2: return t.signed ? (n << 16) >> 16 : n & 0xffff;
    default: return t.signed ? n | 0 : n >>> 0;
  }
}

export function isTruthy(v) {
  if (typeof v === 'bigint') return v !== 0n;
  return v !== 0; // NaN в C тоже «истина»
}

export function rangeOf(t) {
  if (!isInt(t)) return null;
  const bits = BigInt(t.size * 8);
  if (t.k === '_Bool') return [0n, 1n];
  return t.signed ? [-(2n ** (bits - 1n)), 2n ** (bits - 1n) - 1n] : [0n, 2n ** bits - 1n];
}

/** Совместимость типов для присваивания/сравнения указателей (упрощённо). */
export function sameType(a, b) {
  if (a === b) return true;
  if (!a || !b || a.k !== b.k) return false;
  if (a.k === 'ptr') return sameType(a.to, b.to);
  if (a.k === 'arr') return sameType(a.of, b.of);
  return a.k === b.k && !isRecord(a);
}

/** Понятное описание типа для новичка. */
export function describeType(t) {
  if (!t) return '';
  switch (t.k) {
    case 'int': return 'целые числа, 4 байта';
    case 'unsigned int': return 'целые ≥ 0, 4 байта';
    case 'short': return 'целые, 2 байта';
    case 'unsigned short': return 'целые ≥ 0, 2 байта';
    case 'long': case 'long long': return 'большие целые, 8 байт';
    case 'unsigned long': case 'unsigned long long': return 'большие целые ≥ 0, 8 байт';
    case 'char': case 'signed char': return 'символ (его код), 1 байт';
    case 'unsigned char': return 'байт 0…255';
    case 'float': return 'дробные, ~7 цифр, 4 байта';
    case 'double': return 'дробные, ~15 цифр, 8 байт';
    case 'long double': return 'дробные повышенной точности';
    case '_Bool': return 'логическое 0/1';
    case 'ptr': return t.to.k === 'func' ? 'указатель на функцию' : 'адрес другого объекта, 8 байт';
    case 'arr': return `${t.len ?? '?'} элементов подряд в памяти`;
    case 'struct': return `структура: ${t.fields?.length ?? 0} полей, ${t.size} байт`;
    case 'union': return `объединение: поля делят ${t.size} байт`;
    default: return '';
  }
}
