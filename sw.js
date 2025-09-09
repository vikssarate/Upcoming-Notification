const VERSION = 'v2.0.0';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './data/exams.json',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=> k===VERSION? null : caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  // Stale-while-revalidate for same-origin GETs
  if(req.method === 'GET' && new URL(req.url).origin === self.location.origin){
    e.respondWith(
      caches.match(req).then(cached=>{
        const fetchPromise = fetch(req).then(res=>{
          const copy = res.clone();
          caches.open(VERSION).then(cache=>cache.put(req, copy));
          return res;
        }).catch(()=>cached);
        return cached || fetchPromise;
      })
    );
  }
});
