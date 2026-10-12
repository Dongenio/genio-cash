// Service worker: guarda os arquivos do app pra abrir rápido.
// Sempre tenta a versão nova da internet primeiro; se falhar, usa a guardada.
const CACHE = "genio-cash-v4";
const ARQUIVOS = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS))));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // banco de dados nunca é guardado
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request))
  );
});
