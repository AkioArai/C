// Проверка практикума: эталонные решения дают в интерпретаторе тот же вывод, что и gcc.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runToEnd } from '../js/compiler/index.js';
import { TASKS, compareOutput } from '../js/content/tasks.js';
import { EXAMPLES } from '../js/content/examples.js';
import { SNIPPETS } from '../js/content/lessons.js';

const tmp = process.env.TMPDIR || '/tmp';
let pass = 0, fail = 0;
const gcc = (src, stdin) => {
  writeFileSync(`${tmp}/t.c`, src);
  execFileSync('gcc', ['-std=gnu11', '-w', '-o', `${tmp}/t`, `${tmp}/t.c`, '-lm']);
  try { return execFileSync(`${tmp}/t`, { input: stdin, timeout: 5000 }).toString(); }
  catch (e) { return (e.stdout || '').toString(); }
};

for (const t of TASKS) {
  let ok = true;
  const t0 = Date.now();
  let maxSteps = 0;
  for (const input of t.tests) {
    const stdin = input + '\n';
    const exp = gcc(t.solution, stdin);
    const r = runToEnd(t.solution, stdin);
    maxSteps = Math.max(maxSteps, r.steps || 0);
    if (r.compileError || r.error || r.output !== exp || !compareOutput(r.output, exp, t.check)) {
      ok = false;
      console.log(`FAIL ${t.id} input=${JSON.stringify(input)}`);
      if (r.compileError) console.log(r.diagnostics.filter(d => d.severity === 'error'));
      if (r.error) console.log('runtime', r.error.message);
      console.log(' gcc:', JSON.stringify(exp), '\n ours:', JSON.stringify(r.output));
    }
  }
  const warns = (runToEnd(t.solution, t.tests[0] + '\n').diagnostics || []).filter(d => d.severity === 'warning');
  for (const w of warns) console.log(`  warn ${t.id} ${w.line}: ${w.message}`);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${t.id} (${Date.now() - t0} мс, до ${maxSteps} шагов)`);
}

// примеры и сниппеты должны компилироваться без ошибок
for (const [name, list] of [['example', EXAMPLES], ['snippet', SNIPPETS]]) {
  for (const ex of list) {
    const r = runToEnd(ex.code, (ex.stdin || '') + '\n');
    const errs = (r.diagnostics || []).filter(d => d.severity === 'error');
    const intended = /без #include|ошибк|Ошибка|Зацикливание|scanf без/i.test(ex.title);
    if (errs.length && !intended) { fail++; console.log(`FAIL ${name} «${ex.title}»:`, errs.map(e => e.line + ': ' + e.message)); }
    else if (r.error && !intended) { fail++; console.log(`FAIL ${name} «${ex.title}» runtime:`, r.error.message); }
    else pass++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
