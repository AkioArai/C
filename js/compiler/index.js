// Точка входа «компилятора»: исходный текст -> диагностика + программа для интерпретатора.
import { tokenize, preprocess } from './lexer.js';
import { parse } from './parser.js';
import { analyze } from './analyzer.js';
import { HEADERS } from './stdlib.js';
import { Interpreter, RuntimeError } from './interpreter.js';
import { formatDiag } from './diagnostics.js';

export { Interpreter, RuntimeError, formatDiag, HEADERS };

export function compile(source) {
  const lines = source.split('\n');
  const result = { ok: false, diagnostics: [], program: null, pp: null, lines, source };
  try {
    const toks = tokenize(source);
    const pp = preprocess(toks, HEADERS);
    const typedefs = {};
    for (const inc of pp.includes) Object.assign(typedefs, HEADERS[inc.name].types || {});
    const prog = parse(pp.tokens, { typedefs, lines });
    result.pp = pp;
    result.program = prog;
    result.diagnostics.push(...prog.warnings);
    result.diagnostics.push(...analyze(prog, pp, source));
  } catch (e) {
    if (e.diag) result.diagnostics.push(e.diag);
    else throw e;
  }
  result.diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  result.errors = result.diagnostics.filter(d => d.severity === 'error');
  result.ok = result.errors.length === 0 && !!result.program;
  return result;
}

/**
 * Полностью выполняет программу (без анимации) — для проверки задач.
 * Возвращает { output, exitCode, error, diagnostics, steps }.
 */
export function runToEnd(source, stdin = '', opts = {}) {
  const c = compile(source);
  if (!c.ok) return { compileError: true, diagnostics: c.diagnostics, output: '' };
  const it = new Interpreter(c.program, c.pp, { stdin, source, stepLimit: opts.stepLimit ?? 3_000_000, tracing: false, files: opts.files });
  const gen = it.run();
  let error = null;
  try {
    for (;;) {
      const r = gen.next();
      if (r.done) break;
    }
  } catch (e) {
    if (e instanceof RuntimeError) error = e;
    else throw e;
  }
  return { output: it.output, exitCode: it.exitCode, error, diagnostics: c.diagnostics, steps: it.steps, files: it.files };
}
