/* Service worker V00.15.1: l'app si apre anche senza rete.
   Rete per prima (si vede sempre l'ultima versione), copia salvata come ripiego.
   I dati (Supabase) non passano mai da qui: la copia dei turni la gestisce l'adattatore. */
const V='V00.15.1',CACHE='turni-'+V;
const SHELL=['./','index.html','manifest.webmanifest','css/tema.css','css/turni.css','css/stampa.css','js/config.js','js/supabase.config.js',
  'js/core/util.js','js/core/store.js','js/core/supabase.js','js/core/logo.js','js/core/stampa.js','js/core/mail.js','js/core/accessi.js','js/core/ore.js','js/core/verifiche.js','js/moduli/anagrafica.js','js/moduli/utenti.js','js/moduli/mail.js','js/moduli/strumenti.js','js/moduli/registro.js','js/moduli/ruoli.js','js/moduli/help.js','js/moduli/turni.js','js/app.js',
  'icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys()
  .then(ks=>Promise.all(ks.filter(k=>k.startsWith('turni-')&&k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.hostname.endsWith('.supabase.co'))return;
  const stessa=u.origin===location.origin;
  if(!stessa&&!['cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return;
  e.respondWith(fetch(stessa?new Request(r,{cache:'no-cache'}):r).then(res=>{
      if(res&&(res.ok||res.type==='opaque')){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c))}
      return res;
    }).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
