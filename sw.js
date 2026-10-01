// Офлайн-режим. Пока есть интернет, всегда берём свежие файлы с сервера
// (в обход HTTP-кэша браузера), чтобы старые и новые файлы никогда не смешивались.
// Без интернета — отдаём последнюю сохранённую копию.
const CACHE = 'cuniverse-v2';
const CORE = ['./', './index.html', './css/style.css', './js/app.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data === 'clear') e.waitUntil(caches.delete(CACHE));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (!same && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // сеть с проверкой свежести: сервер ответит новой версией или «не изменилось»
      // переход по странице (navigate) нельзя скопировать с новыми параметрами — строим запрос по адресу
      const res = await fetch(same ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: same });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
