// Установка как приложение (PWA) и офлайн-режим.
let deferred = null;
const listeners = new Set();
export const onInstallChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(canInstall()));

export function initPwa() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/claudeusercontent|claude\.ai/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  addEventListener('appinstalled', () => { deferred = null; emit(); });
}
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canInstall = () => !!deferred && !isStandalone();
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Показать системное окно установки; на iPad/iPhone — инструкцию. Возвращает текст для уведомления. */
export async function install() {
  if (isStandalone()) return 'Приложение уже установлено';
  if (deferred) {
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null; emit();
    return r?.outcome === 'accepted' ? 'Установлено! Ищите «Вселенная Си» среди приложений' : 'Установку можно запустить позже из поиска (Ctrl+K)';
  }
  if (isIos()) return 'В Safari нажмите «Поделиться» → «На экран „Домой“»';
  return 'Откройте меню браузера → «Установить приложение» (в Chrome, Edge, Яндекс Браузере)';
}
