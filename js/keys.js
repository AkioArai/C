// Ключи доступа: подпись (у продавца) и проверка (в приложении). ECDSA P-256 через WebCrypto.
// Формат ключа: CU1.<данные base64url>.<подпись base64url>
// Данные: { v, i: номер, n: имя/ник, t: выдан (мс), e: действует до (мс) } — без телефонов и прочих данных.
export const b64e = (u8) => { let s = ''; for (const b of new Uint8Array(u8)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const b64d = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };

export async function makeSellerKeys() {
  const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { priv, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
}
export function newId() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(6));
  return [...r].map((b) => A[b % A.length]).join('');
}
export async function signKey(privJwk, payload) {
  const key = await crypto.subtle.importKey('jwk', privJwk, ALG, false, ['sign']);
  const data = b64e(new TextEncoder().encode(JSON.stringify({ v: 1, ...payload })));
  const sig = await crypto.subtle.sign(SIG, key, new TextEncoder().encode(data));
  return `CU1.${data}.${b64e(sig)}`;
}
export function parseKey(str) {
  const m = String(str || '').replace(/\s+/g, '').match(/^CU1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try { return { payload: JSON.parse(new TextDecoder().decode(b64d(m[1]))), data: m[1], sig: m[2] }; } catch { return null; }
}
/** Подлинность ключа: { ok, payload } или { ok: false, reason: 'format' | 'signature' }. */
export async function verifyKey(str, pubJwk) {
  const k = parseKey(str);
  if (!k || !k.payload?.i || !k.payload?.e) return { ok: false, reason: 'format' };
  try {
    const key = await crypto.subtle.importKey('jwk', { ...pubJwk, ext: true }, ALG, false, ['verify']);
    const ok = await crypto.subtle.verify(SIG, key, b64d(k.sig), new TextEncoder().encode(k.data));
    return ok ? { ok: true, payload: k.payload } : { ok: false, reason: 'signature' };
  } catch { return { ok: false, reason: 'signature' }; }
}
