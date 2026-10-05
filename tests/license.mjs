// Ключи доступа: настоящий ключ проходит, подделка, чужой ключ, просроченный и отозванный — нет.
import { makeSellerKeys, signKey, verifyKey, newId, parseKey } from '../js/keys.js';
import { CONFIG } from '../js/config.js';
import { store } from '../js/store.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const seller = await makeSellerKeys(), other = await makeSellerKeys();
const DAY = 864e5, now = Date.now();
const key = await signKey(seller.priv, { i: newId(), n: 'Тест', t: now, e: now + 30 * DAY });
ok((await verifyKey(key, seller.pub)).ok, 'настоящий ключ');
ok(!(await verifyKey(key, other.pub)).ok, 'ключ другого продавца');
const p = parseKey(key);
const forged = `CU1.${Buffer.from(JSON.stringify({ ...p.payload, e: now + 999 * DAY })).toString('base64url')}.${p.sig}`;
ok(!(await verifyKey(forged, seller.pub)).ok, 'подделанный срок');
ok(!(await verifyKey('CU1.abc', seller.pub)).ok, 'мусор');
ok((await verifyKey(' ' + key.slice(0, 40) + '\n' + key.slice(40) + ' ', seller.pub)).ok, 'ключ с переносом строки');
// состояние приложения
CONFIG.publicKey = seller.pub;
const seen = [];
let rawDown = false;
globalThis.fetch = async (url) => {
  seen.push(String(url));
  if (rawDown && String(url).startsWith('https://raw.githubusercontent.com/')) throw new Error('offline');
  return { ok: true, json: async () => ({ revoked: revokedList }) };
};
let revokedList = [];
const L = await import('../js/license.js');
ok((await L.activate(key)).ok && L.license().pro, 'активация');
ok(L.taskLocked({ topic: 3, level: 'hard' }) === false, 'с ключом задачи открыты');
revokedList = [p.payload.i];
await L.refresh(true);
ok(!L.license().pro && L.license().status === 'revoked', 'отзыв');
ok(seen.some(u => u.startsWith(`https://raw.githubusercontent.com/${CONFIG.repo}/`)), 'список берётся прямо из репозитория');
ok(seen.every(u => /\?t=\d+/.test(u)), 'запрос в обход кэша');
// репозиторий недоступен — берём копию с сайта
revokedList = []; rawDown = true; seen.length = 0;
await L.refresh(true);
ok(L.license().pro && seen.some(u => u.startsWith('revoked.json')), 'запасной источник — копия на сайте');
rawDown = false;
// нет сети совсем — последняя проверка не продлевается
const before = store.get('license.lastCheck', 0);
globalThis.fetch = async () => { throw new Error('offline'); };
await new Promise(r => setTimeout(r, 5));
await L.refresh(true);
ok(store.get('license.lastCheck', 0) === before, 'без сети время проверки не обновляется');
globalThis.fetch = async () => ({ ok: true, json: async () => ({ revoked: revokedList }) });
revokedList = [p.payload.i];
await L.refresh(true);
ok(L.license().status === 'revoked', 'снова отозван');
const old = await signKey(seller.priv, { i: newId(), n: '', t: now - 40 * DAY, e: now - 10 * DAY });
ok(!(await L.activate(old)).ok, 'просроченный ключ не активируется');
ok(L.taskLocked({ topic: 3, level: 'hard' }) && !L.taskLocked({ topic: 1, level: 'easy' }), 'бесплатные задачи');
ok(L.lessonLocked({ topic: 2 }) && !L.lessonLocked({ topic: 1 }), 'бесплатные уроки');
store.set('license.key', '');
console.log(`license: ${fail ? 'FAIL' : 'ok'} (${key.length} символов в ключе)`);
if (fail) process.exit(1);
