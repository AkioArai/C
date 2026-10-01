// Простое автоформатирование C: отступы по фигурным скобкам, case/default,
// однострочные тела if/for/while без скобок, лишние пробелы и пустые строки.
// Строки, символы и комментарии не трогаем.

/** Разметить строку: где код, а где строки/комментарии (с учётом многострочных комментариев). */
function scan(line, inComment) {
  let code = '', i = 0;
  while (i < line.length) {
    if (inComment) {
      const e = line.indexOf('*/', i);
      if (e < 0) return { code, inComment: true };
      i = e + 2; inComment = false; continue;
    }
    const c = line[i];
    if (c === '/' && line[i + 1] === '*') { inComment = true; i += 2; continue; }
    if (c === '/' && line[i + 1] === '/') break;
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < line.length && line[i] !== q) i += line[i] === '\\' ? 2 : 1;
      i++; code += q + q; continue;
    }
    code += c; i++;
  }
  return { code, inComment };
}

export function formatC(src, indent = '    ') {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inComment = false, blank = 0;
  let base = 0;           // отступ содержимого текущего блока
  const blocks = [];      // открытые { : отступ строки-владельца, прежний base, switch ли это
  let heads = [], closed = []; // заголовки if/for/while/else без фигурных скобок
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { if (++blank <= 1 && out.length) out.push(''); continue; }
    blank = 0;
    const startedInComment = inComment;
    const s = scan(t, inComment);
    inComment = s.inComment;
    const code = s.code.trim();
    if (startedInComment) { out.push(indent.repeat(base + (heads.length ? 1 : 0)) + ' ' + t); continue; }
    if (t.startsWith('#')) { out.push(t); continue; }

    const top = blocks[blocks.length - 1];
    const isCase = /^(case\b[^:]*|default\s*):/.test(code);
    const inner = top?.sw && !isCase ? base + 1 : base; // в switch тело case глубже метки
    let d;
    if (code.startsWith('}')) d = top ? top.owner : 0;
    else if (/^else\b/.test(code) && !heads.length) {
      // else относится к последнему if без скобок, тело которого только что закончилось
      let k = closed.length - 1;
      while (k >= 0 && closed[k].kind !== 'if') k--;
      d = k >= 0 ? closed[k].d : inner;
      heads = k >= 0 ? closed.slice(0, k) : [];
    } else if (heads.length) d = code.startsWith('{') ? heads[heads.length - 1].d : heads[heads.length - 1].d + 1;
    else if (/^[A-Za-z_]\w*\s*:(?!:)/.test(code) && !isCase) d = Math.max(0, inner - 1); // метка для goto
    else d = inner;
    out.push(indent.repeat(d) + t.replace(/[ \t]+$/, ''));

    // скобки строки по порядку
    let opened = false;
    for (const ch of code) {
      if (ch === '{') { blocks.push({ owner: d, base, sw: /^switch\b/.test(code), heads }); base = d + 1; opened = true; heads = []; closed = []; }
      else if (ch === '}') { const b = blocks.pop(); if (b) { base = b.base; closed = b.heads; } }
    }
    if (opened) continue;
    const head = code.match(/^(else\s+if|if|for|while|else)\b/);
    if (head && !/[;{}]\s*$/.test(code)) heads.push({ kind: /if$/.test(head[1]) ? 'if' : head[1], d });
    else if (/;\s*$/.test(code)) { closed = heads; heads = []; }
    else if (/}\s*$/.test(code) && !code.startsWith('}')) { closed = heads; heads = []; }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}
