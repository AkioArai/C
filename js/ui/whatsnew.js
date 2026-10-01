// «Что нового»: короткий список изменений, показывается один раз после обновления.
import { store } from '../store.js';

export const CHANGES = [
  { v: '14', date: 'октябрь 2026', items: [
    ['anim', '«Сонар»: вокруг переменной расходятся кольца, когда из неё читают значение.'],
    ['anim', 'Объявление: память выделяется побайтно — полоска байтов заполняется под карточкой.'],
    ['anim', 'Счётчик итераций цикла «подпрыгивает» на каждом новом проходе.'],
    ['new', 'Таймер фокуса (помодоро) в строке состояния: 25 минут работы, 5 минут отдыха.'],
    ['new', 'Печать урока или сохранение в PDF (кнопка «⎙ печать» в уроке).'],
    ['new', 'Масштаб кода: Ctrl+= / Ctrl+− / Ctrl+0.'],
  ] },
  { v: '13', date: 'октябрь 2026', items: [
    ['fix', 'Исправлено: после обновления сайт мог загрузить смесь старых и новых файлов — тогда лаборатория не открывалась, а кнопки «Запуск/Пауза/Стоп» не работали. Теперь офлайн-режим всегда берёт свежие файлы, а при несовпадении версий страница сама перезагружается.'],
    ['anim', 'Точка останова: строка пульсирует красными кольцами, когда выполнение на ней остановилось.'],
    ['anim', 'Ожидание ввода: буфер клавиатуры светится, стрелка подсказывает, куда печатать.'],
    ['anim', 'Финиш: на панели компьютера появляется штамп «✓ код 0» или «✗ ошибка».'],
    ['new', 'Окно «Что нового» и команда «Сбросить кэш и перезагрузить» (Ctrl+K).'],
    ['new', 'Если что-то сломается, появится сообщение с кнопками «Перезагрузить» и «Скопировать отчёт».'],
  ] },
  { v: '12', date: 'октябрь 2026', items: [
    ['anim', 'Переполнение — красное кольцо-«спидометр»; прыжок switch к case; бегущий пунктир цепочки вызовов.'],
    ['new', 'Поиск и замена (Ctrl+F / Ctrl+H), миникарта кода, ожидаемый вывод в наборах ввода, «Недавнее» в Ctrl+K.'],
  ] },
  { v: '11', date: 'октябрь 2026', items: [
    ['anim', 'Стрелка указателя прорисовывается, импульс по *p; развилка if; обмен значений «⇄».'],
    ['new', 'Наборы ввода с прогоном всех сразу, шаблоны новых файлов, график активности.'],
  ] },
];
const TAG = { fix: ['исправлено', 'fix'], anim: ['анимация', 'anim'], new: ['новое', 'new'] };

export function showWhatsNew(force = false, version) {
  const seen = store.get('seen.version', null);
  if (!force && (seen === version || !store.get('welcome.done', false))) { store.set('seen.version', version); return; }
  store.set('seen.version', version);
  const el = document.createElement('div');
  el.className = 'wn';
  el.innerHTML = `<div class="wn-card" role="dialog" aria-label="Что нового">
    <div class="wn-head"><div><div class="kicker">Обновление ${CHANGES[0].v}</div><h2>Что нового</h2></div><button class="in-close" data-wn-close aria-label="Закрыть">×</button></div>
    <div class="wn-list">${CHANGES.map((c, i) => `<section class="${i ? 'old' : ''}"><h4>Версия ${c.v} <small>${c.date}</small></h4><ul>${c.items.map(([t, s]) => `<li><span class="wn-tag ${TAG[t][1]}">${TAG[t][0]}</span><span>${s}</span></li>`).join('')}</ul></section>`).join('')}</div>
    <div class="wn-foot"><button class="btn primary" data-wn-close>Понятно</button></div>
  </div>`;
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-wn-close]')) el.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(el);
}
