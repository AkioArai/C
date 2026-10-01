// Каждый файл приложения должен разбираться без синтаксических ошибок —
// одна такая ошибка в модуле ломает весь сайт.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const files = ['sw.js', ...readdirSync(join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => join('js', f))];
let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' }); }
  catch (e) { bad++; console.log('FAIL', f, '\n', String(e.stderr).split('\n').slice(0, 5).join('\n')); }
}
console.log(`syntax: ${files.length - bad} ok, ${bad} failed`);
if (bad) process.exit(1);
