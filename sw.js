/* Service worker: red primero (siempre la última versión), caché si no hay conexión.
   Además recibe lo compartido desde otras apps (share_target POST ./share). */
const CACHE = 'pa-cache-v4';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './lock.js', './tts.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pa-cache-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const idbPut = (pairs) => new Promise((res, rej) => {
  const r = indexedDB.open('pa-videos', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('blobs');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const tx = r.result.transaction('blobs', 'readwrite'); const s = tx.objectStore('blobs'); pairs.forEach(([k, v]) => s.put(v, k)); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = tx.onabort = () => rej(tx.error); };
});
async function receiveShare(req) {
  try {
    const fd = await req.formData(), files = [], pairs = [];
    for (const f of fd.getAll('files')) if (f && typeof f === 'object' && f.size) {
      const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      pairs.push([id, f]); files.push({ id, name: f.name || 'archivo', type: f.type || '', size: f.size });
    }
    pairs.push(['pending-share', { title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', files, at: Date.now() }]);
    await idbPut(pairs);
  } catch (_) {}
  return Response.redirect(new URL('./#/compartido', self.registration.scope).href, 303);
}
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
