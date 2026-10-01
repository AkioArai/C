// Резервная копия: весь прогресс, файлы и настройки — в один JSON-файл и обратно.
const PREFIX = 'cuniverse.';

export function exportAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PREFIX)) data[k.slice(PREFIX.length)] = localStorage.getItem(k);
  }
  const blob = new Blob([JSON.stringify({ app: 'c-universe', v: 1, at: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `вселенная-си-${new Date().toLocaleDateString('sv')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Выбрать файл и восстановить из него всё. onDone(text) — сообщение для пользователя. */
export function importAll(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try {
      const j = JSON.parse(await inp.files[0].text());
      if (j.app !== 'c-universe' || !j.data) throw new Error('not ours');
      if (!confirm('Заменить текущий прогресс, файлы и настройки данными из резервной копии?')) return;
      for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(j.data)) localStorage.setItem(PREFIX + k, v);
      onDone?.('Восстановлено. Перезагружаем…');
      setTimeout(() => location.reload(), 700);
    } catch { onDone?.('Это не резервная копия «Вселенной Си»'); }
  };
  inp.click();
}
