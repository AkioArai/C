// Тренажёр: вывод интерпретатора для сгенерированных программ совпадает с gcc.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runToEnd } from '../js/compiler/index.js';
import { _GEN, choices } from '../js/content/drill.js';

const tmp = process.env.TMPDIR || '/tmp';
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let pass = 0, fail = 0;
_GEN.forEach((g, gi) => {
  for (let k = 0; k < 12; k++) {
    const q = g(rnd);
    if (!q) continue;
    writeFileSync(`${tmp}/d.c`, q.code);
    execFileSync('gcc', ['-std=gnu11', '-w', '-o', `${tmp}/d`, `${tmp}/d.c`]);
    const exp = execFileSync(`${tmp}/d`).toString();
    const r = runToEnd(q.code);
    const ch = choices(q, r.output, rnd);
    const ok = !r.compileError && !r.error && r.output === exp && ch.includes(exp.replace(/\n$/, '')) && new Set(ch).size === 4;
    if (ok) pass++; else { fail++; console.log(`FAIL gen ${gi} (${q.cat})`, JSON.stringify(exp), JSON.stringify(r.output), ch, r.diagnostics?.filter(d => d.severity === 'error')); }
  }
});
console.log(`\ndrill: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

// «Найди ошибку»: исправленная программа компилируется без ошибок и завершается
import { _BUG, makeBug, seeded } from '../js/content/drill.js';
let bp = 0, bf = 0;
_BUG.forEach((g, gi) => {
  for (let k = 0; k < 6; k++) {
    const r = seeded(`bug${gi}-${k}`);
    const one = g(r);
    const q = makeBug(() => 0); // форма вопроса
    const head = ['#include <stdio.h>', '', 'int main(void) {'];
    const lines = [...head, ...one.body.map(l => '    ' + l), '    return 0;', '}'];
    const ln = head.length + one.bug;
    const fixed = lines.slice(); fixed[ln] = '    ' + one.fix;
    const res = runToEnd(fixed.join('\n') + '\n', '5\ny\n', { stepLimit: 200000 });
    const errs = (res.diagnostics || []).filter(d => d.severity === 'error');
    if (!q.code || res.compileError || errs.length || res.error) { bf++; console.log('FAIL bug', gi, one.kind, errs.map(e => e.message), res.error?.message); }
    else bp++;
  }
});
console.log(`bugs: ${bp} passed, ${bf} failed`);
if (bf) process.exit(1);
