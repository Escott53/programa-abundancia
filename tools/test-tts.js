// Prueba de «Escuchar»: simula speechSynthesis y comprueba troceo, lectura de entrada y de documentos.
const { chromium } = require('playwright-core');
const URL0 = process.env.URL0 || 'http://127.0.0.1:8766/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => {
    window.__said = [];
    const S = { speaking: false, getVoices: () => [{ lang: 'es-ES', name: 'es', localService: true }], addEventListener() {}, cancel() { S._u = null; },
      speak(u) { S._u = u; window.__said.push(u.text + '|' + u.lang + '|' + u.rate); setTimeout(() => { if (S._u === u) u.onend && u.onend(); }, window.__delay || 5); }, pause() {}, resume() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: S }); window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await p.goto(URL0 + 'manifest.json'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pa-data', JSON.stringify({ v: 2, entries: [{ id: 'e1', date: '2026-10-28', title: 'Clase uno', type: 'directo', note: 'Nota larga. ' + 'Esto es una frase de prueba bastante larga para trocear. '.repeat(20), questions: [{ id: 'q1', q: '¿Qué agradeces?', a: 'Mi familia' }], items: [], created: 1 }] })); });
  await p.goto(URL0 + '#/e/e1'); await p.waitForSelector('[data-a="sayall"]');
  const chunks = await p.evaluate(() => PATTS.chunk('Hola. ' + 'palabra '.repeat(200)));
  ok(chunks.length > 5 && chunks.every((c) => c.length <= 201), 'chunks ≤200 chars (' + chunks.length + ')');
  // documento de texto
  await p.click('#addd'); await p.setInputFiles('#vf', { name: 'apuntes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Título\n\nContenido **del** documento.') }); await p.click('#ok');
  await p.waitForSelector('[data-a="sayit"]');
  await p.click('[data-a="sayall"]'); await p.waitForTimeout(1500);
  let said = await p.evaluate(() => window.__said.join('\n'));
  ok(said.includes('Clase uno') && said.includes('Mi familia') && said.includes('Contenido del documento') && said.includes('|es-ES|1'), 'whole entry read incl. Q&A and .md doc');
  await p.evaluate(() => { window.__said = []; window.__delay = 2000; });
  await p.click('[data-a="sayit"]'); await p.waitForSelector('#tts-bar:not([hidden])'); await p.screenshot({ path: '/tmp/tts.png' });
  ok(await p.isVisible('#tts-bar'), 'player bar shown'); await p.waitForTimeout(80); await p.click('[data-t="rate"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => localStorage.getItem('pa-tts-rate') === '1.25'), 'rate persisted pa-tts-rate');
  await p.click('[data-a="saynote"]'); await p.waitForTimeout(30); await p.click('[data-t="pp"]');
  ok(await p.evaluate(() => document.querySelector('[data-t="pp"]').textContent === '▶️'), 'pause');
  await p.goto(URL0 + '#/'); await p.waitForTimeout(100);
  ok(await p.isHidden('#tts-bar'), 'stops on navigation');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await b.close();
})();
