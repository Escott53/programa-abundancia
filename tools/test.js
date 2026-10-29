const { chromium } = require('playwright-core');
const URL0 = process.env.URL0 || 'http://127.0.0.1:8766/';
const OUT = process.env.SHOTS === '0' ? null : '/workspace/app-abundancia/screenshots/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: 'dark', acceptDownloads: true });
  const errs = []; const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  await ctx.route(/youtube-nocookie\.com|vimeo\.com|drive\.google\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<body style="background:#000;color:#fff;display:grid;place-items:center;height:100vh;margin:0;font:20px sans-serif">▶ vídeo</body>' }));
  await p.addInitScript(() => {
    class SR { start() { setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'esto lo he dictado' }], { isFinal: true })] }), 50); } stop() {} }
    window.webkitSpeechRecognition = window.SpeechRecognition = SR;
  });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const clean = () => p.evaluate(() => { document.getElementById('toast-root').innerHTML = ''; scrollTo(0, 0); });
  const D = () => p.evaluate(() => JSON.parse(localStorage.getItem('pa-data')));
  // ---- migración desde v1 ----
  await p.goto(URL0 + 'manifest.json');
  await p.evaluate(() => localStorage.setItem('pa-data', JSON.stringify({ v: 1, start: '2026-10-05', weeks: 17, pattern: [1, 2, 3, 4, 5],
    w: { 1: { title: 'Abrirse a recibir', theme: 'Gratitud', note: 'Nota semanal', days: null, s: { 2: { title: 'Sesión gratitud', note: 'Me siento bien', done: true, transcript: '', questions: [{ id: 'q1', q: '¿Qué agradeces?', a: 'Mi familia' }] }, 3: { title: '', note: '', questions: [], done: false } } } },
    videos: [{ id: 'v1', week: 1, o: 2, kind: 'url', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Vídeo 1', note: 'nota vídeo', questions: [], watched: true, added: 1 }, { id: 'v2', week: null, o: null, kind: 'url', url: 'https://example.com', title: 'General', questions: [{ id: 'q9', q: 'P vídeo', a: 'R vídeo' }], added: Date.parse('2026-10-20') }],
    follow: [{ id: 'f1', text: 'Llamar a Marta', kind: 'acción', due: '2026-10-10', status: 'curso', created: '2026-10-07', src: { w: 1, o: 2, label: 'x' }, log: [{ d: '2026-10-08', t: 'Escrito' }] }] })));
  await p.goto(URL0); await p.waitForSelector('#new');
  let d = await D();
  ok(d.v === 2 && d.entries.length === 3 && d.legacy && d.legacy.v === 1, 'migrated to 3 entries, legacy kept');
  const ses = d.entries.find((e) => e.title === 'Sesión gratitud');
  ok(ses && ses.date === '2026-10-07' && ses.questions[0].a === 'Mi familia' && ses.items[0].id === 'v1' && ses.items[0].watched && ses.note.includes('Llamar a Marta') && ses.note.includes('Escrito'), 'session → entry with video, Q&A, follow-up');
  ok(d.entries.some((e) => e.title.startsWith('Semana 1 — Abrirse') && e.note.includes('Gratitud') && e.note.includes('Nota semanal')), 'week notes → entry');
  ok(d.entries.some((e) => e.date === '2026-10-20' && e.questions[0].a === 'R vídeo'), 'general video → dated entry');
  // ---- nueva entrada ----
  await p.click('#new'); await p.fill('#nd', '2026-10-28'); await p.fill('#nt', 'Clase en directo: merecimiento'); await p.click('[data-ty="directo"]'); await p.click('#ok');
  await p.waitForSelector('#note');
  await p.fill('#note', 'Muy buena clase.'); await p.click('.card:has(#note) [data-a="mic"]'); await p.waitForTimeout(200); await p.click('.card:has(#note) [data-a="mic"]'); await p.waitForTimeout(600);
  d = await D(); let e = d.entries.find((x) => x.title.startsWith('Clase'));
  ok(e.type === 'directo' && e.date === '2026-10-28' && e.note.endsWith('Esto lo he dictado'), 'entry created + comment dictation autosaved');
  await p.click('#addq'); await p.fill('#qt', '¿Qué me impide recibir?'); await p.click('#ok');
  await p.fill('[data-a="ans"]', 'El miedo.'); await p.waitForTimeout(600);
  await p.click('#addv'); await p.click('[data-k="url"]'); await p.fill('#vu', 'https://youtu.be/dQw4w9WgXcQ'); await p.fill('#vt', 'Grabación de la clase'); await p.click('#ok');
  await p.waitForSelector('.item .player iframe');
  await p.click('#addd'); await p.setInputFiles('#vf', [{ name: 'Guia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') }, { name: 'foto.png', mimeType: 'image/png', buffer: require('fs').readFileSync(__dirname + '/../icons/icon-192.png') }]);
  await p.click('#ok'); await p.waitForSelector('.pv img');
  await p.click('#addd'); await p.click('[data-k="url"]'); await p.fill('#vu', 'docs.google.com/document/d/abc'); await p.fill('#vt', 'Documento compartido'); await p.click('#ok');
  d = await D(); e = d.entries.find((x) => x.title.startsWith('Clase'));
  ok(e.questions[0].a === 'El miedo.' && e.items.length === 4 && e.items.filter((i) => i.kind === 'doc').length === 3, 'Q&A + video + 2 files + link saved');
  ok(await p.evaluate(async (id) => new Promise((r) => { const q = indexedDB.open('pa-videos', 1); q.onsuccess = () => { const g = q.result.transaction('blobs').objectStore('blobs').get(id); g.onsuccess = () => r(!!g.result); }; }), e.items[1].id), 'file in IndexedDB pa-videos');
  await p.fill('#title', 'Clase en directo: merecimiento'); await clean(); if (OUT) await p.screenshot({ path: OUT + 'entrada.png', fullPage: true });
  await p.goto(URL0 + '#/'); await p.waitForSelector('.entry');
  ok((await p.$$eval('.entry .et', (x) => x.map((y) => y.textContent)))[0].startsWith('Clase'), 'diary newest first');
  await clean(); if (OUT) await p.screenshot({ path: OUT + 'diario.png' });
  // ---- archivos ----
  await p.goto(URL0 + '#/archivos'); await p.waitForSelector('#fl .vid');
  ok((await p.$$('#fl .vid')).length === 6, 'repository lists 6 items');
  await p.click('[data-f="doc"]'); ok((await p.$$('#fl .vid')).length === 3, 'filter documentos');
  await p.fill('#fq', 'guia'); ok((await p.$$('#fl .vid')).length === 1, 'search in repository');
  await p.fill('#fq', ''); await p.click('[data-f="all"]'); await clean(); if (OUT) await p.screenshot({ path: OUT + 'archivos.png' });
  await p.click('#fl .vid:has-text("Guia")'); await p.waitForSelector('.item.flash'); ok(true, 'repository links to entry');
  // ---- buscar ----
  await p.goto(URL0 + '#/buscar'); await p.fill('#s', 'marta'); ok((await p.$$('#res .hit')).length === 1, 'search finds migrated follow-up');
  await p.fill('#s', 'miedo'); ok((await p.$$('#res .hit')).length === 1, 'search finds answer');
  // ---- compartir (share target) ----
  await p.goto(URL0); await p.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()) && !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) { await p.reload(); await p.waitForTimeout(500); }
  await p.evaluate(async () => { const fd = new FormData(); fd.append('title', ''); fd.append('text', 'Mensaje del grupo: mañana directo a las 19h'); fd.append('files', new File(['hola'], 'audio-whatsapp.opus', { type: 'audio/ogg' })); const r = await fetch('share', { method: 'POST', body: fd }); return r.url; });
  await p.goto(URL0 + '#/compartido'); await p.waitForSelector('#snew');
  await p.click('#sadd'); await p.waitForSelector('#note');
  d = await D(); e = d.entries.find((x) => x.title.startsWith('Clase'));
  ok(e.note.includes('mañana directo') && e.items.some((i) => i.name === 'audio-whatsapp.opus'), 'share target POST → existing entry');
  await p.waitForSelector('.pv audio'); ok(true, 'shared audio playable');
  // ---- ajustes / copias ----
  await p.goto(URL0 + '#/ajustes');
  const [dz] = await Promise.all([p.waitForEvent('download'), p.click('#ez')]); const zp = await dz.path();
  const zbuf = require('fs').readFileSync(zp); ok(zbuf.includes(Buffer.from('datos.json')) && zbuf.includes(Buffer.from('Guia.pdf')), 'zip export with files');
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#ej')]); const json = require('fs').readFileSync(await dj.path(), 'utf8'); ok(JSON.parse(json).data.entries.length === 4, 'json export');
  const [dm] = await Promise.all([p.waitForEvent('download'), p.click('#em')]); ok(require('fs').readFileSync(await dm.path(), 'utf8').includes('El miedo.'), 'markdown export');
  await p.click('#rs'); await p.waitForSelector('#new'); ok((await D()).entries.length === 0, 'reset');
  await p.goto(URL0 + '#/ajustes'); await p.setInputFiles('#if', { name: 'copia.zip', mimeType: 'application/zip', buffer: zbuf }); await p.waitForTimeout(800);
  ok((await D()).entries.length === 4, 'zip import entries');
  await p.goto(URL0 + '#/archivos'); await p.click('#fl .vid:has-text("foto")'); await p.waitForSelector('.pv img'); ok(true, 'zip import restores files');
  await p.goto(URL0 + '#/ajustes');
  const keys = await p.evaluate(() => Object.keys(localStorage)); ok(keys.every((k) => k.startsWith('pa-')), 'storage keys namespaced: ' + keys);
  await p.click('#lk'); await p.fill('#mtl-p1', '1234'); await p.click('[data-a="next"]'); await p.fill('#mtl-p2', '1234'); await p.click('[data-a="next"]');
  await p.waitForTimeout(1500); ok(await p.evaluate(() => !!localStorage.getItem('pa-lock-config')), 'lock pa-lock-config');
  await p.reload(); await p.waitForSelector('#pa-lock-screen'); await p.fill('#mtl-pin', '1234'); await p.click('[data-a="ok"]');
  await p.waitForSelector('h1'); ok(!(await p.$('#pa-lock-screen')), 'unlock with PIN');
  ok(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 'service worker registered');
  console.log(errs.length ? errs.join('\n') : 'NO PAGE ERRORS'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
