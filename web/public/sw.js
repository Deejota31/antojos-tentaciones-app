// Service worker mínimo para que el panel se instale como app.
// - Navegación: primero la red (así siempre carga la última versión publicada); sin red, la última copia guardada.
// - Archivos con hash de /assets/: se guardan una vez (nunca cambian).
// - La API de Apps Script (otro dominio) nunca pasa por aquí: los datos siempre son en vivo.
const CACHE = 'antojos-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copia = res.clone()
      caches.open(CACHE).then(c => c.put('./', copia))
      return res
    }).catch(() => caches.match('./').then(r => r || Response.error())))
    return
  }
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)) }
      return res
    })))
  }
})
