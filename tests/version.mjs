// Версия страницы (index.html) и кода (js/app.js) должны совпадать — иначе приложение
// примет себя за «смесь версий» и будет перезагружаться.
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/name="app-version" content="([^"]+)"/)?.[1];
const code = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1];
if (!page || page !== code) { console.log(`FAIL версии не совпадают: index.html ${page}, app.js ${code}`); process.exit(1); }
console.log(`version: ${page} ok`);
