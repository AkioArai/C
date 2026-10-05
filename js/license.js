// Лицензия в приложении: хранит ключ, проверяет подпись, срок и список отозванных ключей.
import { CONFIG } from './config.js';
import { verifyKey } from './keys.js';
import { store } from './store.js';

const DAY = 864e5;
const listeners = new Set();
export const onLicense = (fn) => listeners.add(fn);
let state = { on: false, pro: true, status: 'off' };
export const license = () => state;
export const paywallOn = () => !!CONFIG.publicKey;

/** Время с защитой от перевода часов назад. */
function now() {
  const t = Date.now(), max = store.get('license.maxSeen', 0);
  if (t > max) store.set('license.maxSeen', t);
  return Math.max(t, max - DAY);
}

async function fetchRevoked() {
  try {
    const r = await fetch('revoked.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw 0;
    const j = await r.json();
    store.set('license.revoked', Array.isArray(j.revoked) ? j.revoked : []);
    store.set('license.lastCheck', Date.now());
    return true;
  } catch { return false; }
}

/** Пересчитать состояние. online — сходить за списком отозванных. */
export async function refresh(online = true) {
  if (!paywallOn()) { state = { on: false, pro: true, status: 'off' }; emit(); return state; }
  const key = store.get('license.key', '');
  if (!key) { state = { on: true, pro: false, status: 'none' }; emit(); return state; }
  const v = await verifyKey(key, CONFIG.publicKey);
  if (!v.ok) { state = { on: true, pro: false, status: 'invalid' }; emit(); return state; }
  const p = v.payload;
  if (online) await fetchRevoked();
  const t = now();
  const base = { on: true, id: p.i, name: p.n || '', issued: p.t, until: p.e, daysLeft: Math.max(0, Math.ceil((p.e - t) / DAY)) };
  if (store.get('license.revoked', []).includes(p.i)) state = { ...base, pro: false, status: 'revoked' };
  else if (t > p.e) state = { ...base, pro: false, status: 'expired' };
  else if (t - store.get('license.lastCheck', 0) > CONFIG.offlineDays * DAY) state = { ...base, pro: false, status: 'offline' };
  else state = { ...base, pro: true, status: 'active' };
  emit();
  return state;
}
function emit() { for (const fn of listeners) fn(state); }

/** Активировать ключ: проверяет подпись, срок и отзыв; сохраняет только при успехе. */
export async function activate(str) {
  const key = String(str || '').replace(/\s+/g, '');
  const v = paywallOn() ? await verifyKey(key, CONFIG.publicKey) : { ok: false, reason: 'off' };
  if (!v.ok) return { ok: false, msg: v.reason === 'off' ? 'Платный режим пока не включён — всё и так доступно.' : 'Ключ не подходит: проверьте, что скопировали его целиком.' };
  const prev = store.get('license.key', '');
  store.set('license.key', key);
  const s = await refresh(true);
  if (s.status === 'active') return { ok: true, msg: `Подписка активна до ${new Date(s.until).toLocaleDateString('ru')}` };
  store.set('license.key', prev);
  await refresh(false);
  return { ok: false, msg: s.status === 'expired' ? 'Срок этого ключа уже закончился.' : s.status === 'revoked' ? 'Этот ключ отозван продавцом.' : 'Не удалось проверить ключ — подключитесь к интернету.' };
}
export function removeKey() { store.set('license.key', ''); return refresh(false); }

// ——— что доступно без ключа ———
export function lessonLocked(l) { return !state.pro && !CONFIG.free.lessonTopics.includes(l.topic); }
export function taskLocked(t) { return !state.pro && !(CONFIG.free.tasks.topics.includes(String(t.topic)) && CONFIG.free.tasks.levels.includes(t.level)); }
export function drillLocked(tab) { return !state.pro && !CONFIG.free.drillTabs.includes(tab); }
export function featureLocked() { return !state.pro; }

const STATUS_TEXT = {
  none: 'Это входит в подписку.',
  invalid: 'Сохранённый ключ повреждён — введите его заново.',
  expired: 'Срок подписки закончился — продлите её, чтобы продолжить.',
  revoked: 'Ключ отозван продавцом.',
  offline: `Подключитесь к интернету: ключ нужно проверять хотя бы раз в ${CONFIG.offlineDays} дней.`,
};
/** Карточка «закрыто» для страниц. */
export function lockCard(what = 'Этот раздел') {
  return `<div class="lock-card"><div class="lock-ic"><svg class="ic" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
    <h3>${what} — в подписке</h3><p>${STATUS_TEXT[state.status] || STATUS_TEXT.none} Бесплатно остаются лаборатория с визуализацией, примеры, тема 1, лёгкие задачи темы 1 и «Угадай вывод».</p>
    <div class="lock-act"><a class="btn primary" href="#/pro">Ввести ключ</a><a class="btn ghost" href="#/pro/buy">Как получить</a></div></div>`;
}
