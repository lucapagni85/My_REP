/* Shell: sceglie l'adattatore dati, gestisce il login all'avvio (adattatori remoti) e monta il contenitore con il menu per ruolo. */
function schermataErrore(root,titolo,msg){
  root.innerHTML=`<div class="panel login"><h2>${esc(titolo)}</h2><p style="margin:0;color:var(--muted)">${esc(msg)}</p><button class="go" id="rt" style="margin:0">Riprova</button></div>`;
  $('#rt').onclick=()=>location.reload();
}
function schermataLogin(root){
  return new Promise(ok=>{
    root.innerHTML=`<div class="panel login"><h2>Accesso</h2><p style="margin:0;color:var(--muted)">Servizio di reperibilità · accesso riservato al personale autorizzato.</p>
      <label>Email<input id="lu" type="email" autocomplete="username"></label>
      <label>Password<input id="lp" type="password" autocomplete="current-password"></label>
      <div class="err" id="le" role="alert"></div><button class="go" id="lg2" style="margin:0">Accedi</button></div>`;
    const go=async()=>{
      const b=$('#lg2');b.disabled=true;$('#le').textContent='';
      let r;try{r=await Store.login($('#lu').value.trim(),$('#lp').value)}catch(e){r={ok:false,errore:'Connessione non riuscita: '+(e.message||e)}}
      if(r.ok)ok();else{$('#le').textContent=r.errore;b.disabled=false}
    };
    $('#lg2').onclick=go;$('#lp').onkeydown=e=>{if(e.key==='Enter')go()};$('#lu').focus();
  });
}
/* ===== Contenitore con menu per ruolo (V00.09) ===== */
const SEZIONI=[
  {id:'turni',t:'Turni'},
  {id:'addetto',t:'Addetto',l:'A'},{id:'coordinatore',t:'Coordinatore',l:'C'},{id:'supervisore',t:'Supervisore',l:'S'},
  {id:'help',t:'Help'},
  {id:'amm',t:'Amministrazione',admin:true}
];
function sezioniVisibili(){
  const v=schedeVisibili();
  return SEZIONI.filter(s=>s.l?v[s.l]:s.admin?tuttiAdmin():true);
}
function contenitore(root){
  root.innerHTML='<nav class="menu" id="menu" aria-label="Sezioni"></nav><div id="avviso"></div><div id="sez"></div>';
  if(Store.richiedeLogin&&!Store.admin&&!personaMia())
    $('#avviso').innerHTML='<div class="alerts"><h3>Account non ancora collegato</h3>Il tuo account non è collegato a una persona dell’anagrafica, quindi non vedi le schede di compilazione. Rivolgiti all’amministratore.</div>';
  const vai=()=>{
    const vis=sezioniVisibili();
    let id=location.hash.slice(1);if(!vis.some(s=>s.id===id))id='turni';
    $('#menu').innerHTML=vis.map(s=>`<a href="#${s.id}"${s.id===id?' aria-current="page"':''}>${s.t}</a>`).join('');
    const el=$('#sez');
    if(id==='turni')Moduli.turni.monta(el,{tabs:['corso','archivio']});
    else if(id==='amm')Moduli.turni.monta(el,{tabs:['genera','anagrafica','utenti']});
    else if(id==='help')Moduli.help.monta(el);
    else Moduli.ruoli.monta(el,SEZIONI.find(s=>s.id===id).l);
    window.scrollTo(0,0);
  };
  addEventListener('hashchange',vai);vai();
}

(async function(){
  const root=document.getElementById('app');
  const q=new URLSearchParams(location.search).get('adapter');
  if(q&&ADAPTERS[q])CONFIG.adapter=q;
  Store=ADAPTERS[CONFIG.adapter];
  if(!Store){schermataErrore(root,'Archivio non disponibile','Adattatore dati «'+CONFIG.adapter+'» non trovato.');return}
  try{
    await Store.init();
    if(Store.richiedeLogin){
      if(!Store.utente)await schermataLogin(root);
      await Store.carica();
    }
  }catch(e){schermataErrore(root,'Impossibile avviare l’archivio',e.message||String(e));return}
  document.getElementById('ver').textContent='Versione '+CONFIG.versione+' · dati di prova · '+Store.nome;
  if(Store.richiedeLogin&&Store.utente){
    const u=document.getElementById('utente');
    const d=Store.cacheTs?new Date(Store.cacheTs):null;
    u.innerHTML=(Store.offline?`<span class="off">Senza connessione · dati del ${d?it(d)+' '+pad(d.getHours())+':'+pad(d.getMinutes()):'—'}</span>`:'')
      +`<span>${esc(Store.utente.email)} · ${Store.admin?'amministratore':'sola lettura'}</span><button class="ghost" id="esci">Esci</button>`;
    if(Store.offline)addEventListener('online',()=>location.reload());   /* la modalità offline è di sola lettura: nessuna modifica da perdere */
    $('#esci').onclick=()=>Store.logout();
  }
  contenitore(root);
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
