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
