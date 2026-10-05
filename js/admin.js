// Страница продавца: ключи продавца, выдача ключей покупателям, журнал и отзыв.
// Секретный ключ хранится ТОЛЬКО в этом браузере (и в резервной копии, которую вы скачали).
import { makeSellerKeys, signKey, newId, parseKey } from './keys.js';
import { CONFIG } from './config.js';
import { applyUi } from './ui/settings.js';

applyUi();
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('cuadmin.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('cuadmin.' + k, JSON.stringify(v)) };
const DAY = 864e5;
const fmt = (ms) => new Date(ms).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' });
const site = () => LS.get('site', CONFIG.siteUrl);
const copy = (t, b) => navigator.clipboard?.writeText(t).then(() => { if (b) { const o = b.textContent; b.textContent = 'Скопировано'; setTimeout(() => (b.textContent = o), 1200); } }).catch(() => prompt('Скопируйте:', t));
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); };
let last = null;

function render() {
  const keys = LS.get('seller', null);
  const journal = LS.get('journal', []);
  const revoked = journal.filter(j => j.revoked).map(j => j.id);
  const pubJson = keys ? JSON.stringify(keys.pub) : '';
  const match = keys && CONFIG.publicKey && CONFIG.publicKey.x === keys.pub.x && CONFIG.publicKey.y === keys.pub.y;
  $('[data-adm]').innerHTML = `<div class="adm-in">
    <div class="kicker">Только для продавца · не публикуйте ссылку</div><h1>Ключи доступа</h1>
    ${!keys ? `<section class="pro-card"><h3>Шаг 1. Создать ключи продавца</h3>
      <p>Создаётся пара ключей: <b>секретный</b> (подписывает ключи покупателей, остаётся только у вас) и <b>открытый</b> (вписывается в приложение и проверяет подпись).</p>
      <div class="lock-act"><button class="btn primary" data-a="gen">Создать ключи продавца</button><button class="btn" data-a="import">Восстановить из резервной копии</button></div></section>` : `
    <section class="pro-card ${match ? '' : 'warn'}"><h3>${match ? '✓ Приложение настроено на ваши ключи' : 'Шаг 2. Включить платный режим в приложении'}</h3>
      ${match ? '<p class="muted">Ключи, выданные здесь, принимаются приложением.</p>' : `<p>Скопируйте открытый ключ и вставьте его в файл <code>js/config.js</code> вместо <code>publicKey: null</code> (или отправьте его разработчику). Открытый ключ не секретный.</p>
      <pre class="adm-pre">publicKey: ${esc(pubJson)},</pre><div class="lock-act"><button class="btn primary" data-a="copypub">Скопировать строку</button><a class="btn" href="https://github.com/AkioArai/C/edit/main/js/config.js" target="_blank" rel="noopener">Открыть config.js на GitHub</a></div>`}
      <div class="lock-act"><button class="btn ghost small" data-a="backup">⬇ Резервная копия (секретный ключ + журнал)</button><button class="btn ghost small" data-a="import">Восстановить из копии</button></div>
      <small class="muted">Храните резервную копию в надёжном месте и никому не отправляйте: с ней можно выпускать ключи от вашего имени. Без неё, если очистить браузер, придётся создавать новые ключи продавца.</small></section>

    <section class="pro-card"><h3>Выдать ключ</h3>
      <div class="adm-form">
        <label>Имя или ник покупателя<input data-f="name" placeholder="например, Ali T. (будет видно в приложении)" maxlength="40"></label>
        <label>Срок<select data-f="days"><option value="30">30 дней — месяц</option><option value="120">120 дней — семестр</option><option value="7">7 дней — пробный</option><option value="custom">другое…</option></select></label>
        <label data-custom hidden>Дней<input data-f="cdays" type="number" min="1" max="400" value="30"></label>
        <label>Заметка для себя<input data-f="note" placeholder="сумма, дата оплаты… (видно только вам)"></label>
      </div>
      <button class="btn primary" data-a="issue">Выпустить ключ</button>
      ${last ? `<div class="adm-out"><b>Готово: ключ ${esc(last.id)} для ${esc(last.name || 'покупателя')} до ${fmt(last.e)}</b>
        <label>Сообщение для Телеграма<textarea readonly rows="7" data-msg>${esc(message(last))}</textarea></label>
        <div class="lock-act"><button class="btn primary" data-a="copymsg">Скопировать сообщение</button><button class="btn" data-a="copylink">Только ссылку</button><button class="btn" data-a="copykey">Только ключ</button></div></div>` : ''}
    </section>

    <section class="pro-card"><h3>Журнал ключей <small class="muted">${journal.length}</small></h3>
      ${journal.length ? `<div class="adm-table">${journal.slice().reverse().map(j => { const st = j.revoked ? 'отозван' : Date.now() > j.e ? 'истёк' : 'активен'; return `<div class="adm-row ${j.revoked ? 'rev' : Date.now() > j.e ? 'exp' : ''}"><code>${esc(j.id)}</code><span><b>${esc(j.name || '—')}</b><small>${esc(j.note || '')}</small></span><span>${fmt(j.t)} → ${fmt(j.e)}</span><span class="adm-st">${st}</span><span class="adm-b"><button class="btn small ghost" data-copy="${esc(j.id)}">ссылка</button><button class="btn small ${j.revoked ? '' : 'ghost'}" data-rev="${esc(j.id)}">${j.revoked ? 'вернуть' : 'отозвать'}</button></span></div>`; }).join('')}</div>` : '<p class="muted">Ключей пока нет.</p>'}
    </section>

    <section class="pro-card"><h3>Список отозванных ключей</h3>
      <p>Чтобы отзыв сработал, содержимое ниже нужно вставить в файл <code>revoked.json</code> на GitHub. Приложение увидит это при следующем запуске с интернетом (до 6 часов, если оно уже открыто).</p>
      <pre class="adm-pre">${esc(JSON.stringify({ revoked }, null, 1))}</pre>
      <div class="lock-act"><button class="btn primary" data-a="copyrev">Скопировать</button><a class="btn" href="https://github.com/AkioArai/C/edit/main/revoked.json" target="_blank" rel="noopener">Открыть revoked.json на GitHub</a></div></section>`}
  </div>`;
}
function message(k) {
  const link = `${site()}#/activate/${k.key}`;
  return `Ваш ключ «Вселенная Си PRO» готов ✅\nДействует до ${fmt(k.e)}.\n\nАктивация в одно нажатие (откройте на своём устройстве):\n${link}\n\nИли вставьте ключ в разделе «Подписка»:\n${k.key}\n\nКлюч личный — пожалуйста, не передавайте его другим.`;
}

document.addEventListener('change', (e) => { if (e.target.matches('[data-f="days"]')) $('[data-custom]').hidden = e.target.value !== 'custom'; });
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  const keys = LS.get('seller', null);
  if (a === 'gen') {
    if (keys && !confirm('Ключи уже есть. Создать новые? Старые выданные ключи перестанут работать после обновления приложения.')) return;
    LS.set('seller', await makeSellerKeys()); render();
  }
  if (a === 'backup') download(`kluchi-prodavca-${new Date().toLocaleDateString('sv')}.json`, JSON.stringify({ seller: keys, journal: LS.get('journal', []), saved: new Date().toISOString() }, null, 1));
  if (a === 'import') {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    inp.onchange = async () => { try { const j = JSON.parse(await inp.files[0].text()); if (!j.seller?.priv) throw 0; LS.set('seller', j.seller); LS.set('journal', j.journal || []); render(); } catch { alert('Это не резервная копия ключей продавца.'); } };
    inp.click();
  }
  if (a === 'copypub') copy(`publicKey: ${JSON.stringify(keys.pub)},`, e.target);
  if (a === 'issue') {
    const name = $('[data-f="name"]').value.trim().slice(0, 40), note = $('[data-f="note"]').value.trim();
    const dv = $('[data-f="days"]').value, days = dv === 'custom' ? Math.max(1, Math.min(400, +$('[data-f="cdays"]').value || 30)) : +dv;
    const id = newId(), t = Date.now(), ek = t + days * DAY;
    const key = await signKey(keys.priv, { i: id, n: name, t, e: ek });
    const j = LS.get('journal', []); j.push({ id, name, note, t, e: ek, key }); LS.set('journal', j);
    last = { id, name, t, e: ek, key }; render();
    document.querySelector('.adm-out')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (a === 'copymsg') copy($('[data-msg]').value, e.target);
  if (a === 'copylink') copy(`${site()}#/activate/${last.key}`, e.target);
  if (a === 'copykey') copy(last.key, e.target);
  if (a === 'copyrev') copy(JSON.stringify({ revoked: LS.get('journal', []).filter(j => j.revoked).map(j => j.id) }, null, 1), e.target);
  const rv = e.target.closest('[data-rev]');
  if (rv) { const j = LS.get('journal', []); const it = j.find(x => x.id === rv.dataset.rev); if (it && (it.revoked || confirm(`Отозвать ключ ${it.id}${it.name ? ' (' + it.name + ')' : ''}?`))) { it.revoked = !it.revoked; LS.set('journal', j); render(); } }
  const cp = e.target.closest('[data-copy]');
  if (cp) { const it = LS.get('journal', []).find(x => x.id === cp.dataset.copy); if (it) copy(`${site()}#/activate/${it.key}`, cp); }
});
render();
export { parseKey };
