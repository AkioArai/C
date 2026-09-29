// Сравнение интерпретатора с настоящим gcc на наборе программ.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runToEnd } from '../js/compiler/index.js';

const dir = new URL('./programs/', import.meta.url).pathname;
const tmp = process.env.TMPDIR || '/tmp';
let pass = 0, fail = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.c')).sort()) {
  const src = readFileSync(dir + f, 'utf8');
  const inF = dir + f.replace(/\.c$/, '.in');
  const stdin = existsSync(inF) ? readFileSync(inF, 'utf8') : '';
  let expected;
  try {
    execFileSync('gcc', ['-std=gnu11', '-w', '-o', `${tmp}/prog`, dir + f, '-lm']);
    expected = execFileSync(`${tmp}/prog`, { input: stdin }).toString();
  } catch (e) { expected = (e.stdout || '').toString(); }
  const r = runToEnd(src, stdin);
  const ok = !r.compileError && !r.error && r.output === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${f}`);
  if (!ok) {
    if (r.compileError) console.log(r.diagnostics);
    if (r.error) console.log('runtime:', r.error.message, 'line', r.error.line);
    console.log('--- expected\n' + JSON.stringify(expected) + '\n--- got\n' + JSON.stringify(r.output));
  }
  const warns = (r.diagnostics || []).filter(d => d.severity !== 'error');
  if (warns.length && process.env.SHOW_WARN) for (const w of warns) console.log(`   ${w.severity} ${w.line}:${w.col} ${w.message}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
