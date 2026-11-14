const cacheName = 'devpulse-web-shell-031'
const shell = ['/', '/app.css', '/app.js', '/app.webmanifest', '/icon-192.png', '/icon-512.png']
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell))))
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('devpulse-web-shell-') && k!==cacheName).map(k=>caches.delete(k))))))
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if(event.request.method!=='GET' || url.origin!==location.origin || !shell.includes(url.pathname) || event.request.headers.has('Authorization')) return
  event.respondWith(fetch(event.request).catch(()=>caches.match(url.pathname)))
})
