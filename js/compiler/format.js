// Реализация форматирования printf и разбора ввода scanf, максимально близкая к glibc.

// ——— точное десятичное представление double ———
const f64 = new DataView(new ArrayBuffer(8));

function decompose(x) {
  f64.setFloat64(0, x);
  const hi = f64.getUint32(0), lo = f64.getUint32(4);
  const neg = hi >>> 31 === 1;
  const e = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp;
  if (e === 0) exp = -1074;
  else { mant |= 1n << 52n; exp = e - 1075; }
  return { neg, mant, exp };
}

const P10 = (n) => 10n ** BigInt(n);

function roundDiv(num, den) {
  const q = num / den, r = num % den;
  const twice = 2n * r;
  if (twice > den || (twice === den && (q & 1n) === 1n)) return q + 1n;
  return q;
}

function special(x, upper) {
  let s;
  if (Number.isNaN(x)) { f64.setFloat64(0, x); s = (f64.getUint32(0) >>> 31 ? '-' : '') + 'nan'; }
  else s = x < 0 ? '-inf' : 'inf';
  return upper ? s.toUpperCase() : s;
}

/** Цифры |x| с prec знаками после точки (без знака). */
export function fixedDigits(x, prec) {
  const { mant, exp } = decompose(x);
  let q;
  if (exp >= 0) q = (mant << BigInt(exp)) * P10(prec);
  else q = roundDiv(mant * P10(prec), 1n << BigInt(-exp));
  let s = q.toString();
  if (prec === 0) return s;
  s = s.padStart(prec + 1, '0');
  return s.slice(0, -prec) + '.' + s.slice(-prec);
}

/** Возвращает [цифры (prec+1 шт.), показатель] для |x| в экспоненциальной форме. */
function expDigits(x, prec) {
  if (x === 0) return ['0'.repeat(prec + 1), 0];
  const { mant, exp } = decompose(x);
  let E = Math.floor(Math.log10(Math.abs(x)));
  for (let guard = 0; guard < 4; guard++) {
    const k = prec - E; // умножаем на 10^k
    let num = mant, den = 1n;
    if (exp >= 0) num <<= BigInt(exp); else den <<= BigInt(-exp);
    if (k >= 0) num *= P10(k); else den *= P10(-k);
    const q = roundDiv(num, den);
    const s = q.toString();
    if (s.length === prec + 2) { E++; continue; }
    if (s.length === prec) { E--; continue; }
    return [s, E];
  }
  return [fixedDigits(x, 0), 0];
}

function expStr(x, prec, upper, alt) {
  const [d, E] = expDigits(x, prec);
  let s = d[0];
  if (prec > 0 || alt) s += '.' + d.slice(1);
  const es = String(Math.abs(E)).padStart(2, '0');
  return s + (upper ? 'E' : 'e') + (E < 0 ? '-' : '+') + es;
}

function gStr(x, prec, upper, alt) {
  const P = prec === 0 ? 1 : prec;
  let X;
  if (x === 0) X = 0;
  else X = expDigits(x, P - 1)[1];
  let s;
  if (P > X && X >= -4) s = fixedDigits(x, P - 1 - X);
  else s = expStr(x, P - 1, upper, alt);
  if (!alt) {
    // убрать хвостовые нули в дробной части
    const m = /^([^eE]*?)(\.?0*)([eE].*)?$/.exec(s);
    if (m && s.includes('.')) {
      let mantissa = s.split(/[eE]/)[0];
      const ex = s.slice(mantissa.length);
      mantissa = mantissa.replace(/\.?0+$/, '');
      if (mantissa === '' ) mantissa = '0';
      s = mantissa + ex;
    }
  }
  return s;
}

// ——— UTF-8 / cp1251 ———
const CP1251_HI = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';

export function charToByte(cp) {
  if (cp < 128) return cp;
  const i = CP1251_HI.indexOf(String.fromCodePoint(cp));
  if (i >= 0) return 0xc0 + i;
  if (cp === 0x401) return 0xa8;
  if (cp === 0x451) return 0xb8;
  return cp & 0xff;
}

/** Декодирование вывода: UTF-8, а отдельные «битые» байты — как cp1251. */
export function decodeBytes(bytes) {
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { s += String.fromCharCode(b); i++; continue; }
    let n = 0;
    if ((b & 0xe0) === 0xc0) n = 1; else if ((b & 0xf0) === 0xe0) n = 2; else if ((b & 0xf8) === 0xf0) n = 3;
    let ok = n > 0 && i + n < bytes.length + 0 && i + n <= bytes.length - 1 + 1;
    if (ok) for (let k = 1; k <= n; k++) if (((bytes[i + k] ?? 0) & 0xc0) !== 0x80) { ok = false; break; }
    if (ok) {
      let cp = b & (0x3f >> n);
      for (let k = 1; k <= n; k++) cp = (cp << 6) | (bytes[i + k] & 0x3f);
      s += String.fromCodePoint(cp);
      i += n + 1;
      continue;
    }
    if (b >= 0xc0) s += CP1251_HI[b - 0xc0];
    else if (b === 0xa8) s += 'Ё';
    else if (b === 0xb8) s += 'ё';
    else s += '\uFFFD';
    i++;
  }
  return s;
}

export const encodeUtf8 = (str) => [...new TextEncoder().encode(str)];

// ——— разбор спецификаторов ———
const SPEC_RE = /%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?(hh|h|ll|l|L|z|j|t)?([diuoxXfFeEgGcspn%])?/y;

/** Разбирает строку формата на куски: текст и спецификаторы. */
export function parseFormat(fmt) {
  const parts = [];
  let i = 0, lit = '';
  while (i < fmt.length) {
    if (fmt[i] !== '%') { lit += fmt[i++]; continue; }
    SPEC_RE.lastIndex = i;
    const m = SPEC_RE.exec(fmt);
    if (lit) { parts.push({ lit }); lit = ''; }
    if (!m[5]) {
      parts.push({ bad: true, text: m[0] || '%', at: i });
      i += Math.max(1, m[0].length);
      continue;
    }
    parts.push({
      spec: true, text: m[0], at: i,
      flags: m[1] || '', width: m[2], prec: m[3], len: m[4] || '', conv: m[5],
    });
    i += m[0].length;
  }
  if (lit) parts.push({ lit });
  return parts;
}

/** Ожидаемая категория аргумента для спецификатора printf. */
export function printfExpect(p) {
  switch (p.conv) {
    case 'd': case 'i': case 'u': case 'o': case 'x': case 'X': case 'c':
      return { cat: 'int', len: p.conv === 'c' ? '' : p.len };
    case 'f': case 'F': case 'e': case 'E': case 'g': case 'G':
      return { cat: 'float', len: p.len };
    case 's': return { cat: 'str' };
    case 'p': return { cat: 'ptr' };
    case 'n': return { cat: 'ptr' };
    default: return null;
  }
}

function pad(s, flags, width, numeric) {
  if (width === undefined || s.length >= width) return s;
  if (flags.includes('-')) return s + ' '.repeat(width - s.length);
  if (numeric && flags.includes('0')) {
    const m = /^([+\- ]?(?:0[xX])?)(.*)$/.exec(s);
    return m[1] + '0'.repeat(width - s.length) + m[2];
  }
  return ' '.repeat(width - s.length) + s;
}

/**
 * Форматирует вывод printf.
 * args: [{t, v}] — типизированные значения. ctx.readString(ptr) -> байты.
 * Возвращает { text (string), issues: [] }.
 */
export function formatPrintf(fmtBytes, args, ctx = {}) {
  const fmt = String.fromCharCode(...fmtBytes.map(b => b)); // побайтово (latin1)
  const parts = parseFormat(fmt);
  const outBytes = [];
  const issues = [];
  const dec = ctx.decimalComma ? ',' : '.';
  let ai = 0;
  const nextArg = () => {
    if (ai >= args.length) { issues.push('missing'); return { t: null, v: 0, missing: true }; }
    return args[ai++];
  };
  const pushStr = (s) => { for (let k = 0; k < s.length; k++) outBytes.push(s.charCodeAt(k) & 0xff); };

  for (const p of parts) {
    if (p.lit !== undefined) { pushStr(p.lit); continue; }
    if (p.bad) { pushStr(p.text); issues.push('bad'); continue; }
    if (p.conv === '%') { pushStr('%'); continue; }
    let width = p.width === '*' ? Number(toNum(nextArg().v)) : p.width !== undefined ? +p.width : undefined;
    let flags = p.flags;
    if (width !== undefined && width < 0) { flags += '-'; width = -width; }
    let prec = p.prec === '*' ? Number(toNum(nextArg().v)) : p.prec !== undefined ? (p.prec === '' ? 0 : +p.prec) : undefined;
    if (prec !== undefined && prec < 0) prec = undefined;
    const a = nextArg();
    const conv = p.conv;
    let s;
    if ('diuoxX'.includes(conv)) {
      let big = toBig(a.v);
      const bits = p.len === 'l' || p.len === 'll' || p.len === 'z' || p.len === 'j' ? 64 : p.len === 'h' ? 16 : p.len === 'hh' ? 8 : 32;
      const signed = conv === 'd' || conv === 'i';
      big = signed ? BigInt.asIntN(bits, big) : BigInt.asUintN(bits, big);
      const neg = big < 0n;
      let digits = (neg ? -big : big).toString(conv === 'o' ? 8 : 'xX'.includes(conv) ? 16 : 10);
      if (conv === 'X') digits = digits.toUpperCase();
      if (prec !== undefined) { if (prec === 0 && big === 0n) digits = ''; digits = digits.padStart(prec, '0'); }
      if (flags.includes('#')) { if (conv === 'o' && digits[0] !== '0') digits = '0' + digits; if ('xX'.includes(conv) && big !== 0n) digits = (conv === 'x' ? '0x' : '0X') + digits; }
      let sign = neg ? '-' : signed && flags.includes('+') ? '+' : signed && flags.includes(' ') ? ' ' : '';
      s = pad(sign + digits, prec !== undefined ? flags.replace('0', '') : flags, width, true);
    } else if ('fFeEgG'.includes(conv)) {
      const x = typeof a.v === 'bigint' ? Number(a.v) : typeof a.v === 'number' ? a.v : 0;
      const pr = prec === undefined ? 6 : prec;
      const upper = conv === conv.toUpperCase();
      let body;
      if (!Number.isFinite(x)) body = special(x, upper).replace(/^-/, '');
      else if ('fF'.includes(conv)) { body = fixedDigits(x, pr); if (pr === 0 && flags.includes('#')) body += '.'; }
      else if ('eE'.includes(conv)) body = expStr(x, pr, upper, flags.includes('#'));
      else body = gStr(x, pr, upper, flags.includes('#'));
      if (dec !== '.') body = body.replace('.', dec);
      f64.setFloat64(0, x);
      const neg = (f64.getUint32(0) >>> 31) === 1 && !(Number.isNaN(x) && !special(x).startsWith('-'));
      const sign = neg ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
      s = pad(sign + body, Number.isFinite(x) ? flags : flags.replace('0', ''), width, true);
    } else if (conv === 'c') {
      const b = Number(BigInt.asUintN(8, toBig(a.v)));
      const padded = pad('\u0001', flags.replace('0', ''), width, false);
      for (const ch of padded) outBytes.push(ch === '\u0001' ? b : 32);
      continue;
    } else if (conv === 's') {
      let bytes;
      if (a.v && typeof a.v === 'object' && ctx.readString) bytes = ctx.readString(a.v);
      else if (a.v === null || (a.v && a.v.isNull)) bytes = [...'(null)'].map(c => c.charCodeAt(0));
      else { issues.push('s-not-string'); bytes = [...'(?)'].map(c => c.charCodeAt(0)); }
      if (prec !== undefined) bytes = bytes.slice(0, prec);
      const w = width ?? 0;
      const fill = Math.max(0, w - bytes.length);
      if (!flags.includes('-')) for (let k = 0; k < fill; k++) outBytes.push(32);
      outBytes.push(...bytes);
      if (flags.includes('-')) for (let k = 0; k < fill; k++) outBytes.push(32);
      continue;
    } else if (conv === 'p') {
      const addr = a.v && typeof a.v === 'object' ? a.v.addr ?? 0 : Number(a.v || 0);
      s = pad(addr ? '0x' + addr.toString(16) : '(nil)', flags, width, false);
    } else if (conv === 'n') {
      continue;
    }
    pushStr(s);
  }
  if (ai < args.length) issues.push('extra');
  return { bytes: outBytes, issues };
}

function toNum(v) { return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : 0; }
function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  if (v && typeof v === 'object') return BigInt(v.addr ?? 0);
  return 0n;
}

// ——— scanf ———
export class NeedInput extends Error {}

const WS = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\v' || c === '\f';

/**
 * Выполняет scanf по строке формата над буфером ввода.
 * input: { text, pos, eof }.
 * Если данных не хватает и eof=false — бросает NeedInput (позиция не меняется).
 * Возвращает { count, items: [{conv, len, value, suppressed, text}], pos, eofHit }.
 */
export function runScanf(fmt, input, opts = {}) {
  const parts = parseFormat(fmt);
  const text = input.text;
  let pos = input.pos;
  const items = [];
  let count = 0;
  let failedEarly = false;
  const dec = opts.decimalComma;

  const need = () => { if (!input.eof) throw new NeedInput(); };
  const at = () => { if (pos >= text.length) need(); return text[pos]; };
  const skipWs = () => { for (;;) { if (pos >= text.length) { need(); return false; } if (!WS(text[pos])) return true; pos++; } };

  outer:
  for (const p of parts) {
    if (p.lit !== undefined) {
      for (const ch of p.lit) {
        if (WS(ch)) { skipWs(); continue; }
        if (pos >= text.length) { need(); failedEarly = count === 0; break outer; }
        if (text[pos] !== ch) break outer;
        pos++;
      }
      continue;
    }
    if (p.bad) break;
    if (p.conv === '%') { if (!skipWs()) { failedEarly = count === 0; break; } if (text[pos] !== '%') break; pos++; continue; }
    const suppressed = p.flags === '' && p.width === '*' ? true : p.text.startsWith('%*');
    const maxW = p.width && p.width !== '*' ? +p.width : Infinity;
    const conv = p.conv;
    if (conv === 'c') {
      const w = p.width && p.width !== '*' ? +p.width : 1;
      let s = '';
      for (let k = 0; k < w; k++) {
        if (pos >= text.length) { need(); break; }
        s += text[pos++];
      }
      if (s.length === 0) { failedEarly = count === 0; break; }
      items.push({ conv, len: p.len, value: s, suppressed, text: s });
      if (!suppressed) count++;
      continue;
    }
    if (!skipWs()) { failedEarly = count === 0; break; }
    const st = pos;
    let tok = '';
    const take = () => { tok += text[pos++]; };
    const peekc = () => (pos < text.length ? text[pos] : (need(), undefined));
    if ('diuoxX'.includes(conv)) {
      let base = conv === 'o' ? 8 : 'xX'.includes(conv) ? 16 : 10;
      let c = peekc();
      if ((c === '+' || c === '-') && tok.length < maxW) { take(); c = peekc(); }
      if (conv === 'i' && c === '0' && tok.length < maxW) {
        take(); c = peekc();
        if ((c === 'x' || c === 'X') && tok.length < maxW) { take(); base = 16; } else base = 8;
      }
      const digitRe = base === 16 ? /[0-9a-fA-F]/ : base === 8 ? /[0-7]/ : /[0-9]/;
      while (tok.length < maxW && c !== undefined && digitRe.test(c)) { take(); c = pos < text.length ? text[pos] : (input.eof ? undefined : (need(), undefined)); }
      const clean = tok.replace(/^[+-]/, '').replace(/^0[xX]/, '');
      if (!/[0-9a-fA-F]/.test(clean) && !(conv === 'i' && tok.replace(/^[+-]/, '') === '0')) { pos = st; break; }
      let big = BigInt((tok[0] === '-' ? '-' : '') + (base === 16 ? '0x' : base === 8 ? '0o' : '') + (clean || '0'));
      items.push({ conv, len: p.len, value: big, suppressed, text: tok });
      if (!suppressed) count++;
    } else if ('fFeEgG'.includes(conv)) {
      let c = peekc();
      const isD = (ch) => ch !== undefined && /[0-9]/.test(ch);
      const nx = () => (pos < text.length ? text[pos] : (input.eof ? undefined : (need(), undefined)));
      if (c === '+' || c === '-') { take(); c = nx(); }
      if (c && /[iInN]/.test(c)) {
        const rest = text.slice(pos, pos + 8).toLowerCase();
        if (rest.startsWith('infinity')) { pos += 8; tok += 'Infinity'; }
        else if (rest.startsWith('inf')) { pos += 3; tok += 'Infinity'; }
        else if (rest.startsWith('nan')) { pos += 3; tok = 'NaN'; }
        else { pos = st; break; }
      } else {
        let digits = 0;
        while (tok.length < maxW && isD(c)) { take(); digits++; c = nx(); }
        if (tok.length < maxW && (c === '.' || (dec && c === ','))) { pos++; tok += '.'; c = nx(); while (tok.length < maxW && isD(c)) { take(); digits++; c = nx(); } }
        if (digits === 0) { pos = st; break; }
        if (tok.length < maxW && (c === 'e' || c === 'E')) {
          const save = pos, saveTok = tok;
          take(); c = nx();
          if (c === '+' || c === '-') { take(); c = nx(); }
          if (!isD(c)) { pos = save; tok = saveTok; }
          else while (tok.length < maxW && isD(c)) { take(); c = nx(); }
        }
      }
      items.push({ conv, len: p.len, value: Number(tok), suppressed, text: tok });
      if (!suppressed) count++;
    } else if (conv === 's') {
      while (pos < text.length && !WS(text[pos]) && tok.length < maxW) take();
      items.push({ conv, len: p.len, value: tok, suppressed, text: tok });
      if (!suppressed) count++;
    } else break;
  }
  const eofHit = failedEarly && count === 0 && pos >= text.length;
  return { count: eofHit ? -1 : count, items, pos, eofHit };
}
