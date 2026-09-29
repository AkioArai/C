// Подсветка синтаксиса C (для редактора и примеров кода).
const KW = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'sizeof', 'goto', 'struct', 'typedef', 'enum', 'union']);
const TYPES = new Set(['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'const', 'static', 'bool', '_Bool', 'register', 'volatile', 'extern']);
const LIB = new Set(['printf', 'scanf', 'puts', 'putchar', 'getchar', 'sqrt', 'pow', 'fabs', 'abs', 'sin', 'cos', 'tan', 'exp', 'log', 'log10', 'floor', 'ceil', 'round', 'rand', 'srand', 'setlocale', 'fmod', 'atan', 'atan2', 'asin', 'acos', 'hypot', 'cbrt', 'trunc', 'strlen', 'exit', 'system', 'time', 'labs']);
const CONSTS = new Set(['NULL', 'EOF', 'M_PI', 'M_E', 'INT_MAX', 'INT_MIN', 'RAND_MAX', 'LC_ALL', 'true', 'false']);

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const RE = /(\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"?)|('(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?[uUlLfF]*\b|\b0[xX][0-9a-fA-F]+[uUlL]*\b|\.\d+(?:[eE][+-]?\d+)?[fF]?)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_0-9"'])/gm;

export function highlight(src) {
  let out = '';
  let m;
  RE.lastIndex = 0;
  let last = 0;
  while ((m = RE.exec(src))) {
    if (m.index > last) out += esc(src.slice(last, m.index));
    last = RE.lastIndex;
    const [tok, com, str, chr, pre, num, id, ws, op] = m;
    if (com) out += `<span class="t-com">${esc(com)}</span>`;
    else if (str) out += `<span class="t-str">${esc(str).replace(/(%[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|L)?[diouxXfFeEgGcsp%]|\\.)/g, '<span class="t-fmt">$1</span>')}</span>`;
    else if (chr) out += `<span class="t-chr">${esc(chr)}</span>`;
    else if (pre) out += `<span class="t-pre">${esc(pre).replace(/(&lt;[^&]*&gt;|"[^"]*")/, '<span class="t-hdr">$1</span>')}</span>`;
    else if (num) out += `<span class="t-num">${esc(num)}</span>`;
    else if (id) {
      const after = src.slice(RE.lastIndex).match(/^\s*\(/);
      if (KW.has(id)) out += `<span class="t-kw">${id}</span>`;
      else if (TYPES.has(id)) out += `<span class="t-type">${id}</span>`;
      else if (CONSTS.has(id) || /^[A-Z][A-Z0-9_]+$/.test(id)) out += `<span class="t-const">${id}</span>`;
      else if (after && LIB.has(id)) out += `<span class="t-lib">${id}</span>`;
      else if (after) out += `<span class="t-fn">${id}</span>`;
      else out += `<span class="t-id">${id}</span>`;
    } else if (ws) out += ws;
    else if (op) out += `<span class="t-op">${esc(op)}</span>`;
    else out += esc(tok);
    if (tok.length === 0) RE.lastIndex++;
  }
  if (last < src.length) out += esc(src.slice(last));
  return out;
}
