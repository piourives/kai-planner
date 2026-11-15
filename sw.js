// ============================================================
//  Service worker do KAI Planner
//  Serve só para: (1) o app poder ser instalado e (2) abrir
//  mais rápido / mostrar a tela mesmo com internet ruim.
//  NÃO tem notificações, push, lembretes nem sons.
// ============================================================
const VERSION = 'kai-v9';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/db.js', 'js/config.js', 'js/icons.js', 'js/util.js', 'js/ui.js',
  'js/views/inicio.js', 'js/views/config.js', 'js/views/escola.js',
  'js/settings.js', 'js/study.js', 'js/importer.js', 'js/data/defaults.js',
  'js/training.js', 'js/views/academia.js',
  'js/events.js', 'js/views/calendario.js',
  'js/images.js', 'js/views/futuro.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Arquivos do próprio site: tenta a internet primeiro (pra pegar
// a versão nova) e, se falhar, usa a cópia guardada.
// Dados do Supabase nunca são guardados aqui.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // sempre confere se tem versão nova
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
