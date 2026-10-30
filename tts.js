/* Programa de Abundancia — Escuchar lo escrito (Web Speech API, speechSynthesis).
   Trocea el texto en frases (~200 caracteres) para que Chrome en Android no corte las lecturas largas.
   Extrae texto de documentos: texto, Markdown, HTML, JSON/CSV, PDF (pdf.js) y Word .docx (mammoth.js), cargados bajo demanda. */
(function () {
  'use strict';
  const RATE_KEY = 'pa-tts-rate';
  const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const S = window.speechSynthesis;
  const supported = !!(S && window.SpeechSynthesisUtterance);
  let rate = parseFloat(localStorage.getItem(RATE_KEY)) || 1; if (!RATES.includes(rate)) rate = 1;
  let chunks = [], idx = 0, playing = false, paused = false, label = '', gen = 0, voice = null, keepAlive = null;

  function pickVoice() {
    if (!supported) return null;
    const vs = S.getVoices() || [];
    return vs.find((v) => /^es[-_]ES$/i.test(v.lang) && v.localService) || vs.find((v) => /^es[-_]ES$/i.test(v.lang))
      || vs.find((v) => /^es\b/i.test(v.lang)) || null;
  }
  if (supported) { voice = pickVoice(); S.addEventListener?.('voiceschanged', () => { voice = pickVoice(); }); }

  function clean(t) {
    return String(t || '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' enlace ').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/[*_`~>|#]+/g, ' ')
      .replace(/[ \t\u00a0]+/g, ' ').replace(/\n{2,}/g, '.\n').trim();
  }
  // Divide en frases y agrupa en trozos de hasta ~200 caracteres.
  function chunk(text, max = 200) {
    const out = []; const t = clean(text); if (!t) return out;
    const sents = t.split(/(?<=[.!?…;:])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    let cur = '';
    const push = (s) => { s = s.trim(); if (s && /[\p{L}\p{N}]/u.test(s)) out.push(s); };
    for (let s of sents) {
      while (s.length > max) { let k = s.lastIndexOf(',', max); if (k < max / 2) k = s.lastIndexOf(' ', max); if (k < max / 2) k = max; if (cur) { push(cur); cur = ''; } push(s.slice(0, k + 1)); s = s.slice(k + 1).trim(); }
      if ((cur + ' ' + s).length > max) { push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
    }
    push(cur); return out;
  }

  // ---------- Barra del reproductor ----------
  let bar = null;
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div'); bar.id = 'tts-bar'; bar.hidden = true; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Lectura en voz alta');
    bar.innerHTML = `<div class="tts-info"><span class="tts-t">🔊</span><span class="tts-l"></span><span class="tts-p small muted"></span></div>
      <div class="tts-ctl"><button class="btn sm" data-t="prev" aria-label="Anterior">⏮</button><button class="btn sm pri" data-t="pp" aria-label="Pausa">⏸</button><button class="btn sm" data-t="next" aria-label="Siguiente">⏭</button><button class="btn sm" data-t="rate" aria-label="Velocidad">1x</button><button class="btn sm danger" data-t="stop" aria-label="Parar">⏹</button></div>`;
    document.body.appendChild(bar);
    bar.onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; const a = b.dataset.t;
      if (a === 'pp') { if (!playing) return; paused ? resume() : pause(); } else if (a === 'stop') stop();
      else if (a === 'next') jump(idx + 1); else if (a === 'prev') jump(idx - 1);
      else if (a === 'rate') { rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; localStorage.setItem(RATE_KEY, String(rate)); if (playing && !paused) jump(idx); else ui(); } };
    return bar;
  }
  function ui() {
    const b = ensureBar(); b.hidden = !playing; document.body.classList.toggle('tts-on', playing);
    b.querySelector('.tts-l').textContent = label;
    b.querySelector('.tts-p').textContent = chunks.length ? ` ${Math.min(idx + 1, chunks.length)}/${chunks.length}` : '';
    const pp = b.querySelector('[data-t="pp"]'); pp.textContent = paused ? '▶️' : '⏸'; pp.setAttribute('aria-label', paused ? 'Continuar' : 'Pausa');
    b.querySelector('[data-t="rate"]').textContent = String(rate).replace('.', ',') + 'x';
  }

  function speakNext(g) {
    if (g !== gen || !playing) return;
    if (idx >= chunks.length) { stop(); return; }
    const u = new SpeechSynthesisUtterance(chunks[idx]);
    u.lang = voice ? voice.lang : 'es-ES'; if (voice) u.voice = voice; u.rate = rate;
    u.onend = () => { if (g !== gen || paused) return; idx++; ui(); speakNext(g); };
    u.onerror = (e) => { if (g !== gen) return; if (e.error === 'interrupted' || e.error === 'canceled') return; idx++; speakNext(g); };
    ui(); S.speak(u);
  }
  function play(text, title) {
    if (!supported) { alert('Este navegador no puede leer en voz alta. Usa Chrome en Android y revisa que esté instalado «Servicios de voz de Google».'); return false; }
    const c = Array.isArray(text) ? text.flatMap((t) => chunk(t)) : chunk(text);
    if (!c.length) { alert('No hay texto para leer.'); return false; }
    S.cancel(); gen++; chunks = c; idx = 0; playing = true; paused = false; label = title || 'Leyendo';
    if (!voice) voice = pickVoice();
    const g = gen; setTimeout(() => speakNext(g), 60); ui(); return true;
  }
  function jump(i) { if (!playing) return; i = Math.max(0, Math.min(i, chunks.length - 1)); gen++; S.cancel(); idx = i; paused = false; const g = gen; setTimeout(() => speakNext(g), 60); ui(); }
  // Pausa robusta: en Android pause()/resume() fallan a menudo, así que cancelamos y al continuar repetimos el trozo actual.
  function pause() { if (!playing) return; paused = true; gen++; S.cancel(); ui(); }
  function resume() { if (!playing) return; paused = false; const g = gen; speakNext(g); }
  function stop() { gen++; playing = false; paused = false; chunks = []; idx = 0; clearInterval(keepAlive); if (supported) S.cancel(); if (bar) ui(); }

  // ---------- Extraer texto de documentos ----------
  const loaded = {};
  const script = (src) => (loaded[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('red')); }; document.head.appendChild(s); }));
  function kindOf(name, mime) {
    const n = String(name || '').toLowerCase(), m = String(mime || '').toLowerCase();
    if (/pdf/.test(m) || /\.pdf$/.test(n)) return 'pdf';
    if (/officedocument\.wordprocessingml/.test(m) || /\.docx$/.test(n)) return 'docx';
    if (/html/.test(m) || /\.html?$/.test(n)) return 'html';
    if (/^text\/|json|xml|markdown|csv/.test(m) || /\.(txt|md|markdown|csv|json|xml|srt|vtt|log|rtf)$/.test(n)) return /\.rtf$/.test(n) || /rtf/.test(m) ? 'rtf' : 'text';
    if (/msword/.test(m) || /\.doc$/.test(n)) return 'doc';
    return null;
  }
  const canRead = (name, mime) => { const k = kindOf(name, mime); return !!k && k !== 'doc'; };
  async function extract(blob, name, mime) {
    const k = kindOf(name, mime || blob.type);
    if (k === 'text') return (await blob.text()).replace(/^\d+\s*$|^\d\d:\d\d[:\d.,]* --> .*$/gm, '');
    if (k === 'rtf') return (await blob.text()).replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '');
    if (k === 'html') { const d = new DOMParser().parseFromString(await blob.text(), 'text/html'); d.querySelectorAll('script,style').forEach((x) => x.remove()); return d.body ? d.body.innerText || d.body.textContent : ''; }
    if (k === 'pdf') {
      await script('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; let out = '';
      for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); out += c.items.map((x) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n\n'; }
      if (!out.trim()) throw new Error('El PDF no tiene texto (parece una imagen escaneada).');
      return out;
    }
    if (k === 'docx') { await script('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js'); return (await window.mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() })).value; }
    if (k === 'doc') throw new Error('Los Word antiguos (.doc) no se pueden leer en voz alta. Guárdalo como .docx o PDF.');
    throw new Error('Este tipo de archivo no se puede leer en voz alta (solo texto, Markdown, HTML, PDF y Word .docx).');
  }

  window.PATTS = { supported, play, pause, resume, stop, chunk, extract, canRead, kindOf, isPlaying: () => playing, get rate() { return rate; } };
  window.addEventListener('pagehide', stop);
})();
