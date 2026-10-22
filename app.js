/* Programa de Abundancia — programa semanal. Datos solo en este dispositivo.
   localStorage con claves 'pa-' y vídeos subidos en IndexedDB 'pa-videos' (todas las apps comparten origen). */
(function () {
  'use strict';
  const K = { data: 'pa-data', set: 'pa-settings', key: 'pa-openai-key' };
  const DB = 'pa-videos';
  const WD = [1, 2, 3, 4, 5, 6, 0], WDL = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
  const QUOTES = ['«La abundancia no es algo que adquirimos, es algo con lo que sintonizamos.» — Wayne Dyer',
    '«Agradece lo que tienes y acabarás teniendo más.» — Oprah Winfrey',
    '«La riqueza consiste mucho más en el disfrute que en la posesión.» — Aristóteles',
    '«Siembra un hábito y cosecharás un carácter.» — Proverbio',
    '«No es rico quien más tiene, sino quien menos necesita.» — San Agustín',
    '«Lo que piensas, lo creas; lo que sientes, lo atraes.» — Buda (atribuido)'];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const isoToday = () => isoOf(new Date());
  const mb = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';

  let data = load(K.data, null);
  const settings = Object.assign({ big: false, transcribeModel: 'gpt-4o-mini-transcribe', chatModel: 'gpt-5-mini' }, load(K.set, {}));
  const saveData = () => { data.updated = Date.now(); localStorage.setItem(K.data, JSON.stringify(data)); };
  const saveSet = () => localStorage.setItem(K.set, JSON.stringify(settings));
  const apiKey = () => localStorage.getItem(K.key) || '';
  const fix = () => { if (!data) return; data.weeks ||= 17; data.pattern ||= [1, 2, 3, 4, 5]; data.w ||= {}; data.videos ||= []; data.follow ||= []; };
  fix();

  // ---------- Modelo ----------
  const T = () => data.weeks;
  const weekObj = (n) => (data.w[n] ||= { title: '', theme: '', note: '', days: null, s: {} });
  const peekW = (n) => data.w[n] || { title: '', theme: '', note: '', days: null, s: {} };
  const blankE = () => ({ title: '', questions: [], note: '', done: false, transcript: '' });
  const sesObj = (n, o) => { const w = weekObj(n); return (w.s[o] ||= blankE()); };
  const peekS = (n, o) => peekW(n).s[o] || blankE();
  const startDate = () => { const [y, m, d] = data.start.split('-').map(Number); return new Date(y, m - 1, d); };
  const dateOf = (n, o = 0) => { const s = startDate(); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + (n - 1) * 7 + o); };
  const fmtDate = (dt) => dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = (dt) => dt.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const dayIdx = () => Math.round((new Date(new Date().toDateString()) - startDate()) / 864e5);
  const todayW = () => Math.floor(dayIdx() / 7) + 1;
  const curW = () => Math.min(T(), Math.max(1, todayW()));
  const activeDays = (n) => peekW(n).days || data.pattern;
  const sessions = (n) => { const set = activeDays(n), out = []; for (let o = 0; o < 7; o++) if (set.includes(dateOf(n, o).getDay())) out.push(o); return out; };
  const allSessions = (n) => [...new Set([...sessions(n), ...Object.keys(peekW(n).s).map(Number).filter((o) => { const e = peekW(n).s[o]; return e.done || hasContent(e); })])].sort((a, b) => a - b);
  const hasContent = (e) => !!((e.note || '').trim() || e.questions.some((q) => (q.a || '').trim()));
  const status = (e) => (e.done ? 'completed' : hasContent(e) ? 'answered' : 'pending');
  const ST = { pending: 'Pendiente', answered: 'Con notas', completed: 'Hecha' };
  const weekStats = (n) => { const ss = sessions(n); return { total: ss.length, done: ss.filter((o) => peekS(n, o).done).length }; };
  const FS = { pendiente: 'Pendiente', curso: 'En curso', hecho: 'Hecho' };
  const overdue = (f) => f.status !== 'hecho' && f.due && f.due < isoToday();
  const sesLabel = (n, o) => `Semana ${n} · ${fmtShort(dateOf(n, o))}`;

  function toast(msg, ms = 2600) {
    const r = $('#toast-root'); r.innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => (r.innerHTML = ''), ms);
  }
  function sheet(html) {
    const r = $('#sheet-root'); r.innerHTML = `<div class="sheet-bg"><div class="sheet">${html}</div></div>`;
    const bg = r.firstChild; bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
    return bg.firstChild;
  }
  const closeSheet = () => { stopDictation(); $('#sheet-root').innerHTML = ''; };

  // ---------- IndexedDB (vídeos del móvil) ----------
  let dbp = null;
  const db = () => (dbp ||= new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const idb = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('blobs', mode); const r = fn(tx.objectStore('blobs')); tx.oncomplete = () => res(r && r.result); tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB')); }); };
  const putBlob = (id, b) => idb('readwrite', (s) => s.put(b, id));
  const getBlob = (id) => idb('readonly', (s) => s.get(id));
  const delBlob = (id) => idb('readwrite', (s) => s.delete(id));
  const clearBlobs = () => idb('readwrite', (s) => s.clear());
  async function persist() { try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); return true; } catch (_) { return false; } }
  async function estimate() { try { return await navigator.storage.estimate(); } catch (_) { return null; } }

  // ---------- Router ----------
  const tabs = [['#/', '🌱', 'Inicio', ['']], ['#/semanas', '📅', 'Semanas', ['semanas', 'semana', 'sesion', 'releer']], ['#/videos', '🎬', 'Vídeos', ['videos', 'video']], ['#/seguimiento', '📌', 'Seguimiento', ['seguimiento']], ['#/ajustes', '⚙️', 'Ajustes', ['ajustes']]];
  let objURL = null, objURLs = [];
  function route() {
    stopDictation(); closeSheet(); const A = $('#app'); A.oninput = A.onchange = A.onclick = null;
    if (objURL) { URL.revokeObjectURL(objURL); objURL = null; }
    objURLs.forEach((u) => URL.revokeObjectURL(u)); objURLs = [];
    document.body.classList.toggle('big', !!settings.big);
    const h = location.hash || '#/'; const [, name = '', a1, a2] = h.split('/');
    if (!data) return viewSetup();
    $('#tabs').innerHTML = tabs.map(([href, i, t, names]) => `<a href="${href}" class="${names.includes(name) ? 'act' : ''}"><span>${i}</span>${t}</a>`).join('');
    window.scrollTo(0, 0);
    if (name === 'semana') return viewWeek(clampW(a1));
    if (name === 'sesion') return viewSession(clampW(a1), Math.min(6, Math.max(0, parseInt(a2, 10) || 0)));
    if (name === 'releer') return viewRead(clampW(a1));
    if (name === 'semanas') return viewWeeks();
    if (name === 'videos') return viewVideos();
    if (name === 'video') return viewVideo(a1);
    if (name === 'seguimiento') return viewFollow();
    if (name === 'buscar') return viewSearch();
    if (name === 'ajustes') return viewSettings();
    return viewHome();
  }
  const clampW = (a) => Math.min(T(), Math.max(1, parseInt(a, 10) || curW()));

  // ---------- Vistas ----------
  function viewSetup() {
    $('#tabs').innerHTML = '';
    $('#app').innerHTML = `<div class="card hero"><div style="font-size:54px">🌱</div><h1>Programa de Abundancia</h1>
      <p class="muted">Tu cuaderno del programa semanal: sesiones, vídeos, notas y seguimiento de tus compromisos.</p></div>
      <div class="card"><label class="f" for="st">¿Qué día empieza (o empezó) la semana 1?</label>
      <input type="date" id="st" value="${isoToday()}">
      <label class="f" for="nw">Número de semanas</label><input type="text" inputmode="numeric" id="nw" value="17">
      <p class="small muted">Podrás cambiarlo después en Ajustes, igual que los días con actividad.</p>
      <button class="btn pri block" id="go">Comenzar</button></div>`;
    $('#go').onclick = () => { data = { v: 1, start: $('#st').value || isoToday(), weeks: Math.min(104, Math.max(1, parseInt($('#nw').value, 10) || 17)), pattern: [1, 2, 3, 4, 5], w: {}, videos: [], follow: [] }; saveData(); location.hash = '#/'; route(); };
  }

  function viewHome() {
    const t = todayW(), n = curW(), before = dayIdx() < 0, after = t > T();
    let tot = 0, done = 0; for (let i = 1; i <= T(); i++) { const s = weekStats(i); tot += s.total; done += s.done; }
    const pct = tot ? Math.round((done / tot) * 100) : 0;
    const w = peekW(n), ws = weekStats(n);
    const todayO = dayIdx() - (n - 1) * 7, isToday = !before && !after && sessions(n).includes(todayO);
    const next = sessions(n).find((o) => o > todayO);
    const pend = data.follow.filter((f) => f.status !== 'hecho'), over = pend.filter(overdue);
    const vids = data.videos.filter((v) => v.week === n);
    const te = isToday ? peekS(n, todayO) : null;
    $('#app').innerHTML = `<div class="card hero">
      <div class="muted small">${esc(fmtDate(new Date()))}</div>
      <div class="num">${before ? 'Empieza en ' + -dayIdx() + (dayIdx() === -1 ? ' día' : ' días') : after ? 'Programa terminado' : `Semana ${n} de ${T()}`}</div>
      ${w.title ? `<div style="font-family:var(--serif);margin-top:6px">${esc(w.title)}</div>` : ''}
      <div class="bar"><i style="width:${pct}%"></i></div><div class="small muted">${done} de ${tot} sesiones hechas · ${pct}%</div>
      <div class="quote">${esc(QUOTES[n % QUOTES.length])}</div></div>
      ${isToday ? `<a class="card fu today-task" href="#/sesion/${n}/${todayO}"><div class="row"><b class="grow">✨ Hoy toca sesión</b><span class="pill ${status(te)}">${ST[status(te)]}</span></div><div class="small muted">${esc(te.title || fmtDate(new Date()))}${te.questions.length ? ' · ' + te.questions.length + ' preguntas' : ''}</div></a>`
        : `<div class="card small muted">Hoy no hay sesión.${next !== undefined ? ' Próxima: ' + esc(fmtDate(dateOf(n, next))) + '.' : ''}</div>`}
      <a class="card fu" href="#/semana/${n}"><div class="row"><h3 class="grow" style="margin:0">Esta semana${w.theme ? ': ' + esc(w.theme) : ''}</h3><span class="pill ${ws.total && ws.done === ws.total ? 'completed' : ''}">${ws.done}/${ws.total}</span></div>
        <div class="small muted">${esc(fmtShort(dateOf(n)))} – ${esc(fmtShort(dateOf(n, 6)))} · ${vids.length} vídeo${vids.length === 1 ? '' : 's'}</div></a>
      <a class="card stats fu" href="#/seguimiento" id="fustats"><div><b>${pend.length}</b><span class="small muted">seguimientos pendientes</span></div><div><b style="${over.length ? 'color:var(--danger)' : ''}">${over.length}</b><span class="small muted">vencidos</span></div><div><b>${data.videos.filter((v) => !v.watched).length}</b><span class="small muted">vídeos sin ver</span></div></a>
      <div class="row"><a class="btn grow" href="#/releer/${n}">📖 Releer</a><a class="btn grow" href="#/buscar">🔎 Buscar</a></div>`;
  }

  function viewWeeks() {
    const n = curW();
    $('#app').innerHTML = `<h1>Las ${T()} semanas</h1><div class="card weekgrid" style="padding:4px">${Array.from({ length: T() }, (_, i) => i + 1).map((i) => {
      const w = peekW(i), s = weekStats(i), c = s.total && s.done === s.total ? 'completed' : s.done ? 'answered' : 'pending';
      return `<a href="#/semana/${i}" id="w${i}" class="${i === n ? 'today' : ''}"><span class="dn">Sem. ${i}</span><span class="dt">${esc(w.title || w.theme || fmtShort(dateOf(i)))}</span><span class="pill ${c}">${s.done}/${s.total}</span></a>`;
    }).join('')}</div>`;
    const el = $('#w' + n); if (el) el.scrollIntoView({ block: 'center' });
  }

  function viewWeek(n) {
    const w = weekObj(n), ss = allSessions(n), vids = data.videos.filter((v) => v.week === n), fus = data.follow.filter((f) => f.src?.w === n);
    const set = activeDays(n);
    $('#app').innerHTML = `<div class="top"><a class="btn sm ghost" href="#/semanas" aria-label="Volver">‹</a><h1>Semana ${n}</h1>
        <a class="btn sm ghost" href="#/semana/${n - 1}" ${n <= 1 ? 'hidden' : ''} aria-label="Anterior">◀</a><a class="btn sm ghost" href="#/semana/${n + 1}" ${n >= T() ? 'hidden' : ''} aria-label="Siguiente">▶</a></div>
      <div class="muted small" style="margin-bottom:8px">${esc(fmtDate(dateOf(n)))} – ${esc(fmtDate(dateOf(n, 6)))}</div>
      <input type="text" id="title" placeholder="Título de la semana" value="${esc(w.title)}" style="font-family:var(--serif);font-size:1.1em">
      <input type="text" id="theme" placeholder="Tema (p. ej. gratitud, merecimiento…)" value="${esc(w.theme)}" style="margin-top:8px">
      <h2 style="margin-top:16px">Sesiones</h2>
      <div class="card weekgrid" style="padding:4px">${ss.map((o) => { const e = peekS(n, o), s = status(e); const tod = dayIdx() === (n - 1) * 7 + o;
        return `<a href="#/sesion/${n}/${o}" class="${tod ? 'today' : ''}"><span class="dn">${esc(fmtShort(dateOf(n, o)).split(',')[0])} ${dateOf(n, o).getDate()}</span><span class="dt">${esc(e.title || (tod ? 'Hoy' : ''))}${e.questions.length ? ` <span class="muted small">· ${e.questions.length} preg.</span>` : ''}</span><span class="pill ${s}">${ST[s]}</span></a>`; }).join('') || '<p class="muted" style="padding:12px">Esta semana no tiene días con actividad.</p>'}</div>
      <details class="card"><summary>🗓️ Días con actividad ${w.days ? '(personalizado)' : '(patrón general)'}</summary>
        <div class="days7" style="margin-top:10px">${WD.map((d) => `<label><input type="checkbox" data-wd="${d}" ${set.includes(d) ? 'checked' : ''}>${WDL[d]}</label>`).join('')}</div>
        ${w.days ? '<button class="btn sm block" id="resetdays" style="margin-top:8px">Usar el patrón general</button>' : ''}</details>
      <h2 style="margin-top:16px">Vídeos</h2><button class="btn block pri addvid" id="addv" style="margin-bottom:10px">🎬 Añadir vídeo</button>
      ${vids.length ? `<div class="card" style="padding:4px 12px">${vids.map(vidRow).join('')}</div>` : '<p class="muted small">Sin vídeos en esta semana.</p>'}
      <div class="card"><h3>Notas de la semana</h3><textarea id="note" placeholder="Ideas, aprendizajes, intenciones…">${esc(w.note)}</textarea>
        <div class="qtools"><button class="btn sm" data-a="mic">🎤 Dictar</button><button class="btn sm" data-a="fu">📌 Seguimiento</button><span class="saved"></span></div></div>
      ${fus.length ? `<h2>Seguimiento de la semana</h2>${fus.map(fuCard).join('')}` : ''}
      <a class="btn block ghost" style="margin-top:10px" href="#/releer/${n}">📖 Releer la semana</a>`;
    autosave((ta) => { if (ta.id === 'note') w.note = ta.value; else if (ta.id === 'title') w.title = ta.value; else if (ta.id === 'theme') w.theme = ta.value; });
    autoGrow();
    $('#app').onclick = (e) => {
      const b = e.target.closest('[data-a],[data-fu]'); if (!b) return;
      if (b.dataset.fu) return openFollow(b.dataset.fu, () => viewWeek(n));
      if (b.dataset.a === 'mic') return toggleDictation(b, $('#note'));
      if (b.dataset.a === 'fu') return newFollow({ w: n, label: `Semana ${n} · notas` }, selText($('#note')), () => viewWeek(n));
    };
    $('#app').querySelectorAll('[data-wd]').forEach((cb) => (cb.onchange = () => { w.days = [...$('#app').querySelectorAll('[data-wd]:checked')].map((x) => +x.dataset.wd); saveData(); viewWeek(n); $('details.card').open = true; }));
    if ($('#resetdays')) $('#resetdays').onclick = () => { w.days = null; saveData(); viewWeek(n); };
    $('#addv').onclick = () => addVideo(n, null, () => viewWeek(n));
  }

  let tmr;
  function autosave(apply, after) {
    const mark = (ta) => { const s = ta.closest('.card')?.querySelector('.saved'); if (s) { s.textContent = 'Guardado ✓'; clearTimeout(s._t); s._t = setTimeout(() => (s.textContent = ''), 1500); } };
    const save = (ta, now) => { apply(ta); clearTimeout(tmr); const f = () => { saveData(); after && after(); mark(ta); }; if (now) f(); else tmr = setTimeout(f, 400); };
    $('#app').oninput = (e) => { if (e.target.matches('textarea, input[type=text]')) save(e.target); };
    $('#app').onchange = (e) => { if (e.target.matches('textarea, input[type=text]')) save(e.target, true); };
  }
  const selText = (ta) => { if (!ta) return ''; const s = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim(); return s || ta.value.trim().split(/(?<=[.!?])\s/)[0].slice(0, 200); };

  // Editor genérico de preguntas + notas (sesiones y vídeos)
  function entryHtml(e, opt) {
    const qHtml = (q, i) => `<div class="card" data-id="${q.id}">
      <div class="q"><span class="n">${i + 1}.</span><span class="grow">${esc(q.q)}</span></div>
      <textarea data-a="ans" placeholder="Tu respuesta…" aria-label="Respuesta a la pregunta ${i + 1}">${esc(q.a)}</textarea>
      <div class="qtools"><span class="row"><button class="btn sm" data-a="mic">🎤 Dictar</button><button class="btn sm" data-a="fu" aria-label="Crear seguimiento">📌</button></span><span class="saved"></span>
      <span class="row"><button class="btn sm ghost" data-a="up" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button><button class="btn sm ghost" data-a="down" ${i === e.questions.length - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button><button class="btn sm ghost" data-a="edit" aria-label="Editar">✏️</button></span></div></div>`;
    return `<div id="qs">${e.questions.map(qHtml).join('') || `<div class="card muted" style="text-align:center">Aún no hay preguntas. Añádelas a mano${opt.audio ? ' o sácalas del audio/vídeo' : ''}.</div>`}</div>
      <div class="row"><button class="btn grow" id="addq">＋ Añadir pregunta</button>${opt.audio ? '<button class="btn grow" id="audio">🎧 Sacar preguntas del audio/vídeo</button>' : ''}</div>
      <input type="file" id="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4" hidden>
      <div class="card"><h3>${opt.noteTitle || 'Notas'}</h3><textarea id="note" placeholder="Lo que quieras anotar…">${esc(e.note)}</textarea>
        <div class="qtools"><span class="row"><button class="btn sm" data-a="mic">🎤 Dictar</button><button class="btn sm" data-a="fu">📌 Seguimiento</button></span><span class="saved"></span></div></div>
      ${e.transcript ? `<div class="card"><details><summary>📝 Transcripción</summary><div class="tx">${esc(e.transcript)}</div>
        <button class="btn sm ghost danger" id="deltx" style="margin-top:8px">Borrar transcripción</button></details></div>` : ''}`;
  }
  function entryBind(e, opt) {
    autosave((ta) => {
      if (ta.id === 'note') e.note = ta.value; else if (ta.id === 'title') e.title = ta.value;
      else if (ta.dataset.vf) { const v = data.videos.find((x) => x.id === ta.closest('[data-vid]').dataset.vid); if (v) v[ta.dataset.vf] = ta.value; }
      else { const c = ta.closest('[data-id]'); const q = c && e.questions.find((x) => x.id === c.dataset.id); if (q) q.a = ta.value; }
    }, opt.after);
    autoGrow();
    $('#app').onclick = (ev) => {
      const b = ev.target.closest('[data-a],[data-fu]'); if (!b || b.tagName === 'TEXTAREA') return;
      if (b.dataset.fu) return openFollow(b.dataset.fu, opt.rerender);
      const card = b.closest('[data-id]'); const idx = card ? e.questions.findIndex((x) => x.id === card.dataset.id) : -1;
      const a = b.dataset.a, ta = b.closest('.card')?.querySelector('textarea');
      if (a === 'mic') return toggleDictation(b, ta);
      if (a === 'fu') return newFollow({ ...opt.src, label: opt.src.label + (idx >= 0 ? ' · pregunta ' + (idx + 1) : ' · notas') }, selText(ta), opt.rerender);
      if (a === 'up' || a === 'down') { const j = idx + (a === 'up' ? -1 : 1); [e.questions[idx], e.questions[j]] = [e.questions[j], e.questions[idx]]; saveData(); opt.rerender(); }
      if (a === 'edit') editQuestion(e, e.questions[idx], opt.rerender);
      if (opt.click) opt.click(b);
    };
    $('#addq').onclick = () => editQuestion(e, null, opt.rerender);
    if ($('#audio')) $('#audio').onclick = () => { if (!apiKey()) { toast('Primero pega tu clave de OpenAI en Ajustes'); return; } $('#file').click(); };
    $('#file').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) audioFlow(e, f, opt.rerender); };
    if ($('#deltx')) $('#deltx').onclick = () => { if (confirm('¿Borrar la transcripción?')) { e.transcript = ''; saveData(); opt.rerender(); } };
  }

  function viewSession(n, o) {
    const e = sesObj(n, o), fus = data.follow.filter((f) => f.src?.w === n && f.src?.o === o);
    const rer = () => viewSession(n, o);
    const sv = data.videos.filter((v) => v.week === n && v.o === o);
    $('#app').innerHTML = `<div class="top"><a class="btn sm ghost" href="#/semana/${n}" aria-label="Volver">‹</a><h1>Semana ${n}</h1></div>
      <div class="muted small" style="margin-bottom:8px">${esc(fmtDate(dateOf(n, o)))} · <span class="pill ${status(e)}" id="stp">${ST[status(e)]}</span></div>
      <input type="text" id="title" placeholder="Título de la sesión (opcional)" value="${esc(e.title)}" style="font-family:var(--serif);font-size:1.1em">
      <button class="btn block pri addvid" id="addvs" style="margin:12px 0">🎬 Añadir vídeo</button>
      ${sv.length ? `<div id="svids">${sv.map(vidInline).join('')}</div>` : ''}
      ${entryHtml(e, { noteTitle: 'Notas de la sesión' })}
      ${fus.length ? `<h2>Seguimiento</h2>${fus.map(fuCard).join('')}` : ''}
      <button class="btn block ${e.done ? '' : 'pri'}" id="done">${e.done ? '✓ Sesión hecha · desmarcar' : '✓ Marcar sesión como hecha'}</button>`;
    entryBind(e, { src: { w: n, o, label: sesLabel(n, o) }, rerender: rer, after: () => { const s = status(e), p = $('#stp'); if (p) { p.className = 'pill ' + s; p.textContent = ST[s]; } },
      click: (b) => { const v = data.videos.find((x) => x.id === b.closest('[data-vid]')?.dataset.vid); if (v && b.dataset.a === 'vwt') { v.watched = !v.watched; saveData(); rer(); } } });
    $('#addvs').onclick = () => addVideo(n, o, rer);
    loadInline(sv);
    $('#done').onclick = () => { e.done = !e.done; saveData(); if (e.done) toast('Sesión hecha. ¡Bien! 🌱'); rer(); };
  }
  function autoGrow() { document.querySelectorAll('#app textarea').forEach((t) => { const f = () => { t.style.height = 'auto'; t.style.height = Math.max(120, t.scrollHeight + 4) + 'px'; }; t.addEventListener('input', f); f(); }); }

  function editQuestion(e, q, rer) {
    const el = sheet(`<h2>${q ? 'Editar pregunta' : 'Nueva pregunta'}</h2>
      <textarea id="qt" style="min-height:110px" placeholder="Escribe la pregunta…">${esc(q ? q.q : '')}</textarea>
      <div class="row" style="margin-top:12px">${q ? '<button class="btn danger" id="del">🗑 Borrar</button>' : ''}<span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Guardar</button></div>`);
    $('#qt', el).focus();
    $('#cn', el).onclick = closeSheet;
    $('#ok', el).onclick = () => { const v = $('#qt', el).value.trim(); if (!v) return toast('Escribe la pregunta'); if (q) q.q = v; else e.questions.push({ id: uid(), q: v, a: '' }); saveData(); closeSheet(); rer(); };
    if (q) $('#del', el).onclick = () => { if (!confirm((q.a || '').trim() ? 'Esta pregunta tiene respuesta. ¿Borrarla igualmente?' : '¿Borrar esta pregunta?')) return; e.questions = e.questions.filter((x) => x !== q); saveData(); closeSheet(); rer(); };
  }

  // ---------- Vídeos ----------
  function parseUrl(u) {
    let m;
    if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/))) return { type: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1` };
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { type: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}` };
    if ((m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/))) return { type: 'drive', embed: `https://drive.google.com/file/d/${m[1]}/preview` };
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u)) return { type: 'direct' };
    return { type: 'link' };
  }
  const vIcon = (v) => (v.kind === 'file' ? '📱' : { youtube: '▶️', vimeo: '🎞️', drive: '📁', direct: '🎬', link: '🔗' }[parseUrl(v.url).type]);
  const vidRow = (v) => `<a class="vid" href="#/video/${v.id}" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="ic">${vIcon(v)}</span><span class="grow"><b>${esc(v.title || 'Vídeo sin título')}</b><br><span class="small muted">${v.week ? 'Semana ' + v.week : 'General'}${v.kind === 'file' ? ' · ' + mb(v.size) : ''}${v.questions?.length ? ' · ' + v.questions.length + ' preg.' : ''}</span></span><span class="pill ${v.watched ? 'completed' : ''}">${v.watched ? 'Visto' : 'Sin ver'}</span></a>`;

  function playerOf(v, plId) {
    const p = v.kind === 'url' ? parseUrl(v.url) : { type: 'file' };
    return p.embed ? `<div class="player"><iframe src="${esc(p.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(v.title)}"></iframe></div>`
      : p.type === 'direct' ? `<div class="player"><video controls playsinline preload="metadata" src="${esc(v.url)}"></video></div>`
      : p.type === 'file' ? `<div class="player" id="${plId}"><p class="muted" style="padding:20px">Cargando vídeo…</p></div>`
      : `<a class="btn sm block" href="${esc(v.url)}" target="_blank" rel="noopener">↗️ Abrir enlace</a>`;
  }
  const vidInline = (v) => `<div class="card vinl" data-vid="${v.id}">${playerOf(v, 'pl-' + v.id)}
      <input type="text" data-vf="title" placeholder="Título del vídeo" value="${esc(v.title)}" style="margin-top:8px">
      <textarea data-vf="note" placeholder="Notas del vídeo…" style="margin-top:8px">${esc(v.note || '')}</textarea>
      <div class="qtools"><button class="btn sm ${v.watched ? '' : 'pri'}" data-a="vwt">${v.watched ? '✓ Visto' : 'Marcar visto'}</button><a class="btn sm ghost" href="#/video/${v.id}">Abrir ›</a><span class="saved"></span></div></div>`;
  function loadInline(list) {
    const h = location.hash;
    list.filter((v) => v.kind === 'file').forEach((v) => getBlob(v.id).then((b) => {
      const pl = document.getElementById('pl-' + v.id); if (!pl || location.hash !== h) return;
      if (!b) { pl.innerHTML = '<p class="muted" style="padding:20px">El archivo no está en este móvil.</p>'; return; }
      const u = URL.createObjectURL(b); objURLs.push(u); pl.innerHTML = `<video controls playsinline preload="metadata" src="${u}"></video>`;
    }).catch(() => {}));
  }

  function viewVideos() {
    let f = viewVideos.f || 'all';
    const draw = () => {
      const list = data.videos.filter((v) => f === 'all' || (f === 'unseen' ? !v.watched : f === 'g' ? !v.week : String(v.week) === f)).sort((a, b) => (a.week || 999) - (b.week || 999) || a.added - b.added);
      $('#vl').innerHTML = list.length ? `<div class="card" style="padding:4px 12px">${list.map(vidRow).join('')}</div>` : '<p class="muted">No hay vídeos aquí todavía.</p>';
    };
    const weeks = [...new Set(data.videos.map((v) => v.week).filter(Boolean))].sort((a, b) => a - b);
    $('#app').innerHTML = `<div class="row"><h1 class="grow" style="margin:0">Vídeos</h1><button class="btn sm pri" id="addv">＋ Añadir</button></div>
      <div class="filters">${[['all', 'Todos'], ['unseen', 'Sin ver'], ['g', 'Generales'], ...weeks.map((w) => [String(w), 'Sem. ' + w])].map(([k, t]) => `<button class="btn sm ${k === f ? 'pri' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
      <div id="vl"></div><p class="small muted" id="stor"></p>`;
    $('.filters').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; viewVideos.f = f = b.dataset.f; viewVideos(); };
    $('#addv').onclick = () => addVideo(curW());
    draw(); storageLine($('#stor'));
  }
  async function storageLine(el) {
    const e = await estimate(); if (!e || !el) return;
    let p = false; try { p = await navigator.storage.persisted(); } catch (_) {}
    el.textContent = `Espacio usado en el móvil: ${mb(e.usage || 0)} de ${mb(e.quota || 0)} disponibles${p ? ' · almacenamiento persistente ✓' : ''}.`;
  }

  function addVideo(week, ses, done) {
    const el = sheet(`<h2>🎬 Añadir vídeo</h2>${ses != null ? `<p class="small muted">Se añade a esta sesión (${esc(sesLabel(week, ses))}).</p>` : ''}
      <div class="filters"><button class="btn sm pri" data-k="url">🔗 Enlace</button><button class="btn sm" data-k="file">📱 Archivo del móvil</button></div>
      <div id="kurl"><label class="f" for="vu">Enlace (YouTube, Vimeo, Drive o cualquier web)</label><input type="text" id="vu" inputmode="url" placeholder="https://…"></div>
      <div id="kfile" hidden><input type="file" id="vf" accept="video/*,audio/*"><p class="small muted" id="vfi">El vídeo se guarda solo en este móvil (IndexedDB). Ocupa espacio y no se incluye en la copia JSON.</p></div>
      <label class="f" for="vt">Título</label><input type="text" id="vt" placeholder="Título del vídeo">
      <label class="f" for="vw">Semana</label><select id="vw"><option value="">General (sin semana)</option>${Array.from({ length: T() }, (_, i) => `<option value="${i + 1}" ${i + 1 === week ? 'selected' : ''}>Semana ${i + 1}</option>`).join('')}</select>
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Guardar</button></div>`);
    let kind = 'url';
    el.querySelector('.filters').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('pri', x === b)); $('#kurl', el).hidden = kind !== 'url'; $('#kfile', el).hidden = kind !== 'file'; };
    $('#vf', el).onchange = async () => {
      const f = $('#vf', el).files[0]; if (!f) return;
      if (!$('#vt', el).value) $('#vt', el).value = f.name.replace(/\.[^.]+$/, '');
      const est = await estimate(); const free = est ? est.quota - est.usage : Infinity;
      $('#vfi', el).innerHTML = `<b>${esc(f.name)}</b> · ${mb(f.size)}${f.size > 300 * 1048576 ? '<br>⚠️ Es un vídeo grande: ocupará mucho espacio en el móvil.' : ''}${f.size > free ? '<br>⚠️ Puede que no haya espacio suficiente.' : ''}<br>Se guarda solo en este móvil y no va en la copia JSON.`;
    };
    $('#cn', el).onclick = closeSheet;
    $('#ok', el).onclick = async () => {
      const wk = parseInt($('#vw', el).value, 10) || null, title = $('#vt', el).value.trim();
      const v = { ...blankE(), id: uid(), week: wk, o: ses != null && wk === week ? ses : null, title, kind, url: '', size: 0, mime: '', name: '', watched: false, added: Date.now() };
      delete v.done;
      if (kind === 'url') { let u = $('#vu', el).value.trim(); if (!u) return toast('Pega el enlace'); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; v.url = u; if (!v.title) v.title = u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60); }
      else {
        const f = $('#vf', el).files[0]; if (!f) return toast('Elige un vídeo del móvil');
        Object.assign(v, { size: f.size, mime: f.type, name: f.name, title: title || f.name });
        $('#ok', el).disabled = true; $('#ok', el).innerHTML = '<span class="spin"></span> Guardando…';
        await persist();
        try { await putBlob(v.id, f); } catch (e) { $('#ok', el).disabled = false; $('#ok', el).textContent = 'Guardar'; return toast('No se pudo guardar: falta espacio en el móvil', 4000); }
      }
      data.videos.push(v); saveData(); closeSheet(); toast('Vídeo añadido'); if (done) done(); else location.hash = '#/video/' + v.id;
    };
  }

  function viewVideo(id) {
    const v = data.videos.find((x) => x.id === id); if (!v) { location.hash = '#/videos'; return; }
    v.questions ||= []; v.note ??= ''; v.transcript ??= '';
    const p = v.kind === 'url' ? parseUrl(v.url) : { type: 'file' };
    const player = p.embed ? `<div class="player"><iframe src="${esc(p.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(v.title)}"></iframe></div>`
      : p.type === 'direct' ? `<div class="player"><video controls playsinline preload="metadata" src="${esc(v.url)}"></video></div>`
      : p.type === 'file' ? '<div class="player" id="pl"><p class="muted" style="padding:20px">Cargando vídeo…</p></div>' : '';
    const rer = () => viewVideo(id);
    $('#app').innerHTML = `<div class="top"><a class="btn sm ghost" href="${v.week ? '#/semana/' + v.week : '#/videos'}" aria-label="Volver">‹</a><h1>Vídeo</h1></div>
      ${player}
      ${v.kind === 'url' ? `<a class="btn sm block" href="${esc(v.url)}" target="_blank" rel="noopener">↗️ Abrir enlace${p.type === 'link' ? ' (no se puede incrustar)' : ''}</a>` : `<p class="small muted">📱 ${esc(v.name)} · ${mb(v.size)} · guardado solo en este móvil</p>`}
      <input type="text" id="title" placeholder="Título" value="${esc(v.title)}" style="font-family:var(--serif);font-size:1.1em;margin-top:10px">
      <div class="row" style="margin-top:8px"><select id="vw" class="grow"><option value="">General</option>${Array.from({ length: T() }, (_, i) => `<option value="${i + 1}" ${i + 1 === v.week ? 'selected' : ''}>Semana ${i + 1}</option>`).join('')}</select>
        <button class="btn ${v.watched ? '' : 'pri'}" id="watched">${v.watched ? '✓ Visto' : 'Marcar visto'}</button></div>
      ${entryHtml(v, { noteTitle: 'Notas del vídeo' })}
      <button class="btn block danger ghost" id="delv">🗑 Borrar vídeo</button>`;
    entryBind(v, { src: { v: id, w: v.week, label: 'Vídeo: ' + (v.title || '').slice(0, 40) }, rerender: rer });
    $('#vw').onchange = (e) => { v.week = parseInt(e.target.value, 10) || null; saveData(); toast('Semana cambiada'); };
    $('#watched').onclick = () => { v.watched = !v.watched; saveData(); rer(); };
    if (p.type === 'file') getBlob(id).then((b) => {
      const pl = $('#pl'); if (!pl || location.hash !== '#/video/' + id) return;
      if (!b) { pl.innerHTML = '<p class="muted" style="padding:20px">El archivo no está en este móvil (¿copia importada?).</p>'; return; }
      objURL = URL.createObjectURL(b); pl.innerHTML = `<video controls playsinline preload="metadata" src="${objURL}"></video>`;
    }).catch(() => {});
    if ($('#fromvid')) $('#fromvid').onclick = async () => {
      if (!apiKey()) return toast('Primero pega tu clave de OpenAI en Ajustes');
      const b = await getBlob(id); if (!b) return toast('El archivo no está en este móvil');
      audioFlow(v, new File([b], v.name || 'video.mp4', { type: v.mime || b.type }), rer);
    };
    $('#delv').onclick = async () => { if (!confirm('¿Borrar este vídeo' + (v.kind === 'file' ? ' y su archivo del móvil' : '') + '?')) return; data.videos = data.videos.filter((x) => x !== v); saveData(); if (v.kind === 'file') await delBlob(id).catch(() => {}); location.hash = v.week ? '#/semana/' + v.week : '#/videos'; };
  }

  // ---------- Seguimiento ----------
  const fuCard = (f) => `<button class="card fu ${overdue(f) ? 'overdue' : ''} ${f.status === 'hecho' ? 'isdone' : ''}" data-fu="${f.id}" style="width:100%;text-align:left;font:inherit;color:inherit">
    <div class="row"><span class="small muted grow">${f.kind === 'compromiso' ? '🤝 Compromiso' : '⚡ Acción'}${f.src?.label ? ' · ' + esc(f.src.label) : ''}</span><span class="pill ${overdue(f) ? 'over' : f.status}">${overdue(f) ? 'Vencido' : FS[f.status]}</span></div>
    <div class="t" style="font-family:var(--serif);margin:4px 0">${esc(f.text)}</div>
    <div class="small muted">${f.due ? '📅 ' + esc(new Date(f.due + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Sin fecha'}${f.log.length ? ' · ' + f.log.length + ' avance' + (f.log.length === 1 ? '' : 's') : ''}</div></button>`;

  function newFollow(src, text, rer) {
    const el = sheet(`<h2>📌 Nuevo seguimiento</h2><p class="small muted">${esc(src.label || '')}</p>
      <div class="filters"><button class="btn sm pri" data-k="acción">⚡ Acción</button><button class="btn sm" data-k="compromiso">🤝 Compromiso</button></div>
      <textarea id="ft" style="min-height:90px" placeholder="¿Qué vas a hacer?">${esc(text)}</textarea>
      <label class="f" for="fd">Fecha límite (opcional)</label><input type="date" id="fd">
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Crear</button></div>`);
    let kind = 'acción';
    el.querySelector('.filters').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('pri', x === b)); };
    $('#cn', el).onclick = closeSheet; $('#ft', el).focus();
    $('#ok', el).onclick = () => {
      const t = $('#ft', el).value.trim(); if (!t) return toast('Escribe la acción o compromiso');
      data.follow.push({ id: uid(), text: t, kind, due: $('#fd', el).value || '', status: 'pendiente', created: isoToday(), src, log: [] }); saveData(); closeSheet(); toast('Seguimiento creado 📌'); rer && rer();
    };
  }
  function openFollow(id, rer) {
    const f = data.follow.find((x) => x.id === id); if (!f) return;
    const srcHref = f.src?.v ? '#/video/' + f.src.v : f.src?.o !== undefined ? `#/sesion/${f.src.w}/${f.src.o}` : f.src?.w ? '#/semana/' + f.src.w : '';
    const el = sheet(`<h2>${f.kind === 'compromiso' ? '🤝 Compromiso' : '⚡ Acción'}</h2>
      <textarea id="ft" style="min-height:80px">${esc(f.text)}</textarea>
      <div class="filters" id="fs">${Object.entries(FS).map(([k, t]) => `<button class="btn sm ${k === f.status ? 'pri' : ''}" data-s="${k}">${t}</button>`).join('')}</div>
      <label class="f" for="fd">Fecha límite</label><input type="date" id="fd" value="${esc(f.due)}">
      ${overdue(f) ? '<p class="small" style="color:var(--danger)">⚠️ Vencido</p>' : ''}
      <h3 style="margin-top:14px">Avances</h3>
      ${f.log.map((l, i) => `<div class="log"><div class="small muted row"><span class="grow">${esc(new Date(l.d + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }))}</span><button class="btn sm ghost" data-dl="${i}" aria-label="Borrar avance">✕</button></div><p>${esc(l.t)}</p></div>`).join('') || '<p class="small muted">Aún no hay avances.</p>'}
      <div class="card" style="margin:8px 0"><textarea id="lt" style="min-height:70px" placeholder="¿Qué has avanzado?"></textarea>
        <div class="row" style="margin-top:6px"><input type="date" id="ld" value="${isoToday()}" class="grow" style="width:auto"><button class="btn sm" id="lmic">🎤</button><button class="btn sm pri" id="ladd">Añadir avance</button></div></div>
      <p class="small muted">Creado el ${esc(f.created)}${f.src?.label ? ' · desde ' + esc(f.src.label) : ''}</p>
      <div class="row">${srcHref ? `<a class="btn sm" href="${srcHref}">↩ Ir a la nota</a>` : ''}<button class="btn sm danger" id="del">🗑 Borrar</button><span class="grow"></span><button class="btn pri" id="ok">Guardar</button></div>`);
    const commit = () => { f.text = $('#ft', el).value.trim() || f.text; f.due = $('#fd', el).value; saveData(); };
    $('#fs', el).onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; commit(); f.status = b.dataset.s; saveData(); openFollow(id, rer); rer && rer(); };
    $('#ladd', el).onclick = () => { const t = $('#lt', el).value.trim(); if (!t) return toast('Escribe el avance'); commit(); f.log.push({ d: $('#ld', el).value || isoToday(), t }); f.log.sort((a, b) => a.d.localeCompare(b.d)); if (f.status === 'pendiente') f.status = 'curso'; saveData(); openFollow(id, rer); rer && rer(); };
    $('#lmic', el).onclick = (e) => toggleDictation(e.currentTarget, $('#lt', el));
    el.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = () => { if (!confirm('¿Borrar este avance?')) return; f.log.splice(+b.dataset.dl, 1); saveData(); openFollow(id, rer); }));
    $('#del', el).onclick = () => { if (!confirm('¿Borrar este seguimiento?')) return; data.follow = data.follow.filter((x) => x !== f); saveData(); closeSheet(); rer && rer(); };
    $('#ok', el).onclick = () => { commit(); closeSheet(); toast('Guardado'); rer && rer(); };
    el.querySelectorAll('a').forEach((a) => (a.onclick = closeSheet));
  }
  function viewFollow() {
    let f = viewFollow.f || 'open';
    const list = data.follow.filter((x) => f === 'all' || (f === 'open' ? x.status !== 'hecho' : f === 'over' ? overdue(x) : x.status === f))
      .sort((a, b) => (a.status === 'hecho') - (b.status === 'hecho') || overdue(b) - overdue(a) || (a.due || '9999').localeCompare(b.due || '9999'));
    const nOver = data.follow.filter(overdue).length;
    $('#app').innerHTML = `<h1>Seguimiento</h1>
      <div class="filters">${[['open', 'Abiertos'], ['over', `Vencidos${nOver ? ' (' + nOver + ')' : ''}`], ['pendiente', 'Pendientes'], ['curso', 'En curso'], ['hecho', 'Hechos'], ['all', 'Todos']].map(([k, t]) => `<button class="btn sm ${k === f ? 'pri' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
      ${list.map(fuCard).join('') || '<p class="muted">Nada por aquí. Crea seguimientos con 📌 desde cualquier nota.</p>'}
      <button class="btn block" id="newfu" style="margin-top:8px">＋ Nuevo seguimiento suelto</button>`;
    $('.filters').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; viewFollow.f = b.dataset.f; viewFollow(); };
    $('#app').onclick = (e) => { const b = e.target.closest('[data-fu]'); if (b) openFollow(b.dataset.fu, viewFollow); };
    $('#newfu').onclick = () => newFollow({ label: '' }, '', viewFollow);
  }

  // ---------- Dictado ----------
  let rec = null, recBtn = null, recTxt = '';
  function stopDictation() { if (rec) { const r = rec; rec = null; try { r.stop(); } catch (_) {} } if (recBtn) { recBtn.classList.remove('on'); recBtn.textContent = recTxt; recBtn = null; } }
  function toggleDictation(btn, ta) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Este navegador no permite dictado. Usa Chrome en Android.');
    if (!ta) return;
    if (recBtn === btn) return stopDictation();
    stopDictation();
    const r = new SR(); r.lang = 'es-ES'; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
        let t = e.results[i][0].transcript.trim(); if (!t) continue;
        const v = ta.value; const sep = !v ? '' : /[.!?]\s*$/.test(v) ? ' ' : /\s$/.test(v) ? '' : ' ';
        if (!v || /[.!?]\s*$/.test(v)) t = t.charAt(0).toUpperCase() + t.slice(1);
        ta.value = v + sep + t; ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    r.onerror = (e) => { if (e.error === 'not-allowed') { toast('Permite el micrófono para dictar'); stopDictation(); } };
    r.onend = () => { if (rec === r) { try { r.start(); } catch (_) { stopDictation(); } } };
    rec = r; recBtn = btn; recTxt = btn.textContent; btn.classList.add('on'); btn.textContent = '⏹ Parar';
    try { r.start(); toast('Habla… se irá añadiendo el texto'); } catch (_) { stopDictation(); }
  }

  // ---------- OpenAI ----------
  async function oa(path, opts) {
    let res;
    try { res = await fetch('https://api.openai.com/v1' + path, { method: 'POST', ...opts, headers: { Authorization: 'Bearer ' + apiKey(), ...(opts.headers || {}) } }); }
    catch (_) { throw new Error('Sin conexión con OpenAI. Revisa internet.'); }
    let j = null; try { j = await res.json(); } catch (_) {}
    if (!res.ok) {
      const m = j?.error?.message || res.statusText;
      if (res.status === 401) throw new Error('Clave de OpenAI no válida. Revísala en Ajustes.');
      if (res.status === 429) throw new Error('OpenAI: límite o saldo agotado (' + m + ')');
      if (res.status === 413) throw new Error('El archivo es demasiado grande (máx. 25 MB).');
      throw new Error('OpenAI: ' + m);
    }
    return j;
  }
  async function transcribe(file) {
    const f = new FormData(); f.append('file', file, file.name || 'audio.m4a'); f.append('model', settings.transcribeModel); f.append('language', 'es'); f.append('response_format', 'json');
    return (await oa('/audio/transcriptions', { body: f })).text || '';
  }
  async function extractQuestions(text) {
    const j = await oa('/chat/completions', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: settings.chatModel, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: 'Ayudas a un alumno de un programa semanal de abundancia y prosperidad. Recibes la transcripción de un audio o vídeo de la sesión. Extrae las preguntas, ejercicios o tareas que se plantean al alumno para que responda, reflexione o haga algo (no preguntas retóricas). Redáctalas en español de España, claras, completas y fieles, en el orden en que aparecen. Propón además un título breve (máx. 6 palabras). Responde solo JSON: {"titulo": "...", "preguntas": ["...", "..."]}' },
        { role: 'user', content: text }] }) });
    const c = j.choices?.[0]?.message?.content || '{}';
    let o; try { o = JSON.parse(c); } catch (_) { o = {}; }
    return { title: o.titulo || '', qs: (o.preguntas || []).map((s) => String(s).trim()).filter(Boolean) };
  }
  async function audioFlow(e, file, rer) {
    if (file.size > 25 * 1024 * 1024) return toast('El archivo pesa más de 25 MB. Recórtalo o compártelo en menor calidad (o solo el audio).', 4500);
    const el = sheet(`<h2>🎧 Sacando preguntas…</h2><p class="row"><span class="spin"></span> <span id="stt">Transcribiendo (≈30 s)…</span></p>`);
    try {
      const text = await transcribe(file);
      if (!text.trim()) throw new Error('No se entendió nada en el audio.');
      e.transcript = text; saveData();
      $('#stt', el) && ($('#stt', el).textContent = 'Buscando las preguntas…');
      reviewQuestions(e, await extractQuestions(text), rer);
    } catch (err) { if (e.transcript) rer(); sheet(`<h2>No se pudo</h2><p>${esc(err.message)}</p><button class="btn block" id="cx">Cerrar</button>`); $('#cx').onclick = closeSheet; }
  }
  function reviewQuestions(e, r, rer) {
    const el = sheet(`<h2>Preguntas encontradas</h2><p class="muted small">Revisa y marca las que quieres añadir. Puedes corregirlas.</p>
      ${r.qs.length ? r.qs.map((q, i) => `<label class="chk"><input type="checkbox" checked data-i="${i}"><textarea style="min-height:70px;font-size:1em" data-t="${i}">${esc(q)}</textarea></label>`).join('') : '<p>No se encontraron preguntas. La transcripción queda guardada.</p>'}
      ${r.title && !e.title ? `<label class="switch"><span>Usar título: <i>${esc(r.title)}</i></span><input type="checkbox" id="ut" checked></label>` : ''}
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Añadir</button></div>`);
    $('#cn', el).onclick = () => { closeSheet(); rer(); };
    $('#ok', el).onclick = () => {
      let c = 0; el.querySelectorAll('[data-i]').forEach((cb) => { const v = el.querySelector(`[data-t="${cb.dataset.i}"]`).value.trim(); if (cb.checked && v) { e.questions.push({ id: uid(), q: v, a: '' }); c++; } });
      if ($('#ut', el)?.checked) e.title = r.title;
      saveData(); closeSheet(); rer(); toast(c + (c === 1 ? ' pregunta añadida' : ' preguntas añadidas'));
    };
  }

  // ---------- Releer ----------
  const qaHtml = (e) => e.questions.map((q, i) => `<h3>${i + 1}. ${esc(q.q)}</h3><p>${esc(q.a) || '<span class="muted">— sin responder —</span>'}</p>`).join('') + (e.note ? `<h3>Notas</h3><p>${esc(e.note)}</p>` : '');
  function viewRead(n) {
    const w = peekW(n), vids = data.videos.filter((v) => v.week === n), fus = data.follow.filter((f) => f.src?.w === n);
    const ses = allSessions(n).filter((o) => { const e = peekS(n, o); return e.questions.length || hasContent(e) || e.done; });
    $('#app').innerHTML = `<div class="top"><a class="btn sm ghost" href="#/semana/${n}" aria-label="Volver">‹</a><h1>Semana ${n}</h1>
      <a class="btn sm ghost" href="#/releer/${n - 1}" ${n <= 1 ? 'hidden' : ''}>◀</a><a class="btn sm ghost" href="#/releer/${n + 1}" ${n >= T() ? 'hidden' : ''}>▶</a></div>
      <div class="card read">${w.title ? `<h2>${esc(w.title)}</h2>` : ''}${w.theme ? `<div class="muted">Tema: ${esc(w.theme)}</div>` : ''}
      ${ses.map((o) => { const e = peekS(n, o); return `<h2 style="margin-top:20px;font-size:1.1em">📅 ${esc(fmtDate(dateOf(n, o)))}${e.title ? ' — ' + esc(e.title) : ''}${e.done ? ' ✓' : ''}</h2>${qaHtml(e)}`; }).join('') || '<p class="muted">Esta semana aún no tiene sesiones con contenido.</p>'}
      ${w.note ? `<h2 style="margin-top:20px;font-size:1.1em">Notas de la semana</h2><p>${esc(w.note)}</p>` : ''}
      ${vids.map((v) => `<h2 style="margin-top:20px;font-size:1.1em">🎬 ${esc(v.title)}</h2>${qaHtml({ questions: v.questions || [], note: v.note })}`).join('')}
      ${fus.length ? `<h2 style="margin-top:20px;font-size:1.1em">📌 Seguimiento</h2>${fus.map((f) => `<p>• ${esc(f.text)} <span class="muted">(${FS[f.status]}${f.due ? ', ' + esc(f.due) : ''})</span></p>`).join('')}` : ''}</div>
      <div class="row"><a class="btn grow" href="#/semana/${n}">✏️ Editar</a><button class="btn grow" id="sh">📤 Compartir</button></div>`;
    $('#sh').onclick = () => shareText(weekMd(n), `Programa de Abundancia · Semana ${n}`);
  }

  // ---------- Buscar ----------
  function viewSearch() {
    $('#app').innerHTML = `<div class="top"><a class="btn sm ghost" href="#/" aria-label="Volver">‹</a><h1>Buscar</h1></div><input type="search" id="s" placeholder="En sesiones, notas, vídeos, seguimiento…" value="${esc(viewSearch.q || '')}"><div id="res"></div>`;
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const hl = (text, q) => { const nt = norm(text), nq = norm(q); let out = '', i = 0, k; while (nq && (k = nt.indexOf(nq, i)) !== -1) { out += esc(text.slice(i, k)) + '<mark>' + esc(text.slice(k, k + q.length)) + '</mark>'; i = k + q.length; } return out + esc(text.slice(i)); };
    const snip = (text, q) => { const k = norm(text).indexOf(norm(q)); if (text.length < 220) return text; const s = Math.max(0, k - 80); return (s ? '…' : '') + text.slice(s, s + 220) + (s + 220 < text.length ? '…' : ''); };
    const run = () => {
      const q = (viewSearch.q = $('#s').value.trim());
      if (q.length < 2) { $('#res').innerHTML = '<p class="muted">Escribe al menos 2 letras.</p>'; return; }
      const nq = norm(q), out = []; let count = 0;
      const has = (s) => norm(s).includes(nq);
      const entryParts = (e) => { const parts = []; if (has(e.title)) parts.push(`<p><b>${hl(e.title, q)}</b></p>`);
        (e.questions || []).forEach((x, i) => { const inA = has(x.a); if (has(x.q) || inA) parts.push(`<p><b>${i + 1}. ${hl(x.q, q)}</b></p>${inA ? `<p style="font-family:var(--serif)">${hl(snip(x.a, q), q)}</p>` : ''}`); });
        if (has(e.note)) parts.push(`<p style="font-family:var(--serif)">${hl(snip(e.note, q), q)}</p>`); return parts; };
      const push = (href, head, parts) => { if (parts.length) { count += parts.length; out.push(`<a class="card hit" href="${href}"><b style="color:var(--accent)">${head}</b>${parts.join('')}</a>`); } };
      for (let n = 1; n <= T(); n++) {
        const w = data.w[n]; if (!w) continue;
        push(`#/semana/${n}`, `Semana ${n}`, entryParts({ title: [w.title, w.theme].filter(Boolean).join(' · '), note: w.note }));
        for (const o of Object.keys(w.s)) push(`#/sesion/${n}/${o}`, esc(sesLabel(n, +o)), entryParts(w.s[o]));
      }
      data.videos.forEach((v) => push(`#/video/${v.id}`, '🎬 Vídeo' + (v.week ? ' · semana ' + v.week : ''), entryParts(v)));
      data.follow.forEach((f) => { const parts = []; if (has(f.text)) parts.push(`<p>${hl(f.text, q)}</p>`); f.log.forEach((l) => has(l.t) && parts.push(`<p class="small">${esc(l.d)}: ${hl(snip(l.t, q), q)}</p>`)); push('#/seguimiento', '📌 Seguimiento · ' + FS[f.status], parts); });
      $('#res').innerHTML = out.length ? `<p class="muted small">${count} coincidencia${count === 1 ? '' : 's'} en ${out.length} sitio${out.length === 1 ? '' : 's'}</p>` + out.join('') : '<p class="muted">Sin resultados.</p>';
    };
    $('#s').oninput = run; run(); if (!viewSearch.q) $('#s').focus();
  }

  // ---------- Exportar ----------
  const eMd = (e) => { let s = ''; (e.questions || []).forEach((q, i) => { s += `**${i + 1}. ${q.q}**\n\n${(q.a || '').trim() || '_(sin responder)_'}\n\n`; }); if ((e.note || '').trim()) s += `**Notas**\n\n${e.note.trim()}\n\n`; return s; };
  function weekMd(n) {
    const w = peekW(n); let s = `## Semana ${n}${w.title ? ' — ' + w.title : ''}\n${w.theme ? `_Tema: ${w.theme}_\n` : ''}\n`;
    allSessions(n).forEach((o) => { const e = peekS(n, o); if (!e.questions.length && !hasContent(e) && !e.done) return; s += `### ${fmtDate(dateOf(n, o))}${e.title ? ' — ' + e.title : ''}${e.done ? ' ✓' : ''}\n\n${eMd(e)}`; });
    if ((w.note || '').trim()) s += `### Notas de la semana\n\n${w.note.trim()}\n\n`;
    data.videos.filter((v) => v.week === n).forEach((v) => { s += `### Vídeo: ${v.title}${v.watched ? ' (visto)' : ''}\n${v.kind === 'url' ? v.url : '(archivo en el móvil: ' + v.name + ')'}\n\n${eMd(v)}`; });
    return s;
  }
  const fuMd = (f) => `- [${f.status === 'hecho' ? 'x' : ' '}] **${f.text}** (${f.kind}, ${FS[f.status]}${f.due ? ', vence ' + f.due : ''})${f.src?.label ? ' — ' + f.src.label : ''}\n` + f.log.map((l) => `  - ${l.d}: ${l.t}\n`).join('');
  const allMd = () => `# Programa de Abundancia\nInicio: ${data.start} · ${T()} semanas\n\n` + Array.from({ length: T() }, (_, i) => i + 1).map(weekMd).join('---\n\n')
    + (data.videos.some((v) => !v.week) ? '---\n\n## Vídeos generales\n\n' + data.videos.filter((v) => !v.week).map((v) => `### ${v.title}\n${v.kind === 'url' ? v.url : '(archivo en el móvil)'}\n\n${eMd(v)}`).join('') : '')
    + (data.follow.length ? '---\n\n## Seguimiento\n\n' + data.follow.map(fuMd).join('') : '');
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  async function shareText(text, title, fname) {
    try {
      if (fname && navigator.canShare) { const f = new File([text], fname, { type: 'text/markdown' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title }); return; } }
      if (navigator.share) { await navigator.share({ title, text }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    download(fname || 'programa-abundancia.md', text, 'text/markdown'); toast('Archivo descargado');
  }

  // ---------- Ajustes ----------
  function viewSettings() {
    const nFiles = data.videos.filter((v) => v.kind === 'file').length;
    $('#app').innerHTML = `<h1>Ajustes</h1>
      <div class="card"><h3>Programa</h3><label class="f" for="st">Fecha de inicio (semana 1)</label><input type="date" id="st" value="${esc(data.start)}">
        <label class="f" for="nw">Número de semanas</label><input type="text" inputmode="numeric" id="nw" value="${T()}">
        <p class="small muted">Hoy sería la semana ${todayW()} de ${T()}.</p>
        <label class="f">Días con actividad (patrón general)</label>
        <div class="days7">${WD.map((d) => `<label><input type="checkbox" data-pd="${d}" ${data.pattern.includes(d) ? 'checked' : ''}>${WDL[d]}</label>`).join('')}</div>
        <p class="small muted">Cada semana puede cambiarlo en «Días con actividad».</p></div>
      <div class="card"><h3>Lectura</h3><label class="switch"><span>Letra grande</span><input type="checkbox" id="big" ${settings.big ? 'checked' : ''}></label></div>
      <div class="card"><h3>🔒 Bloqueo</h3><p class="small muted">Pide huella o PIN al abrir la app.</p><button class="btn block" id="lk">${PALock.isEnabled() ? 'Desactivar bloqueo' : 'Activar huella / PIN'}</button></div>
      <div class="card"><h3>🎬 Almacenamiento de vídeos</h3><p class="small muted" id="stor">${nFiles} vídeo${nFiles === 1 ? '' : 's'} guardado${nFiles === 1 ? '' : 's'} en el móvil.</p>
        <button class="btn block" id="pers">Proteger almacenamiento (persistente)</button></div>
      <div class="card"><h3>💾 Copia de seguridad</h3>
        <p class="small muted">⚠️ La copia JSON incluye notas, preguntas, enlaces y seguimiento, pero <b>no los vídeos subidos desde el móvil</b> (son demasiado grandes). Guárdalos aparte.</p>
        <button class="btn block" id="ej">⬇️ Exportar copia (JSON)</button>
        <button class="btn block" id="ij" style="margin-top:8px">⬆️ Importar copia</button><input type="file" id="if" accept="application/json,.json" hidden>
        <button class="btn block" id="em" style="margin-top:8px">📤 Exportar como texto (Markdown)</button></div>
      <div class="card"><button class="btn block danger ghost" id="rs">Borrar todos los datos</button></div>
      <p class="small muted" style="text-align:center">Programa de Abundancia · v1 · datos solo en este dispositivo</p>`;
    estimate().then((e) => { if (e && $('#stor')) $('#stor').textContent += ` Espacio usado: ${mb(e.usage || 0)} de ${mb(e.quota || 0)}.`; });
    $('#st').onchange = (e) => { if (e.target.value) { data.start = e.target.value; saveData(); toast('Fecha de inicio guardada'); viewSettings(); } };
    $('#nw').onchange = (e) => { const v = parseInt(e.target.value, 10); if (!(v >= 1 && v <= 104)) { toast('Entre 1 y 104 semanas'); return viewSettings(); } data.weeks = v; saveData(); toast('Ahora son ' + v + ' semanas'); viewSettings(); };
    $('#app').querySelectorAll('[data-pd]').forEach((cb) => (cb.onchange = () => { data.pattern = [...$('#app').querySelectorAll('[data-pd]:checked')].map((x) => +x.dataset.pd); saveData(); toast('Patrón guardado'); }));
    $('#big').onchange = (e) => { settings.big = e.target.checked; saveSet(); document.body.classList.toggle('big', settings.big); };
    $('#lk').onclick = () => { PALock.openSettings((m) => { toast(m); viewSettings(); }); };
    $('#pers').onclick = async () => toast((await persist()) ? 'Almacenamiento protegido ✓' : 'El navegador no lo ha concedido (instala la app en la pantalla de inicio)', 3500);
    $('#ej').onclick = () => { download(`programa-abundancia-${isoToday()}.json`, JSON.stringify({ app: 'programa-abundancia', exported: new Date().toISOString(), aviso: 'Los vídeos subidos desde el móvil no se incluyen en esta copia.', data, settings: { big: settings.big } }, null, 2), 'application/json'); if (nFiles) toast('Copia descargada. Recuerda: los vídeos del móvil no van incluidos.', 4000); };
    $('#ij').onclick = () => $('#if').click();
    $('#if').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const j = JSON.parse(await f.text()); const d = j.data || j; if (!d.start || typeof d.w !== 'object') throw 0;
        if (!confirm('Esto reemplazará los datos actuales por los de la copia. ¿Continuar?')) return;
        data = d; fix(); saveData(); toast('Copia importada ✓'); viewSettings(); } catch (_) { toast('El archivo no es una copia válida'); }
    };
    $('#em').onclick = () => shareText(allMd(), 'Programa de Abundancia', `programa-abundancia-${isoToday()}.md`);
    $('#rs').onclick = async () => { if (confirm('¿Borrar TODO el programa de este móvil (incluidos los vídeos)? Haz antes una copia.') && confirm('¿Seguro? No se puede deshacer.')) { localStorage.removeItem(K.data); await clearBlobs().catch(() => {}); data = null; location.hash = '#/'; route(); } };
  }

  window.addEventListener('hashchange', () => { if (!PALock.isLocked()) route(); });
  PALock.gate(() => route());
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
