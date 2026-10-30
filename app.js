/* Programa de Abundancia — Diario del curso. Datos solo en este dispositivo.
   localStorage con claves 'pa-'; archivos (vídeos y documentos) en IndexedDB 'pa-videos' (almacén 'blobs'). */
(function () {
  'use strict';
  const K = { data: 'pa-data', set: 'pa-settings' };
  const DB = 'pa-videos';
  const TYPES = { curso: '🎬 Vídeo del curso', directo: '🔴 Clase en directo', whatsapp: '💬 WhatsApp', otro: '📝 Otro' };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const isoToday = () => isoOf(new Date());
  const mb = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  const fmtDate = (iso) => { const d = new Date(iso + 'T12:00'); return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  let data = load(K.data, null);
  const settings = Object.assign({ big: false }, load(K.set, {}));
  const saveData = () => { data.updated = Date.now(); localStorage.setItem(K.data, JSON.stringify(data)); };
  const saveSet = () => localStorage.setItem(K.set, JSON.stringify(settings));

  // ---------- Migración desde semanas/sesiones (v1) ----------
  function migrate(old) {
    if (!old) return { v: 2, entries: [] };
    if (old.v === 2 && Array.isArray(old.entries)) return old;
    const out = { v: 2, entries: [], migratedFrom: 1, legacy: old };
    const [y, m, d] = String(old.start || isoToday()).split('-').map(Number);
    const dateOf = (n, o = 0) => isoOf(new Date(y, m - 1, d + (n - 1) * 7 + o));
    const byKey = {};
    const mk = (key, date, title, type) => (byKey[key] ||= (out.entries.push({ id: uid(), date, title, type, note: '', questions: [], items: [], created: Date.now() }), out.entries[out.entries.length - 1]));
    const addNote = (e, t) => { t = (t || '').trim(); if (t) e.note = e.note ? e.note + '\n\n' + t : t; };
    const qs = (e, list, pre) => (list || []).forEach((q) => e.questions.push({ id: q.id || uid(), q: (pre || '') + q.q, a: q.a || '' }));
    const filled = (s) => s && ((s.title || '').trim() || (s.note || '').trim() || (s.questions || []).length || s.done || (s.transcript || '').trim());
    Object.keys(old.w || {}).forEach((n) => {
      const w = old.w[n]; n = +n;
      if ((w.title || '').trim() || (w.theme || '').trim() || (w.note || '').trim()) {
        const e = mk('w' + n, dateOf(n), `Semana ${n}${w.title ? ' — ' + w.title : ''}`, 'otro');
        if (w.theme) addNote(e, 'Tema: ' + w.theme); addNote(e, w.note);
      }
      Object.keys(w.s || {}).forEach((o) => {
        const s = w.s[o]; if (!filled(s)) return;
        const e = mk('s' + n + '-' + o, dateOf(n, +o), s.title || `Semana ${n} · sesión`, 'curso');
        addNote(e, s.note); qs(e, s.questions); if (s.transcript) addNote(e, 'Transcripción:\n' + s.transcript); if (s.done) e.done = true;
      });
    });
    (old.videos || []).forEach((v) => {
      const e = v.week && v.o != null ? mk('s' + v.week + '-' + v.o, dateOf(v.week, v.o), v.title || `Semana ${v.week} · sesión`, 'curso')
        : v.week ? mk('w' + v.week, dateOf(v.week), `Semana ${v.week}`, 'otro')
          : mk('v' + v.id, isoOf(new Date(v.added || Date.now())), v.title || 'Vídeo', 'curso');
      e.items.push({ id: v.id, kind: 'video', src: v.kind === 'file' ? 'file' : 'url', url: v.url || '', name: v.name || '', mime: v.mime || '', size: v.size || 0, title: v.title || '', note: [v.note, v.transcript ? 'Transcripción:\n' + v.transcript : ''].filter((x) => (x || '').trim()).join('\n\n'), watched: !!v.watched, added: v.added || Date.now() });
      qs(e, v.questions, (v.questions || []).length ? '[' + (v.title || 'vídeo') + '] ' : '');
    });
    (old.follow || []).forEach((f) => {
      const src = f.src || {}, e = src.o != null && byKey['s' + src.w + '-' + src.o] ? byKey['s' + src.w + '-' + src.o] : src.w && byKey['w' + src.w] ? byKey['w' + src.w] : mk('fu', f.created || isoToday(), 'Seguimiento (de la versión anterior)', 'otro');
      addNote(e, `📌 ${f.kind === 'compromiso' ? 'Compromiso' : 'Acción'}: ${f.text} (${f.status}${f.due ? ', fecha ' + f.due : ''})` + (f.log || []).map((l) => `\n   · ${l.d}: ${l.t}`).join(''));
    });
    return out;
  }
  if (data && data.v !== 2) { data = migrate(data); saveData(); }
  if (!data) data = { v: 2, entries: [] };
  const fix = () => { data.entries ||= []; data.entries.forEach((e) => { e.questions ||= []; e.items ||= []; e.note ??= ''; e.type ||= 'otro'; }); };
  fix();
  const sorted = () => [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const entryOf = (id) => data.entries.find((e) => e.id === id);
  const allItems = () => data.entries.flatMap((e) => e.items.map((it) => ({ it, e })));

  function toast(msg, ms = 2600) { const r = $('#toast-root'); r.innerHTML = `<div class="toast">${esc(msg)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => (r.innerHTML = ''), ms); }
  function sheet(html) { const r = $('#sheet-root'); r.innerHTML = `<div class="sheet-bg"><div class="sheet">${html}</div></div>`; const bg = r.firstChild; bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); }); return bg.firstChild; }
  const closeSheet = () => { stopDictation(); $('#sheet-root').innerHTML = ''; };

  // ---------- IndexedDB ----------
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
  const tabs = [['#/', '📖', 'Diario', ['', 'e']], ['#/archivos', '🗂️', 'Archivos', ['archivos']], ['#/buscar', '🔎', 'Buscar', ['buscar']], ['#/ajustes', '⚙️', 'Ajustes', ['ajustes']]];
  let objURLs = [];
  function route() {
    stopDictation(); closeSheet(); if (window.PATTS) PATTS.stop(); const A = $('#app'); A.oninput = A.onchange = A.onclick = null;
    objURLs.forEach((u) => URL.revokeObjectURL(u)); objURLs = [];
    document.body.classList.toggle('big', !!settings.big);
    const [, name = '', a1, a2] = (location.hash || '#/').split('/');
    $('#tabs').innerHTML = tabs.map(([href, i, t, names]) => `<a href="${href}" class="${names.includes(name) ? 'act' : ''}"><span>${i}</span>${t}</a>`).join('');
    window.scrollTo(0, 0);
    if (name === 'e') return viewEntry(a1, a2);
    if (name === 'archivos') return viewFiles();
    if (name === 'buscar') return viewSearch();
    if (name === 'ajustes') return viewSettings();
    if (name === 'compartido') { viewDiary(); return handleShare(); }
    return viewDiary();
  }

  // ---------- Diario ----------
  const counts = (e) => { const v = e.items.filter((i) => i.kind === 'video').length, d = e.items.length - v; return [v && `🎬 ${v}`, d && `📎 ${d}`, e.questions.length && `❓ ${e.questions.length}`].filter(Boolean).join(' · '); };
  function viewDiary() {
    const list = sorted();
    $('#app').innerHTML = `<h1>Mi diario del curso</h1>
      <button class="btn pri block big-add" id="new">＋ Nueva entrada</button>
      ${list.map((e) => `<a class="card fu entry" href="#/e/${e.id}"><div class="row"><span class="small muted grow">${esc(fmtDate(e.date))}</span><span class="pill">${TYPES[e.type] || TYPES.otro}</span></div>
        <div class="et">${esc(e.title || 'Sin título')}</div>${counts(e) || (e.note || '').trim() ? `<div class="small muted">${counts(e)}${counts(e) && e.note.trim() ? ' · ' : ''}${e.note.trim() ? '💭 ' + esc(e.note.trim().slice(0, 60)) + (e.note.trim().length > 60 ? '…' : '') : ''}</div>` : ''}</a>`).join('')
        || '<div class="card muted" style="text-align:center">Aún no hay entradas.<br>Pulsa «＋ Nueva entrada» cuando salga un vídeo, haya una clase en directo o llegue un WhatsApp.</div>'}`;
    $('#new').onclick = () => newEntry();
  }
  const typeChips = (sel) => `<div class="filters wrap" id="types">${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="btn sm ${k === sel ? 'pri' : ''}" data-ty="${k}">${t}</button>`).join('')}</div>`;
  const bindChips = (root, cb) => { root.querySelector('#types').onclick = (ev) => { const b = ev.target.closest('[data-ty]'); if (!b) return; root.querySelectorAll('[data-ty]').forEach((x) => x.classList.toggle('pri', x === b)); cb(b.dataset.ty); }; };
  function newEntry(pre = {}, then) {
    let type = pre.type || 'curso';
    const el = sheet(`<h2>Nueva entrada</h2>
      <label class="f" for="nd">Día</label><input type="date" id="nd" value="${esc(pre.date || isoToday())}">
      <label class="f" for="nt">Título</label><input type="text" id="nt" placeholder="p. ej. Vídeo 3: el merecimiento" value="${esc(pre.title || '')}">
      <label class="f">Tipo</label>${typeChips(type)}
      <div class="row" style="margin-top:14px"><span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Crear</button></div>`);
    bindChips(el, (t) => (type = t));
    $('#cn', el).onclick = closeSheet;
    $('#ok', el).onclick = () => {
      const e = { id: uid(), date: $('#nd', el).value || isoToday(), title: $('#nt', el).value.trim(), type, note: '', questions: [], items: [], created: Date.now() };
      data.entries.push(e); saveData(); closeSheet(); if (then) then(e); else location.hash = '#/e/' + e.id;
    };
  }

  // ---------- Entrada ----------
  let tmr;
  function autosave(apply) {
    const mark = (ta) => { const s = ta.closest('.card')?.querySelector('.saved'); if (s) { s.textContent = 'Guardado ✓'; clearTimeout(s._t); s._t = setTimeout(() => (s.textContent = ''), 1500); } };
    const save = (ta, now) => { apply(ta); clearTimeout(tmr); const f = () => { saveData(); mark(ta); }; if (now) f(); else tmr = setTimeout(f, 400); };
    $('#app').oninput = (e) => { if (e.target.matches('textarea, input[type=text]')) save(e.target); };
    $('#app').onchange = (e) => { if (e.target.matches('textarea, input[type=text]')) save(e.target, true); else if (e.target.id === 'edate' && e.target.value) save(e.target, true); };
  }
  function autoGrow() { document.querySelectorAll('#app textarea').forEach((t) => { const f = () => { t.style.height = 'auto'; t.style.height = Math.max(110, t.scrollHeight + 4) + 'px'; }; t.addEventListener('input', f); f(); }); }

  function parseUrl(u) {
    let m;
    if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/))) return { type: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1` };
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { type: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}` };
    if ((m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/))) return { type: 'drive', embed: `https://drive.google.com/file/d/${m[1]}/preview` };
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u)) return { type: 'direct' };
    return { type: 'link' };
  }
  const docIcon = (it) => { const t = (it.mime || '') + ' ' + (it.name || ''); if (it.src === 'url') return '🔗'; if (/pdf/i.test(t)) return '📕'; if (/image/i.test(t)) return '🖼️'; if (/audio|\.(mp3|m4a|ogg|opus|wav)/i.test(t)) return '🎧'; if (/video/i.test(t)) return '🎬'; if (/word|\.docx?\b|officedocument\.word/i.test(t)) return '📘'; if (/sheet|excel|\.xlsx?\b/i.test(t)) return '📗'; return '📄'; };
  const icon = (it) => (it.kind === 'video' ? (it.src === 'file' ? '📱' : '▶️') : docIcon(it));
  function itemHtml(it) {
    let media = '';
    if (it.src === 'url') {
      const p = parseUrl(it.url);
      media = it.kind === 'video' && p.embed ? `<div class="player"><iframe src="${esc(p.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(it.title)}"></iframe></div>`
        : it.kind === 'video' && p.type === 'direct' ? `<div class="player"><video controls playsinline preload="metadata" src="${esc(it.url)}"></video></div>` : '';
      media += `<a class="btn sm block" href="${esc(it.url)}" target="_blank" rel="noopener">↗️ Abrir enlace</a>`;
    } else media = `<div class="pv" id="pv-${it.id}"><p class="muted small">Cargando…</p></div>`;
    return `<div class="card item" data-item="${it.id}" id="it-${it.id}">
      <div class="row"><span class="ic">${icon(it)}</span><input type="text" class="grow" data-if="title" placeholder="${it.kind === 'video' ? 'Título del vídeo' : 'Nombre del documento'}" value="${esc(it.title)}" style="width:auto"></div>
      ${it.src === 'file' ? `<div class="small muted" style="margin:4px 0">${esc(it.name)} · ${mb(it.size || 0)}</div>` : ''}
      ${media}
      <textarea data-if="note" placeholder="Notas…" style="margin-top:8px;min-height:70px">${esc(it.note || '')}</textarea>
      <div class="qtools"><span class="row">${it.kind === 'video' ? `<button class="btn sm ${it.watched ? '' : 'pri'}" data-a="wt">${it.watched ? '✓ Visto' : 'Marcar visto'}</button>` : ''}
        ${it.src === 'file' ? '<button class="btn sm" data-a="open">↗️ Abrir</button><button class="btn sm" data-a="share">📤 Compartir</button>' : ''}</span><button class="btn sm" data-a="sayit" aria-label="Escuchar">🔊 Escuchar</button><span class="saved"></span>
        <button class="btn sm ghost danger" data-a="del" aria-label="Borrar">🗑</button></div></div>`;
  }
  async function blobOf(it) { const b = await getBlob(it.id); if (!b) return null; return b.type || !it.mime ? b : new Blob([b], { type: it.mime }); }
  function loadPreviews(items) {
    const h = location.hash;
    items.filter((it) => it.src === 'file').forEach((it) => blobOf(it).then((b) => {
      const pv = document.getElementById('pv-' + it.id); if (!pv || location.hash !== h) return;
      if (!b) { pv.innerHTML = '<p class="muted small">⚠️ El archivo no está en este móvil (¿copia importada sin archivos?).</p>'; return; }
      const u = URL.createObjectURL(b); objURLs.push(u); const t = (it.mime || b.type || '');
      pv.innerHTML = /^video\//.test(t) || it.kind === 'video' ? `<div class="player"><video controls playsinline preload="metadata" src="${u}"></video></div>`
        : /^image\//.test(t) ? `<img src="${u}" alt="${esc(it.title)}" class="img">`
          : /^audio\//.test(t) ? `<audio controls src="${u}" style="width:100%"></audio>`
            : /pdf/.test(t) ? `<iframe class="pdf" src="${u}" title="${esc(it.title)}"></iframe><p class="small muted">Si no se ve el PDF, pulsa «Abrir» o «Compartir» para verlo con otra app.</p>` : '';
    }).catch(() => {}));
  }
  async function openItem(it, share) {
    const b = await blobOf(it); if (!b) return toast('El archivo no está en este móvil');
    if (share) {
      const f = new File([b], it.name || it.title || 'archivo', { type: b.type || 'application/octet-stream' });
      try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: it.title }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    }
    const u = URL.createObjectURL(b);
    if (!share && /^(image|video|audio)\/|pdf|text\//.test(b.type)) { window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); return; }
    const a = document.createElement('a'); a.href = u; a.download = it.name || 'archivo'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 60000); toast('Archivo descargado');
  }

  const qHtml = (q, i, n) => `<div class="card" data-id="${q.id}">
      <div class="q"><span class="n">${i + 1}.</span><span class="grow">${esc(q.q)}</span><button class="btn sm ghost" data-a="edit" aria-label="Editar pregunta">✏️</button></div>
      <textarea data-a="ans" placeholder="Respuesta…" aria-label="Respuesta a la pregunta ${i + 1}">${esc(q.a)}</textarea>
      <div class="qtools"><span class="row"><button class="btn sm" data-a="mic">🎤 Dictar</button><button class="btn sm" data-a="sayq" aria-label="Escuchar pregunta y respuesta">🔊</button></span><span class="saved"></span>
      <span class="row"><button class="btn sm ghost" data-a="up" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button><button class="btn sm ghost" data-a="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button></span></div></div>`;

  function viewEntry(id, focusItem) {
    const e = entryOf(id); if (!e) { location.hash = '#/'; return; }
    const rer = () => { const y = scrollY; viewEntry(id); scrollTo(0, y); };
    const vids = e.items.filter((i) => i.kind === 'video'), docs = e.items.filter((i) => i.kind !== 'video');
    $('#app').innerHTML = `<div class="top"><a class="btn sm ghost" href="#/" aria-label="Volver">‹</a><h1>Entrada</h1></div>
      <button class="btn block pri say-all" data-a="sayall">🔊 Escuchar toda la entrada</button>
      <div class="card">
        <label class="f" for="edate">Día</label><input type="date" id="edate" value="${esc(e.date)}">
        <label class="f" for="title">Título</label><input type="text" id="title" placeholder="Título" value="${esc(e.title)}" style="font-family:var(--serif);font-size:1.1em">
        <label class="f">Tipo</label>${typeChips(e.type)}<span class="saved"></span></div>
      <div class="card"><h3>💭 Comentarios</h3><textarea id="note" placeholder="Lo que quieras anotar…">${esc(e.note)}</textarea>
        <div class="qtools"><span class="row"><button class="btn sm" data-a="mic">🎤 Dictar</button><button class="btn sm" data-a="saynote">🔊 Escuchar</button></span><span class="saved"></span></div></div>
      <div class="row" style="margin-top:18px"><h2 class="grow" style="margin:0">❓ Preguntas y respuestas</h2>${e.questions.length ? '<button class="btn sm" data-a="sayqs">🔊 Escuchar</button>' : ''}</div>
      <div id="qs">${e.questions.map((q, i) => qHtml(q, i, e.questions.length)).join('')}</div>
      <button class="btn block" id="addq">＋ Añadir pregunta</button>
      <h2 style="margin-top:18px">🎬 Vídeos</h2>${vids.map(itemHtml).join('')}
      <button class="btn block pri" id="addv">🎬 Añadir vídeo</button>
      <h2 style="margin-top:18px">📎 Documentos</h2>${docs.map(itemHtml).join('')}
      <button class="btn block pri" id="addd">📎 Añadir documento</button>
      <button class="btn block ghost danger" id="dele" style="margin-top:24px">🗑 Borrar esta entrada</button>`;
    bindChips($('#app'), (t) => { e.type = t; saveData(); toast('Tipo cambiado'); });
    autosave((ta) => {
      if (ta.id === 'note') e.note = ta.value; else if (ta.id === 'title') e.title = ta.value; else if (ta.id === 'edate') e.date = ta.value;
      else if (ta.dataset.if) { const it = e.items.find((x) => x.id === ta.closest('[data-item]').dataset.item); if (it) it[ta.dataset.if] = ta.value; }
      else { const c = ta.closest('[data-id]'); const q = c && e.questions.find((x) => x.id === c.dataset.id); if (q) q.a = ta.value; }
    });
    autoGrow();
    $('#app').onclick = async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a, card = b.closest('[data-id]'), idx = card ? e.questions.findIndex((x) => x.id === card.dataset.id) : -1;
      const it = e.items.find((x) => x.id === b.closest('[data-item]')?.dataset.item);
      if (a.startsWith('say')) return sayEntry(e, a, card && e.questions[idx], it);
      if (a === 'mic') return toggleDictation(b, b.closest('.card').querySelector('textarea'));
      if (a === 'up' || a === 'down') { const j = idx + (a === 'up' ? -1 : 1); [e.questions[idx], e.questions[j]] = [e.questions[j], e.questions[idx]]; saveData(); return rer(); }
      if (a === 'edit') return editQuestion(e, e.questions[idx], rer);
      if (!it) return;
      if (a === 'wt') { it.watched = !it.watched; saveData(); return rer(); }
      if (a === 'open') return openItem(it, false);
      if (a === 'share') return openItem(it, true);
      if (a === 'del') { if (!confirm('¿Borrar «' + (it.title || it.name || 'este archivo') + '»?')) return; e.items = e.items.filter((x) => x !== it); saveData(); if (it.src === 'file') await delBlob(it.id).catch(() => {}); return rer(); }
    };
    $('#addq').onclick = () => editQuestion(e, null, rer);
    $('#addv').onclick = () => addItem(e, 'video', rer);
    $('#addd').onclick = () => addItem(e, 'doc', rer);
    $('#dele').onclick = async () => {
      if (!confirm('¿Borrar la entrada «' + (e.title || fmtDate(e.date)) + '» con sus comentarios, preguntas y archivos?')) return;
      data.entries = data.entries.filter((x) => x !== e); saveData(); for (const it of e.items) if (it.src === 'file') await delBlob(it.id).catch(() => {}); location.hash = '#/';
    };
    loadPreviews(e.items);
    if (focusItem) setTimeout(() => { const el = document.getElementById('it-' + focusItem); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }, 50);
  }

  // ---------- Escuchar (lectura en voz alta) ----------
  const qText = (q, i) => `Pregunta ${i + 1}. ${q.q}. Respuesta: ${(q.a || '').trim() || 'sin responder'}.`;
  async function itemText(it) {
    const parts = [(it.kind === 'video' ? 'Vídeo: ' : 'Documento: ') + (it.title || it.name || 'sin título') + '.'];
    if ((it.note || '').trim()) parts.push('Notas: ' + it.note.trim());
    if (it.src === 'file' && it.kind !== 'video') {
      if (!PATTS.canRead(it.name, it.mime)) {
        if (!/^(image|audio|video)\//.test(it.mime || '')) toast('Este formato no se puede leer en voz alta (sí: texto, Markdown, HTML, PDF y Word .docx). Se leen el título y las notas.', 5000);
      } else {
        const b = await blobOf(it); if (!b) toast('El archivo no está en este móvil; se leen el título y las notas.', 4000);
        else { const slow = /pdf|docx/.test(PATTS.kindOf(it.name, it.mime)); if (slow) toast('Preparando lectura del documento…', 20000); try { const t = (await PATTS.extract(b, it.name, it.mime)).trim(); if (slow) $('#toast-root').innerHTML = ''; if (t) parts.push(t); else toast('El documento no tiene texto legible.', 4000); } catch (err) { toast(/red|Failed|fetch/i.test(String(err && err.message)) ? 'Para leer PDF o Word hace falta conexión la primera vez.' : (err && err.message) || 'No se pudo leer el documento', 5000); } }
      }
    }
    return parts;
  }
  async function sayEntry(e, a, q, it) {
    if (!window.PATTS || !PATTS.supported) return toast('Este navegador no puede leer en voz alta. Usa Chrome en Android.', 4000);
    const head = [`${e.title || 'Entrada sin título'}. ${fmtDate(e.date)}.`];
    const note = (e.note || '').trim() ? ['Comentarios. ' + e.note.trim()] : [];
    const qs = e.questions.length ? ['Preguntas y respuestas.', ...e.questions.map(qText)] : [];
    if (a === 'saynote') return note.length ? PATTS.play(note, '💭 Comentarios') : toast('No hay comentarios escritos');
    if (a === 'sayqs') return PATTS.play(qs, '❓ Preguntas y respuestas');
    if (a === 'sayq') return PATTS.play([qText(q, e.questions.indexOf(q))], '❓ Pregunta ' + (e.questions.indexOf(q) + 1));
    if (a === 'sayit') { const h = location.hash, t = await itemText(it); if (location.hash !== h) return; return PATTS.play(t, '📎 ' + (it.title || it.name || 'Documento')); }
    const h = location.hash, items = [];
    for (const x of e.items) items.push(...(await itemText(x)));
    if (location.hash !== h) return;
    PATTS.play([...head, ...note, ...qs, ...items], '📖 ' + (e.title || fmtDate(e.date)));
  }

  function editQuestion(e, q, rer) {
    const el = sheet(`<h2>${q ? 'Editar pregunta' : 'Nueva pregunta'}</h2>
      <textarea id="qt" style="min-height:110px" placeholder="Escribe la pregunta…">${esc(q ? q.q : '')}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="qmic">🎤 Dictar</button></div>
      <div class="row" style="margin-top:12px">${q ? '<button class="btn danger" id="del">🗑 Borrar</button>' : ''}<span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Guardar</button></div>`);
    $('#qt', el).focus();
    $('#qmic', el).onclick = (ev) => toggleDictation(ev.currentTarget, $('#qt', el));
    $('#cn', el).onclick = closeSheet;
    $('#ok', el).onclick = () => { const v = $('#qt', el).value.trim(); if (!v) return toast('Escribe la pregunta'); if (q) q.q = v; else e.questions.push({ id: uid(), q: v, a: '' }); saveData(); closeSheet(); rer(); };
    if (q) $('#del', el).onclick = () => { if (!confirm((q.a || '').trim() ? 'Esta pregunta tiene respuesta. ¿Borrarla igualmente?' : '¿Borrar esta pregunta?')) return; e.questions = e.questions.filter((x) => x !== q); saveData(); closeSheet(); rer(); };
  }

  async function storeFiles(e, files, kind) {
    await persist();
    for (const f of files) {
      const it = { id: uid(), kind: kind || (/^video\//.test(f.type) ? 'video' : 'doc'), src: 'file', url: '', name: f.name || 'archivo', mime: f.type || '', size: f.size, title: (f.name || 'archivo').replace(/\.[^.]+$/, ''), note: '', watched: false, added: Date.now() };
      await putBlob(it.id, f); e.items.push(it);
    }
    saveData();
  }
  function addItem(e, kind, rer) {
    const V = kind === 'video';
    const el = sheet(`<h2>${V ? '🎬 Añadir vídeo' : '📎 Añadir documento'}</h2>
      <div class="filters"><button class="btn sm pri" data-k="file">📱 Del móvil</button><button class="btn sm" data-k="url">🔗 Enlace</button></div>
      <div id="kfile"><input type="file" id="vf" ${V ? 'accept="video/*"' : 'multiple'}><p class="small muted" id="vfi">${V ? 'El vídeo se guarda solo en este móvil.' : 'Puedes elegir uno o varios archivos (PDF, fotos, Word, audios…). Se guardan solo en este móvil.'}</p></div>
      <div id="kurl" hidden><label class="f" for="vu">Enlace${V ? ' (YouTube, Vimeo, Drive…)' : ''}</label><input type="text" id="vu" inputmode="url" placeholder="https://…">
        <label class="f" for="vt">Título</label><input type="text" id="vt" placeholder="${V ? 'Título del vídeo' : 'Nombre del documento'}"></div>
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn" id="cn">Cancelar</button><button class="btn pri" id="ok">Guardar</button></div>`);
    let mode = 'file';
    el.querySelector('.filters').onclick = (ev) => { const b = ev.target.closest('[data-k]'); if (!b) return; mode = b.dataset.k; el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('pri', x === b)); $('#kurl', el).hidden = mode !== 'url'; $('#kfile', el).hidden = mode !== 'file'; };
    $('#vf', el).onchange = async () => {
      const fs = [...$('#vf', el).files]; if (!fs.length) return; const tot = fs.reduce((s, f) => s + f.size, 0);
      const est = await estimate(); const free = est ? est.quota - est.usage : Infinity;
      $('#vfi', el).innerHTML = fs.map((f) => `<b>${esc(f.name)}</b> · ${mb(f.size)}`).join('<br>') + (tot > 300 * 1048576 ? '<br>⚠️ Ocupará mucho espacio en el móvil.' : '') + (tot > free ? '<br>⚠️ Puede que no haya espacio suficiente.' : '');
    };
    $('#cn', el).onclick = closeSheet;
    $('#ok', el).onclick = async () => {
      if (mode === 'url') {
        let u = $('#vu', el).value.trim(); if (!u) return toast('Pega el enlace'); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        e.items.push({ id: uid(), kind, src: 'url', url: u, name: '', mime: '', size: 0, title: $('#vt', el).value.trim() || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), note: '', watched: false, added: Date.now() });
        saveData(); closeSheet(); toast(V ? 'Vídeo añadido' : 'Enlace añadido'); return rer();
      }
      const fs = [...$('#vf', el).files]; if (!fs.length) return toast(V ? 'Elige un vídeo del móvil' : 'Elige un archivo');
      $('#ok', el).disabled = true; $('#ok', el).innerHTML = '<span class="spin"></span> Guardando…';
      try { await storeFiles(e, fs, kind); } catch (_) { saveData(); $('#ok', el).disabled = false; $('#ok', el).textContent = 'Guardar'; return toast('No se pudo guardar: falta espacio en el móvil', 4000); }
      closeSheet(); toast(fs.length > 1 ? fs.length + ' archivos añadidos' : 'Añadido'); rer();
    };
  }

  // ---------- Archivos (repositorio) ----------
  function viewFiles() {
    let f = viewFiles.f || 'all';
    $('#app').innerHTML = `<h1>Archivos</h1><p class="small muted" style="margin-top:-4px">Todos los vídeos y documentos de tus entradas.</p>
      <div class="filters">${[['all', 'Todo'], ['video', '🎬 Vídeos'], ['doc', '📎 Documentos']].map(([k, t]) => `<button class="btn sm ${k === f ? 'pri' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
      <input type="search" id="fq" placeholder="Buscar por nombre o entrada…" value="${esc(viewFiles.q || '')}"><div id="fl"></div><p class="small muted" id="stor"></p>`;
    const draw = () => {
      const q = norm((viewFiles.q = $('#fq').value.trim()));
      const list = allItems().filter(({ it, e }) => (f === 'all' || (f === 'video' ? it.kind === 'video' : it.kind !== 'video')) && (!q || norm([it.title, it.name, it.note, it.url, e.title].join(' ')).includes(q)))
        .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.it.added - a.it.added);
      $('#fl').innerHTML = list.length ? `<div class="card" style="padding:4px 12px">${list.map(({ it, e }) => `<a class="vid" href="#/e/${e.id}/${it.id}" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="ic">${icon(it)}</span><span class="grow" style="min-width:0"><b class="ell">${esc(it.title || it.name || 'Sin título')}</b><br><span class="small muted">${esc(fmtDate(e.date))} · ${esc(e.title || 'Sin título')}${it.src === 'file' ? ' · ' + mb(it.size || 0) : ''}</span></span>${it.kind === 'video' ? `<span class="pill ${it.watched ? 'completed' : ''}">${it.watched ? 'Visto' : 'Sin ver'}</span>` : ''}</a>`).join('')}</div>`
        : '<p class="muted">No hay archivos aquí todavía. Añádelos desde una entrada del Diario.</p>';
    };
    $('.filters').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; viewFiles.f = b.dataset.f; viewFiles(); };
    $('#fq').oninput = draw; draw(); storageLine($('#stor'));
  }
  async function storageLine(el) { const e = await estimate(); if (!e || !el) return; let p = false; try { p = await navigator.storage.persisted(); } catch (_) {} el.textContent = `Espacio usado en el móvil: ${mb(e.usage || 0)} de ${mb(e.quota || 0)}${p ? ' · almacenamiento protegido ✓' : ''}.`; }

  // ---------- Compartir desde otras apps (WhatsApp) ----------
  async function handleShare() {
    let sh = null; try { sh = await getBlob('pending-share'); } catch (_) {}
    if (!sh) { history.replaceState(null, '', '#/'); return; }
    const text = [sh.title, sh.text, sh.url].filter((x) => (x || '').trim()).filter((x, i, a) => a.indexOf(x) === i).join('\n');
    const recent = sorted().slice(0, 30);
    const el = sheet(`<h2>📥 Guardar lo compartido</h2>
      ${sh.files.length ? `<p>${sh.files.map((f) => '📎 ' + esc(f.name) + ' · ' + mb(f.size)).join('<br>')}</p>` : ''}${text ? `<p class="small muted" style="white-space:pre-wrap">${esc(text.slice(0, 300))}</p>` : ''}
      <button class="btn pri block" id="snew">＋ En una entrada nueva</button>
      ${recent.length ? `<label class="f" for="sold">…o en una entrada existente</label><select id="sold">${recent.map((e) => `<option value="${e.id}">${esc(new Date(e.date + 'T12:00').toLocaleDateString('es-ES'))} · ${esc(e.title || 'Sin título')}</option>`).join('')}</select><button class="btn block" id="sadd" style="margin-top:8px">Añadir a esa entrada</button>` : ''}
      <button class="btn block ghost" id="scn" style="margin-top:8px">Descartar</button>`);
    const finish = async (e) => {
      if (text) e.note = e.note.trim() ? e.note + '\n\n' + text : text;
      if (sh.url && /^https?:/.test(sh.url) && !sh.files.length) e.items.push({ id: uid(), kind: parseUrl(sh.url).embed ? 'video' : 'doc', src: 'url', url: sh.url, name: '', mime: '', size: 0, title: sh.title || sh.url.slice(0, 60), note: '', watched: false, added: Date.now() });
      sh.files.forEach((f) => e.items.push({ id: f.id, kind: /^video\//.test(f.type) ? 'video' : 'doc', src: 'file', url: '', name: f.name, mime: f.type, size: f.size, title: f.name.replace(/\.[^.]+$/, ''), note: '', watched: false, added: Date.now() }));
      saveData(); await delBlob('pending-share').catch(() => {}); closeSheet(); toast('Guardado en el diario ✓'); location.hash = '#/e/' + e.id;
    };
    $('#snew', el).onclick = () => newEntry({ type: 'whatsapp', title: (sh.files[0]?.name || sh.title || (sh.text || '').split('\n')[0] || '').slice(0, 80) }, finish);
    if ($('#sadd', el)) $('#sadd', el).onclick = () => finish(entryOf($('#sold', el).value));
    $('#scn', el).onclick = async () => { await delBlob('pending-share').catch(() => {}); for (const f of sh.files) await delBlob(f.id).catch(() => {}); closeSheet(); history.replaceState(null, '', '#/'); };
  }

  // ---------- Dictado ----------
  let rec = null, recBtn = null, recTxt = '';
  function stopDictation() { if (rec) { const r = rec; rec = null; try { r.stop(); } catch (_) {} } if (recBtn) { recBtn.classList.remove('on'); recBtn.textContent = recTxt; recBtn = null; } }
  function toggleDictation(btn, ta) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Este navegador no permite dictado. Usa Chrome en Android.');
    if (!ta) return; if (recBtn === btn) return stopDictation(); stopDictation();
    const r = new SR(); r.lang = 'es-ES'; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
      let t = e.results[i][0].transcript.trim(); if (!t) continue;
      const v = ta.value; const sep = !v ? '' : /[.!?]\s*$/.test(v) ? ' ' : /\s$/.test(v) ? '' : ' ';
      if (!v || /[.!?]\s*$/.test(v)) t = t.charAt(0).toUpperCase() + t.slice(1);
      ta.value = v + sep + t; ta.dispatchEvent(new Event('input', { bubbles: true })); } };
    r.onerror = (e) => { if (e.error === 'not-allowed') { toast('Permite el micrófono para dictar'); stopDictation(); } };
    r.onend = () => { if (rec === r) { try { r.start(); } catch (_) { stopDictation(); } } };
    rec = r; recBtn = btn; recTxt = btn.textContent; btn.classList.add('on'); btn.textContent = '⏹ Parar';
    try { r.start(); toast('Habla… se irá añadiendo el texto'); } catch (_) { stopDictation(); }
  }

  // ---------- Buscar ----------
  function viewSearch() {
    $('#app').innerHTML = `<h1>Buscar</h1><input type="search" id="s" placeholder="En títulos, comentarios, preguntas, archivos…" value="${esc(viewSearch.q || '')}"><div id="res"></div>`;
    const hl = (text, q) => { const nt = norm(text), nq = norm(q); let out = '', i = 0, k; while (nq && (k = nt.indexOf(nq, i)) !== -1) { out += esc(text.slice(i, k)) + '<mark>' + esc(text.slice(k, k + q.length)) + '</mark>'; i = k + q.length; } return out + esc(text.slice(i)); };
    const snip = (text, q) => { if (text.length < 220) return text; const k = norm(text).indexOf(norm(q)); const s = Math.max(0, k - 80); return (s ? '…' : '') + text.slice(s, s + 220) + (s + 220 < text.length ? '…' : ''); };
    const run = () => {
      const q = (viewSearch.q = $('#s').value.trim());
      if (q.length < 2) { $('#res').innerHTML = '<p class="muted">Escribe al menos 2 letras.</p>'; return; }
      const nq = norm(q), has = (s) => norm(s).includes(nq), out = []; let count = 0;
      sorted().forEach((e) => {
        const parts = [];
        if (has(e.title)) parts.push(`<p><b>${hl(e.title, q)}</b></p>`);
        if (has(e.note)) parts.push(`<p style="font-family:var(--serif)">💭 ${hl(snip(e.note, q), q)}</p>`);
        e.questions.forEach((x) => { const inA = has(x.a); if (has(x.q) || inA) parts.push(`<p><b>❓ ${hl(x.q, q)}</b></p>${inA ? `<p style="font-family:var(--serif)">${hl(snip(x.a, q), q)}</p>` : ''}`); });
        e.items.forEach((it) => { const t = [it.title, it.name, it.note, it.url].filter(Boolean).join(' · '); if (has(t)) parts.push(`<p>${icon(it)} ${hl(snip(t, q), q)}</p>`); });
        if (parts.length) { count += parts.length; out.push(`<a class="card hit" href="#/e/${e.id}"><b style="color:var(--accent)">${esc(fmtDate(e.date))}${e.title && !has(e.title) ? ' · ' + esc(e.title) : ''}</b>${parts.join('')}</a>`); }
      });
      $('#res').innerHTML = out.length ? `<p class="muted small">${count} coincidencia${count === 1 ? '' : 's'} en ${out.length} entrada${out.length === 1 ? '' : 's'}</p>` + out.join('') : '<p class="muted">Sin resultados.</p>';
    };
    $('#s').oninput = run; run(); if (!viewSearch.q) $('#s').focus();
  }

  // ---------- Exportar ----------
  const allMd = () => '# Programa de Abundancia — Diario\n\n' + sorted().map((e) => `## ${fmtDate(e.date)} — ${e.title || 'Sin título'}\n_${(TYPES[e.type] || '').replace(/^\S+\s/, '')}_\n\n`
    + (e.note.trim() ? e.note.trim() + '\n\n' : '') + e.questions.map((q, i) => `**${i + 1}. ${q.q}**\n\n${(q.a || '').trim() || '_(sin responder)_'}\n\n`).join('')
    + e.items.map((it) => `- ${it.kind === 'video' ? 'Vídeo' : 'Documento'}: ${it.title || it.name}${it.src === 'url' ? ' — ' + it.url : ' (archivo: ' + it.name + ')'}${(it.note || '').trim() ? '\n  ' + it.note.trim().replace(/\n/g, '\n  ') : ''}\n`).join('') + '\n').join('---\n\n');
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  async function shareText(text, title, fname) {
    try { if (navigator.canShare) { const f = new File([text], fname, { type: 'text/markdown' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title }); return; } } } catch (e) { if (e.name === 'AbortError') return; }
    download(fname, new Blob([text], { type: 'text/markdown' })); toast('Archivo descargado');
  }
  // ZIP sin compresión (formato "stored"), suficiente para fotos/vídeos/PDF que ya vienen comprimidos.
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function makeZip(files) {
    const parts = [], central = []; let off = 0; const enc = new TextEncoder();
    for (const f of files) {
      const name = enc.encode(f.name), blob = f.data instanceof Blob ? f.data : new Blob([f.data]);
      const crc = crc32(new Uint8Array(await blob.arrayBuffer())), size = blob.size;
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(h, name, blob); central.push(c, name); off += 30 + name.length + size;
    }
    const cs = central.reduce((s, x) => s + x.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  async function readZip(blob) {
    const tail = new DataView(await blob.slice(Math.max(0, blob.size - 65558)).arrayBuffer()); let p = tail.byteLength - 22;
    while (p >= 0 && tail.getUint32(p, true) !== 0x06054b50) p--; if (p < 0) throw new Error('zip');
    const n = tail.getUint16(p + 10, true), cs = tail.getUint32(p + 12, true), co = tail.getUint32(p + 16, true);
    const cd = new DataView(await blob.slice(co, co + cs).arrayBuffer()), dec = new TextDecoder(), out = {}; let q = 0;
    for (let i = 0; i < n; i++) {
      const method = cd.getUint16(q + 10, true), size = cd.getUint32(q + 20, true), nl = cd.getUint16(q + 28, true), el = cd.getUint16(q + 30, true), cl = cd.getUint16(q + 32, true), lo = cd.getUint32(q + 42, true);
      const name = dec.decode(new Uint8Array(cd.buffer, q + 46, nl)); q += 46 + nl + el + cl;
      const lh = new DataView(await blob.slice(lo, lo + 30).arrayBuffer()), start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      if (method === 0) out[name] = blob.slice(start, start + size);
    }
    return out;
  }
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\n\r]+/g, '_').trim().slice(0, 60) || 'archivo';
  async function exportZip(btn) {
    btn.disabled = true; const t0 = btn.textContent; btn.innerHTML = '<span class="spin"></span> Preparando…';
    try {
      const files = [], paths = {}; let missing = 0;
      for (const { it, e } of allItems()) {
        if (it.src !== 'file') continue; const b = await getBlob(it.id); if (!b) { missing++; continue; }
        const path = `archivos/${e.date} ${safe(e.title)}/${it.id.slice(0, 6)}-${safe(it.name)}`; paths[it.id] = path; files.push({ name: path, data: b });
      }
      files.unshift({ name: 'diario.md', data: new Blob([allMd()]) }, { name: 'datos.json', data: new Blob([JSON.stringify({ app: 'programa-abundancia', exported: new Date().toISOString(), data, files: paths, settings: { big: settings.big } }, null, 2)]) });
      download(`programa-abundancia-completo-${isoToday()}.zip`, await makeZip(files)); toast('Copia completa descargada' + (missing ? ` (${missing} archivo${missing === 1 ? '' : 's'} no estaba${missing === 1 ? '' : 'n'} en el móvil)` : ''), 4000);
    } catch (_) { toast('No se pudo crear el ZIP (¿demasiado grande para la memoria del móvil?)', 4500); }
    btn.disabled = false; btn.textContent = t0;
  }
  async function importFile(f) {
    let j, zipFiles = null;
    if (/\.zip$/i.test(f.name) || f.type.includes('zip')) { zipFiles = await readZip(f); j = JSON.parse(await zipFiles['datos.json'].text()); } else j = JSON.parse(await f.text());
    let d = j.data || j; if (!(d.v === 2 && Array.isArray(d.entries)) && !(d.start && typeof d.w === 'object')) throw 0;
    if (!confirm('Esto reemplazará los datos actuales por los de la copia. ¿Continuar?')) return false;
    d = migrate(d);
    if (zipFiles && j.files) for (const [id, path] of Object.entries(j.files)) if (zipFiles[path]) await putBlob(id, zipFiles[path]);
    data = d; fix(); saveData(); return true;
  }

  // ---------- Ajustes ----------
  function viewSettings() {
    const nFiles = allItems().filter(({ it }) => it.src === 'file').length;
    $('#app').innerHTML = `<h1>Ajustes</h1>
      <div class="card"><h3>Lectura</h3><label class="switch"><span>Letra grande</span><input type="checkbox" id="big" ${settings.big ? 'checked' : ''}></label></div>
      <div class="card"><h3>🔒 Bloqueo</h3><p class="small muted">Pide huella o PIN al abrir la app.</p><button class="btn block" id="lk">${PALock.isEnabled() ? 'Desactivar bloqueo' : 'Activar huella / PIN'}</button></div>
      <div class="card"><h3>🗂️ Almacenamiento</h3><p class="small muted" id="stor">${nFiles} archivo${nFiles === 1 ? '' : 's'} guardado${nFiles === 1 ? '' : 's'} en el móvil.</p>
        <button class="btn block" id="pers">Proteger almacenamiento (persistente)</button></div>
      <div class="card"><h3>💾 Copia de seguridad</h3>
        <p class="small muted">La copia JSON lleva entradas, comentarios, preguntas y enlaces, pero <b>no los archivos</b>. Para llevarlo todo, usa «Exportar todo con archivos» (ZIP).</p>
        <button class="btn block pri" id="ez">📦 Exportar todo con archivos (ZIP)</button>
        <button class="btn block" id="ej" style="margin-top:8px">⬇️ Exportar copia (JSON, sin archivos)</button>
        <button class="btn block" id="ij" style="margin-top:8px">⬆️ Importar copia (JSON o ZIP)</button><input type="file" id="if" accept="application/json,.json,application/zip,.zip" hidden>
        <button class="btn block" id="em" style="margin-top:8px">📤 Exportar como texto (Markdown)</button></div>
      <div class="card small muted"><h3 style="color:var(--text)">📥 Desde WhatsApp</h3>Con la app instalada en la pantalla de inicio, en WhatsApp mantén pulsado un mensaje o archivo → Compartir → «Abundancia».</div>
      <div class="card"><button class="btn block danger ghost" id="rs">Borrar todos los datos</button></div>
      <p class="small muted" style="text-align:center">Programa de Abundancia · v4 · datos solo en este dispositivo</p>`;
    estimate().then((e) => { if (e && $('#stor')) $('#stor').textContent += ` Espacio usado: ${mb(e.usage || 0)} de ${mb(e.quota || 0)}.`; });
    $('#big').onchange = (e) => { settings.big = e.target.checked; saveSet(); document.body.classList.toggle('big', settings.big); };
    $('#lk').onclick = () => { PALock.openSettings((m) => { toast(m); viewSettings(); }); };
    $('#pers').onclick = async () => toast((await persist()) ? 'Almacenamiento protegido ✓' : 'El navegador no lo ha concedido (instala la app en la pantalla de inicio)', 3500);
    $('#ez').onclick = (e) => exportZip(e.currentTarget);
    $('#ej').onclick = () => { download(`programa-abundancia-${isoToday()}.json`, new Blob([JSON.stringify({ app: 'programa-abundancia', exported: new Date().toISOString(), aviso: 'Los archivos guardados en el móvil no se incluyen en esta copia.', data, settings: { big: settings.big } }, null, 2)], { type: 'application/json' })); if (nFiles) toast('Copia descargada. Los archivos no van incluidos (usa el ZIP).', 4000); };
    $('#ij').onclick = () => $('#if').click();
    $('#if').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { if (await importFile(f)) { toast('Copia importada ✓'); viewSettings(); } } catch (_) { toast('El archivo no es una copia válida'); } };
    $('#em').onclick = () => shareText(allMd(), 'Programa de Abundancia', `programa-abundancia-${isoToday()}.md`);
    $('#rs').onclick = async () => { if (confirm('¿Borrar TODO el diario de este móvil (incluidos los archivos)? Haz antes una copia.') && confirm('¿Seguro? No se puede deshacer.')) { data = { v: 2, entries: [] }; saveData(); await clearBlobs().catch(() => {}); location.hash = '#/'; route(); } };
  }

  window.addEventListener('hashchange', () => { if (!PALock.isLocked()) route(); });
  PALock.gate(() => route());
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
