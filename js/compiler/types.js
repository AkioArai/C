// Модель типов языка C (модель данных LP64, как у gcc на Linux x86-64).

const mk = (k, size, extra = {}) => Object.freeze({ k, size, ...extra });

export const T = {
  void: mk('void', 1),
  bool: mk('bool', 1, { int: true, signed: false, rank: 0 }),
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

export const ptr = (to) => ({ k: 'ptr', size: 8, to });
export const arr = (of, len) => ({ k: 'arr', size: of.size * (len ?? 0), of, len });

export const isInt = (t) => !!t && !!t.int;
export const isFloat = (t) => !!t && !!t.float;
export const isArith = (t) => isInt(t) || isFloat(t);
export const isPtr = (t) => !!t && (t.k === 'ptr' || t.k === 'arr');
export const is64 = (t) => isInt(t) && t.size === 8;

export function typeName(t) {
  if (!t) return '?';
  if (t.k === 'ptr') return typeName(t.to) + ' *';
  if (t.k === 'arr') return `${typeName(t.of)}[${t.len ?? ''}]`;
  return t.k;
}

/** Разбор набора спецификаторов (например ['unsigned','long','int']) в тип. */
export function typeFromSpecifiers(specs) {
  const c = {};
  for (const s of specs) c[s] = (c[s] || 0) + 1;
  const uns = !!c.unsigned;
  const longs = c.long || 0;
  if (c.void) return T.void;
  if (c._Bool || c.bool) return T.bool;
  if (c.float) return T.float;
  if (c.double) return longs ? T.ldouble : T.double;
  if (c.char) return uns ? T.uchar : c.signed ? T.schar : T.char;
  if (c.short) return uns ? T.ushort : T.short;
  if (longs >= 2) return uns ? T.ullong : T.llong;
  if (longs === 1) return uns ? T.ulong : T.long;
  return uns ? T.uint : T.int;
}

const unsignedOf = (t) =>
  ({ int: T.uint, long: T.ulong, 'long long': T.ullong }[t.k] || t);

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
  if (a === b) return a;
  if (a.signed === b.signed) return a.rank >= b.rank ? a : b;
  const u = a.signed ? b : a;
  const s = a.signed ? a : b;
  if (u.rank >= s.rank) return u;
  if (s.size > u.size) return s;
  return unsignedOf(s);
}

/** Приведение «сырого» значения к типу t с эмуляцией переполнения. */
export function convert(v, t) {
  if (t.k === 'ptr' || t.k === 'arr') return v;
  if (t.float) {
    const n = typeof v === 'bigint' ? Number(v) : typeof v === 'object' ? NaN : v;
    return t.k === 'float' ? Math.fround(n) : n;
  }
  if (t.k === 'bool') {
    if (typeof v === 'bigint') return v !== 0n ? 1 : 0;
    if (typeof v === 'object' && v) return 1;
    return v ? 1 : 0;
  }
  if (typeof v === 'object' && v !== null) v = v.addr ?? 0; // указатель -> целое
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

export function toNumber(v) {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && v) return v.addr ?? 0;
  return v;
}

export function isTruthy(v) {
  if (typeof v === 'bigint') return v !== 0n;
  if (typeof v === 'object') return v !== null && !v.isNull;
  return v !== 0; // NaN в C тоже «истина»
}

export function rangeOf(t) {
  if (!isInt(t)) return null;
  const bits = BigInt(t.size * 8);
  if (t.k === 'bool') return [0n, 1n];
  return t.signed ? [-(2n ** (bits - 1n)), 2n ** (bits - 1n) - 1n] : [0n, 2n ** bits - 1n];
}
