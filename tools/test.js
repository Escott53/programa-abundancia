const { chromium } = require('playwright-core');
const URL0 = process.env.URL0 || 'http://127.0.0.1:8766/';
const OUT = process.env.SHOTS === '0' ? null : '/workspace/app-abundancia/screenshots/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: 'dark', acceptDownloads: true });
  const errs = []; const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const calls = [];
  await ctx.route('https://api.openai.com/**', async (r) => {
    const u = r.request().url(); calls.push(u);
    if (u.includes('transcriptions')) return r.fulfill({ json: { text: 'Esta semana trabajamos la gratitud. ¿Por qué tres cosas estás agradecido hoy? Escribe una acción concreta para recibir más.' } });
    return r.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ titulo: 'Gratitud que multiplica', preguntas: ['¿Por qué tres cosas estás agradecido hoy?', 'Escribe una acción concreta para recibir más.'] }) } }] } });
  });
  await ctx.route(/youtube-nocookie\.com|vimeo\.com|drive\.google\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<body style="background:#000;color:#fff;display:grid;place-items:center;height:100vh;margin:0;font:20px sans-serif">▶ vídeo</body>' }));
  await p.addInitScript(() => {
    class SR { start() { setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'esto lo he dictado' }], { isFinal: true })] }), 50); } stop() {} }
    window.webkitSpeechRecognition = window.SpeechRecognition = SR;
  });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const clean = () => p.evaluate(() => { document.getElementById('toast-root').innerHTML = ''; scrollTo(0, 0); });
  await p.goto(URL0);
  // start so today is in week 3; pattern = every day so "today" always has a session
  const d = new Date(Date.now() - 16 * 864e5).toLocaleDateString('sv-SE');
  await p.fill('#st', d); await p.click('#go');
  ok((await p.textContent('.num')).includes('Semana 3 de 17'), 'home Semana 3 de 17');
  await p.goto(URL0 + '#/ajustes');
  for (const wd of [0, 6]) await p.check(`[data-pd="${wd}"]`);
  await p.fill('#nw', '18'); await p.press('#nw', 'Tab'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('pa-data')).weeks === 18), 'weeks editable');
  await p.fill('#nw', '17'); await p.press('#nw', 'Tab');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('pa-data')).pattern.length === 7), 'pattern saved');
  await p.goto(URL0 + '#/'); await p.waitForSelector('.today-task');
  ok(true, 'today task shown');
  // week view
  await p.goto(URL0 + '#/semana/3'); await p.waitForSelector('#theme');
  await p.fill('#title', 'Abrirse a recibir'); await p.fill('#theme', 'Gratitud');
  ok((await p.$$('.weekgrid a')).length === 7, '7 sessions (pattern)');
  await p.click('details.card summary'); await p.uncheck('[data-wd="6"]'); await p.waitForTimeout(100);
  await p.uncheck('[data-wd="0"]'); await p.waitForTimeout(100);
  ok((await p.$$('.weekgrid a')).length === 5, 'per-week override 5 sessions');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('pa-data')).w[3].theme === 'Gratitud'), 'week theme autosaved');
  // open today's session via home
  await p.goto(URL0 + '#/'); await p.click('.today-task'); await p.waitForSelector('#addq');
  await p.click('#addq'); await p.fill('#qt', '¿Qué significa para ti la abundancia?'); await p.click('#ok');
  for (const q of ['¿Por qué tres cosas estás agradecido hoy?', 'Escribe una acción concreta.']) { await p.click('#addq'); await p.fill('#qt', q); await p.click('#ok'); }
  await p.fill('#title', 'Gratitud que multiplica');
  ok((await p.$$('[data-id]')).length === 3, '3 questions');
  ok(!(await p.$('#audio')) && !(await p.$('text=Sacar preguntas')), 'no "Sacar preguntas" button');
  // añadir vídeo en la sesión
  await p.click('#addvs'); await p.fill('#vu', 'https://youtu.be/dQw4w9WgXcQ'); await p.fill('#vt', 'Vídeo de la sesión'); await p.click('#ok');
  await p.waitForSelector('.vinl .player iframe'); ok(true, 'session video inline');
  await p.fill('.vinl [data-vf="note"]', 'Nota del vídeo de sesión'); await p.waitForTimeout(500);
  await p.click('.vinl [data-a="vwt"]'); await p.waitForSelector('.vinl [data-a="vwt"]:has-text("Visto")');
  ok(await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('pa-data')).videos[0]; return v.week === 3 && v.o != null && v.watched && v.note.includes('sesión'); }), 'session video saved (week, session, watched, note)');
  await clean(); if (OUT) await p.screenshot({ path: OUT + 'anadir-video.png' });
  const tas = await p.$$('[data-a="ans"]');
  await tas[0].fill('Libertad para elegir y tiempo con mi familia.');
  await p.click('[data-id]:nth-child(1) [data-a="mic"]'); await p.waitForTimeout(200);
  ok((await tas[0].inputValue()).endsWith('Esto lo he dictado'), 'dictation appends');
  await p.click('[data-id]:nth-child(1) [data-a="mic"]');
  await tas[2].fill('Llamar a Marta para proponer el proyecto. Ahorrar el 10% de cada ingreso.');
  await p.fill('#note', 'Me siento con energía y confianza.'); await p.waitForTimeout(600);
  // follow-up from answer 3
  await p.click('[data-id]:nth-child(3) [data-a="fu"]');
  ok((await p.inputValue('#ft')).startsWith('Llamar a Marta'), 'follow-up prefilled from note');
  const past = new Date(Date.now() - 2 * 864e5).toLocaleDateString('sv-SE');
  await p.fill('#fd', past); await p.click('#ok');
  await p.click('[data-a="fu"] >> nth=-1'); await p.click('[data-k="compromiso"]'); await p.fill('#ft', 'Meditar 10 minutos cada mañana');
  await p.fill('#fd', new Date(Date.now() + 10 * 864e5).toLocaleDateString('sv-SE')); await p.click('#ok');
  ok((await p.$$('[data-fu]')).length === 2, 'follow-ups shown in session');
  await p.click('#done');
  await clean(); if (OUT) await p.screenshot({ path: OUT + 'sesion.png' });
  const D = await p.evaluate(() => JSON.parse(localStorage.getItem('pa-data')));
  const sk = Object.keys(D.w[3].s)[0];
  ok(D.w[3].s[sk].done && D.w[3].s[sk].questions[0].a.includes('dictado'), 'session saved');
  // seguimiento
  await p.goto(URL0 + '#/seguimiento'); await p.waitForSelector('.fu');
  ok((await p.$$('.fu.overdue')).length === 1, 'overdue highlighted');
  await p.click('.fu.overdue'); await p.fill('#lt', 'Le escribí por WhatsApp, quedamos el lunes.'); await p.click('#ladd');
  ok((await p.$$('.log')).length === 1, 'progress log added');
  await p.click('#ok');
  ok((await p.textContent('.fu')).includes('1 avance'), 'log count');
  await p.click('[data-f="over"]'); ok((await p.$$('.fu')).length === 1, 'filter vencidos');
  await p.click('[data-f="curso"]'); ok((await p.$$('.fu')).length === 1, 'status en curso after log');
  await p.click('[data-f="open"]'); await clean(); if (OUT) await p.screenshot({ path: OUT + 'seguimiento.png' });
  // videos
  await p.goto(URL0 + '#/semana/3'); await p.click('#addv');
  await p.fill('#vu', 'https://youtu.be/dQw4w9WgXcQ'); await p.fill('#vt', 'Sesión 3: la gratitud'); await p.click('#ok');
  await p.waitForSelector('.vid >> text=Sesión 3: la gratitud'); ok(true, 'week video listed in week'); await p.click('.vid >> text=Sesión 3: la gratitud');
  await p.waitForSelector('.player iframe');
  ok((await p.getAttribute('.player iframe', 'src')).includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'youtube embedded');
  await p.click('#watched'); await p.fill('#note', 'Repasar el minuto 12.');
  await p.waitForTimeout(500);
  await p.goto(URL0 + '#/videos'); await p.click('#addv'); await p.click('[data-k="file"]');
  await p.setInputFiles('#vf', { name: 'meditacion.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(300000, 1) });
  await p.waitForTimeout(150); ok((await p.textContent('#vfi')).includes('MB'), 'file size shown');
  await p.selectOption('#sheet-root #vw', ''); await p.click('#ok'); await p.waitForSelector('#pl video');
  ok(true, 'local video plays from IndexedDB');
  const dbn = await p.evaluate(async () => (await indexedDB.databases()).map((x) => x.name)); ok(dbn.every((n) => n.startsWith('pa-')), 'IDB namespaced ' + dbn);
  ok(!(await p.$('#fromvid')), 'no fromvid button'); ok(calls.length === 0, 'no OpenAI calls');
  await p.goto(URL0 + '#/videos'); await p.waitForSelector('.vid');
  await p.goto(URL0 + '#/'); await p.goto(URL0 + '#/videos'); await p.waitForSelector('.vid'); await p.waitForTimeout(200);
  ok((await p.$$('.vid')).length === 3, '3 videos listed');
  await p.click('[data-f="3"]'); ok((await p.$$('.vid')).length === 2, 'filter by week');
  await p.click('[data-f="all"]'); await clean(); if (OUT) await p.screenshot({ path: OUT + 'videos.png' });
  // week + home screenshots
  await p.goto(URL0 + '#/semana/3'); await p.waitForSelector('.vid'); await clean(); if (OUT) await p.screenshot({ path: OUT + 'semana.png' });
  await p.goto(URL0 + '#/'); await p.waitForSelector('#fustats');
  ok((await p.textContent('#fustats')).replace(/\s/g, '').startsWith('2seguimientos'), 'home pending follow-ups count');
  await clean(); if (OUT) await p.screenshot({ path: OUT + 'inicio.png' });
  // releer & search
  await p.goto(URL0 + '#/releer/3'); ok((await p.textContent('.read')).includes('Marta') && (await p.textContent('.read')).includes('Repasar'), 'releer week');
  await p.goto(URL0 + '#/buscar'); await p.fill('#s', 'gratitud');
  const nm = (await p.$$('mark')).length; ok(nm >= 3, 'search across (' + nm + ' marks)');
  await p.fill('#s', 'whatsapp'); ok((await p.$$('.hit')).length === 1, 'search follow-up log');
  // export / import
  await p.goto(URL0 + '#/ajustes');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ej')]);
  const json = require('fs').readFileSync(await dl.path(), 'utf8'); const J = JSON.parse(json);
  ok(J.data.follow.length === 2 && J.data.videos.length === 3 && /no se incluyen/.test(J.aviso), 'export json');
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#em')]);
  const md = require('fs').readFileSync(await dl2.path(), 'utf8'); ok(md.includes('## Seguimiento') && md.includes('youtu.be'), 'export markdown');
  await p.evaluate(() => localStorage.removeItem('pa-data')); await p.reload();
  await p.click('#go'); await p.goto(URL0 + '#/ajustes');
  p.once('dialog', (x) => x.accept());
  await p.setInputFiles('#if', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('pa-data')).w[3].theme === 'Gratitud'), 'import json');
  const keys = await p.evaluate(() => Object.keys(localStorage)); ok(keys.every((k) => k.startsWith('pa-')), 'storage keys namespaced: ' + keys);
  await p.click('#lk'); await p.fill('#mtl-p1', '1234'); await p.click('[data-a="next"]'); await p.fill('#mtl-p2', '1234'); await p.click('[data-a="next"]');
  await p.waitForTimeout(1500); ok(await p.evaluate(() => !!localStorage.getItem('pa-lock-config')), 'lock pa-lock-config');
  await p.reload(); await p.waitForSelector('#pa-lock-screen'); await p.fill('#mtl-pin', '1234'); await p.click('[data-a="ok"]');
  await p.waitForSelector('h1'); ok(!(await p.$('#pa-lock-screen')), 'unlock with PIN');
  ok(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 'service worker registered');
  console.log(errs.length ? errs.join('\n') : 'NO PAGE ERRORS'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
