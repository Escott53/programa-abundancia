/* Programa de Abundancia — bloqueo de acceso (huella vía WebAuthn + PIN de respaldo).
   No cifra los datos: solo impide ver la app sin verificar.
   Todas las claves usan el prefijo 'pa-' (todas las apps comparten el mismo origen). */
(function (global) {
  'use strict';
  const CFG_KEY = 'pa-lock-config';
  const ITER = 310000;
  const BG_MS = 60 * 1000;
  const enc = new TextEncoder();
  const b64 = (u8) => { let s = ''; const b = new Uint8Array(u8); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (_) { return null; } };
  const saveCfg = (c) => c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY);
  const isEnabled = () => !!(cfg() && cfg().hash);

  async function hashPin(pin, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256));
  }
  const eq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  const wait = (c) => c && c.lockUntil ? Math.max(0, c.lockUntil - Date.now()) : 0;

  async function checkPin(pin) {
    const c = cfg(); if (!c) return true;
    if (wait(c) > 0) { const e = new Error('lockout'); e.wait = wait(c); throw e; }
    const ok = eq(await hashPin(pin, unb64(c.salt), c.iter), c.hash);
    if (ok) { c.fails = 0; c.lockUntil = 0; }
    else { c.fails = (c.fails || 0) + 1; if (c.fails >= 5) c.lockUntil = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (c.fails - 5)); }
    saveCfg(c);
    if (!ok) { const e = new Error('bad'); e.fails = c.fails; e.wait = wait(c); throw e; }
    return true;
  }

  async function bioAvailable() {
    try { return !!(global.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
    catch (_) { return false; }
  }
  async function registerBio() {
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'Programa de Abundancia' },
      user: { id: rand(16), name: 'programa-abundancia', displayName: 'Programa de Abundancia' },
      challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none', timeout: 60000,
    } });
    if (!cred) throw new Error('Cancelado');
    return b64(cred.rawId);
  }
  async function verifyBio() {
    const c = cfg(); if (!c || !c.credId) throw new Error('Huella no configurada');
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: rand(32), userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: unb64(c.credId), transports: ['internal', 'hybrid'] }],
    } });
    if (!cred) throw new Error('Cancelado');
    if (!(new Uint8Array(cred.response.authenticatorData)[32] & 0x04)) throw new Error('El dispositivo no verificó al usuario');
    return true;
  }

  // ---------- UI ----------
  const css = `
  body.pa-locked #app, body.pa-locked #sheet-root, body.pa-locked #toast-root { display: none !important; }
  .mtl { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px;
    background: linear-gradient(160deg, var(--bg, #f5f3ff), var(--bg2, #ede9fe)); color: var(--text, #1e1b2e); font: inherit; }
  .mtl.dim { background: rgba(15, 13, 26, .55); backdrop-filter: blur(6px); }
  .mtl-box { width: 100%; max-width: 360px; text-align: center; background: var(--card, #fff); border-radius: 26px; padding: 28px 22px; box-shadow: 0 20px 50px -20px rgba(76,29,149,.4); }
  .mtl-ico { font-size: 54px; line-height: 1; margin-bottom: 10px; }
  .mtl h2 { margin: 0 0 6px; font-size: 22px; } .mtl p { margin: 0 0 18px; color: var(--muted, #6b6883); font-size: 15px; line-height: 1.45; }
  .mtl .msg { min-height: 20px; color: var(--danger, #e11d48); font-size: 14px; margin: 8px 0 0; font-weight: 600; }
  .mtl input { width: 100%; box-sizing: border-box; font-size: 26px; letter-spacing: 10px; text-align: center; padding: 12px; border-radius: 16px;
    border: 2px solid var(--line, #ddd); background: var(--card-2, #faf9ff); color: inherit; margin-bottom: 10px; }
  .mtl button { display: block; width: 100%; padding: 14px; border-radius: 16px; border: 0; font: inherit; font-size: 16px; font-weight: 700; margin-top: 10px; cursor: pointer;
    background: var(--card-2, #f3f0ff); color: var(--text, #1e1b2e); }
  .mtl button.pri { background: linear-gradient(135deg, var(--accent, #7c3aed), var(--accent-2, #db2777)); color: #fff; }
  .mtl button[hidden], .mtl [hidden] { display: none !important; }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let locked = false, hiddenAt = 0, onUnlock = null, overlay = null;
  const isLocked = () => locked;

  function modal(html, dim) {
    const el = document.createElement('div'); el.className = 'mtl' + (dim ? ' dim' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="mtl-box">${html}</div>`; document.body.appendChild(el); return el;
  }
  const pinField = (id) => `<input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="••••">`;
  const waitTxt = (ms) => `Demasiados intentos. Espera ${Math.ceil(ms / 1000)} s.`;

  // Formulario de PIN reutilizable. Devuelve true si se verificó.
  function bindPin(el, onOk) {
    const inp = el.querySelector('#mtl-pin'), msg = el.querySelector('.msg');
    const go = async () => {
      if (!/^\d{4,6}$/.test(inp.value)) { msg.textContent = 'El PIN tiene de 4 a 6 cifras'; return; }
      try { await checkPin(inp.value); onOk(); }
      catch (e) { inp.value = ''; msg.textContent = e.wait ? waitTxt(e.wait) : `PIN incorrecto${e.fails ? ` (${e.fails} ${e.fails === 1 ? 'intento' : 'intentos'})` : ''}`; }
    };
    el.querySelector('[data-a="ok"]').onclick = go;
    inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }

  function showLock() {
    if (overlay) return;
    locked = true; document.body.classList.add('pa-locked');
    const app = document.getElementById('app'); if (app) app.innerHTML = '';
    const sr = document.getElementById('sheet-root'); if (sr) sr.innerHTML = '';
    const c = cfg(), hasBio = !!c.credId;
    overlay = modal(`<div class="mtl-ico">🔒</div><h2>Programa de Abundancia está bloqueada</h2>
      <p id="mtl-hint">${hasBio ? 'Toca el sensor de huella para entrar.' : 'Introduce tu PIN para entrar.'}</p>
      <div id="mtl-pinbox" ${hasBio ? 'hidden' : ''}>${pinField('mtl-pin')}<button class="pri" data-a="ok">Desbloquear</button></div>
      <button class="pri" data-a="bio" ${hasBio ? '' : 'hidden'}>👆 Usar huella</button>
      <button data-a="pin" ${hasBio ? '' : 'hidden'}>🔢 Usar PIN</button>
      <div class="msg" aria-live="polite"></div>`);
    overlay.id = 'pa-lock-screen';
    const msg = overlay.querySelector('.msg');
    const showPin = () => { overlay.querySelector('#mtl-pinbox').hidden = false; overlay.querySelector('[data-a="pin"]').hidden = true; overlay.querySelector('[data-a="bio"]').classList.remove('pri'); overlay.querySelector('#mtl-hint').textContent = 'Introduce tu PIN para entrar.'; overlay.querySelector('#mtl-pin').focus(); };
    const tryBio = async () => { msg.textContent = ''; try { await verifyBio(); unlock(); } catch (_) { if (overlay) msg.textContent = 'No se pudo verificar la huella. Reinténtalo o usa el PIN.'; } };
    overlay.querySelector('[data-a="bio"]').onclick = tryBio;
    overlay.querySelector('[data-a="pin"]').onclick = showPin;
    bindPin(overlay, unlock);
    if (hasBio) setTimeout(tryBio, 250); else setTimeout(() => overlay && overlay.querySelector('#mtl-pin').focus(), 50);
  }
  function unlock() {
    if (overlay) { overlay.remove(); overlay = null; }
    locked = false; document.body.classList.remove('pa-locked');
    const cb = onUnlock; if (cb) cb();
  }

  // Arranque: llama a cb cuando la app pueda mostrarse (al instante si no hay bloqueo).
  function gate(cb) {
    let first = true;
    onUnlock = () => { const f = first; first = false; cb(f); };
    if (isEnabled()) showLock(); else unlock();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && isEnabled() && !locked && Date.now() - hiddenAt > BG_MS) showLock();
    hiddenAt = 0;
  });

  // ---------- Ajustes ----------
  function enableFlow(toast) {
    const el = modal(`<div class="mtl-ico">🔐</div><h2>Crea un PIN de respaldo</h2>
      <p>Se usará si la huella falla. De 4 a 6 cifras.</p>
      <div id="s1">${pinField('mtl-p1')}</div><div id="s2" hidden>${pinField('mtl-p2')}</div>
      <button class="pri" data-a="next">Continuar</button><button data-a="cancel">Cancelar</button><div class="msg"></div>`, true);
    const msg = el.querySelector('.msg'); let p1 = null;
    el.querySelector('#mtl-p1').focus();
    el.querySelector('[data-a="cancel"]').onclick = () => el.remove();
    const next = async () => {
      if (p1 === null) {
        const v = el.querySelector('#mtl-p1').value;
        if (!/^\d{4,6}$/.test(v)) { msg.textContent = 'El PIN debe tener de 4 a 6 cifras'; return; }
        p1 = v; msg.textContent = ''; el.querySelector('#s1').hidden = true; el.querySelector('#s2').hidden = false;
        el.querySelector('h2').textContent = 'Repite el PIN'; el.querySelector('#mtl-p2').focus(); return;
      }
      if (el.querySelector('#mtl-p2').value !== p1) { msg.textContent = 'Los PIN no coinciden'; el.querySelector('#mtl-p2').value = ''; return; }
      el.querySelector('[data-a="next"]').disabled = true;
      const salt = rand(16);
      const c = { v: 1, salt: b64(salt), iter: ITER, hash: await hashPin(p1, salt, ITER), credId: null, fails: 0, lockUntil: 0, created: Date.now() };
      let note = 'Bloqueo activado solo con PIN (este dispositivo no admite huella)';
      if (await bioAvailable()) {
        try { c.credId = await registerBio(); note = 'Bloqueo con huella activado ✓'; }
        catch (_) { note = 'No se registró la huella: bloqueo activado solo con PIN'; }
      }
      saveCfg(c); el.remove(); toast && toast(note);
    };
    el.querySelector('[data-a="next"]').onclick = next;
    el.querySelectorAll('input').forEach((i) => { i.onkeydown = (e) => { if (e.key === 'Enter') next(); }; });
  }
  function disableFlow(toast) {
    const c = cfg(), hasBio = !!c.credId;
    const el = modal(`<div class="mtl-ico">🔓</div><h2>Desactivar bloqueo</h2><p>Verifica tu identidad para desactivarlo.</p>
      <div id="mtl-pinbox" ${hasBio ? 'hidden' : ''}>${pinField('mtl-pin')}<button class="pri" data-a="ok">Verificar PIN</button></div>
      <button class="pri" data-a="bio" ${hasBio ? '' : 'hidden'}>👆 Usar huella</button>
      <button data-a="pin" ${hasBio ? '' : 'hidden'}>🔢 Usar PIN</button>
      <button data-a="cancel">Cancelar</button><div class="msg"></div>`, true);
    const done = () => { saveCfg(null); el.remove(); toast && toast('Bloqueo desactivado'); };
    el.querySelector('[data-a="cancel"]').onclick = () => el.remove();
    el.querySelector('[data-a="pin"]').onclick = () => { el.querySelector('#mtl-pinbox').hidden = false; el.querySelector('[data-a="pin"]').hidden = true; el.querySelector('#mtl-pin').focus(); };
    el.querySelector('[data-a="bio"]').onclick = async () => { try { await verifyBio(); done(); } catch (_) { el.querySelector('.msg').textContent = 'No se pudo verificar la huella'; } };
    bindPin(el, done);
  }
  const openSettings = (toast) => (isEnabled() ? disableFlow : enableFlow)(toast);

  global.PALock = { gate, isEnabled, isLocked, openSettings, lockNow: () => isEnabled() && showLock() };
})(window);
