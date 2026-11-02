// Service worker: faz o app abrir na hora, mesmo com internet lenta.
// Estratégia "mostra o guardado e atualiza por trás" (stale-while-revalidate):
// abre com a cópia salva e, em paralelo, baixa a versão nova pra próxima vez.
// O banco de dados (Supabase) NUNCA é guardado aqui: sempre vai na internet.
const CACHE = "genio-cash-v7";
const ARQUIVOS = ["./", "index.html", "style.css?v=7", "app.js?v=7", "config.js?v=7", "manifest.webmanifest", "icon-192.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
const DE_FORA = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];   // biblioteca e fontes

self.addEventListener("install", e => {
  self.skipWaiting();                                        // versão nova entra sem precisar fechar o app
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).catch(() => {}));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const meu = url.origin === location.origin, deFora = DE_FORA.includes(url.hostname);
  if (!meu && !deFora) return;                               // Supabase e outros: direto na internet

  // A página em si: tenta a internet primeiro (pega atualização), com limite de 3 s
  if (e.request.mode === "navigate") {
    e.respondWith(Promise.race([
      fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put("./", c)); return r; }),
      new Promise((_, nao) => setTimeout(nao, 3000))
    ]).catch(() => caches.match("./").then(r => r || fetch(e.request))));
    return;
  }
  // Arquivos (css, js, fontes, ícones): guardado na hora + atualiza por trás
  e.respondWith(caches.open(CACHE).then(async k => {
    const guardado = await k.match(e.request);
    const daRede = fetch(e.request).then(r => { if (r.ok || r.type === "opaque") k.put(e.request, r.clone()); return r; }).catch(() => guardado);
    return guardado || daRede;
  }));
});
