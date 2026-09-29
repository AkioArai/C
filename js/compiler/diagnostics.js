// Диагностика компилятора: ошибки, предупреждения и подсказки на русском языке.

export class CompileError extends Error {
  constructor(message, pos, hint, code) {
    super(message);
    this.diag = makeDiag('error', message, pos, hint, code);
  }
}

export function makeDiag(severity, message, pos = {}, hint = '', code = '') {
  return {
    severity, // 'error' | 'warning' | 'note'
    message,
    line: pos.line ?? 0,
    col: pos.col ?? 0,
    len: pos.len ?? 1,
    hint,
    code,
  };
}

/** Расстояние Левенштейна — для подсказок «возможно, вы имели в виду…». */
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}

export function suggest(name, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    if (c === name) continue;
    const dd = c.toLowerCase() === name.toLowerCase() ? 0.5 : levenshtein(name, c);
    if (dd < bestD) { bestD = dd; best = c; }
  }
  const limit = name.length <= 3 ? 1 : 2;
  return bestD <= limit ? best : null;
}

/** Форматирование в стиле gcc: main.c:5:12: ошибка: ... + строка кода + ^~~~ */
export function formatDiag(d, sourceLines, file = 'main.c') {
  const sev = { error: 'ошибка', warning: 'предупреждение', note: 'заметка' }[d.severity];
  const out = [`${file}:${d.line}:${d.col}: ${sev}: ${d.message}`];
  const src = sourceLines[d.line - 1];
  if (src !== undefined && d.line > 0) {
    const num = String(d.line).padStart(5);
    out.push(`${num} | ${src}`);
    out.push(`${' '.repeat(5)} | ${' '.repeat(Math.max(0, d.col - 1))}^${'~'.repeat(Math.max(0, d.len - 1))}`);
  }
  return out;
}
