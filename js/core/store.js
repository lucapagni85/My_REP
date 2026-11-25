/* ===== Strato dati =====
   Contratto che ogni adattatore deve rispettare (LocalAdapter, SupabaseAdapter; domani il server dell'ente):
     init()                              prepara l'adattatore; il locale carica subito anagrafica e mesi in ANAG e DATA (cache in memoria)
     richiedeLogin, utente, admin        se richiedeLogin=true l'app chiede il login all'avvio e poi chiama carica()
     carica()                            (solo adattatori remoti) legge anagrafica e mesi in ANAG e DATA
     leggiRegistro(k,n,L,pid) / salvaRegistro(k,n,L,pid,dati,baseRev,invia,forza)   registri per turno, ruolo e persona, con revisione e invio
     elencoUtenti() / collegaUtente(id, personaId)   (solo remoti, solo admin) account di accesso e collegamento a una persona; utente.personaId
     salvaMese(k, mese, baseRev, opz)    -> {ok, rev, agg} | {ok:false, conflitto:true, attuale} | {ok:false, errore}
     salvaPersona(p)                     -> {ok, id} | {ok:false, errore}   (p senza id = nuova persona: l'id lo assegna l'adattatore)
     importa(mesi, anagrafica) / esporta()
     registriTurno(k,n,L) -> [{personaId,rev,inviatoRev,inviatoIl,vistoRev,vistoIl,vistoSRev,vistoSIl,dati}]   (V00.13; vistoS* = visto del supervisore sul registro di un addetto, V00.14.1) registri inviati del turno per ruolo
     registriTutti() -> [{mese,turno,ruolo,personaId,rev,inviatoRev,inviatoIl,vistoRev,vistoIl,vistoSRev,vistoSIl,rett,dati}]   (V00.15) per il backup completo
     importaRegistri(lista) -> {ok,importati,saltati}   (V00.15) ripristino da backup
     contaDati() -> {mesi,registri,invii}   eliminaMese(k) -> {ok,mesi,registri,invii}   azzeraDati() -> {ok,mesi,registri,invii}   (V00.15, solo admin)
     rettificaRegistro(k,n,L,pid,{rep,str,motivo},togli) -> {ok,rett}   (V00.14.2) rettifica dei totali (minuti) da parte del supervisore; rett={rep,str,motivo,chi,il,rev}
     vistaRegistro(k,n,L,pid,togli,come) -> {ok,vistoRev,vistoIl}   (V00.13; come='S' = visto del supervisore su un registro addetto, V00.14.1)
     inviaMail(corpo) -> {ok,...}    (V00.12) avvisi via mail tramite la funzione server; il locale risponde {ok:false,nonDisponibile:true}. Facoltativi: mailAttive, elencoInvii()
     login(id, pwd) -> bool  (locale)  |  login(email, pwd) -> {ok, errore}  (remoti)   /   logout()
   Il resto dell'app legge solo da DATA e ANAG e non sa dove vengono salvati i dati. */
const DATA={}, ANAG=[];
function normalizza(m){
  m.schema=1; m.var=m.var||[];
  if(m.fissi)m.fissi=m.fissi.map(f=>Array.isArray(f)?{etichetta:f[0],numero:f[1]}:f);
  if(m.imprese)for(const g of ['ovest','est','comune'])m.imprese[g]=(m.imprese[g]||[]).map(i=>Array.isArray(i)?{zona:i[0],nome:i[1],tel:i[2]||''}:i);
  m.var.forEach(v=>{
    if(v.t==='orario'&&v.giorni){if(v.giorni==='feriali'&&!v.testo)v.testo='solo giorni feriali';delete v.giorni}
    if(v.t==='sost'&&!v.entraId){const a=ANAG.find(x=>x.n===v.entra);if(a)v.entraId=a.id}});
  for(const t of Object.values(m.turni||{}))for(const s of Object.values(t))if(!s.id){const a=ANAG.find(x=>x.n===s.n);if(a)s.id=a.id}
  return m;
}
const LocalAdapter={
  nome:'archivio locale',richiedeLogin:false,LS:'turni_archivio_v1',LSA:'turni_anagrafica_v1',LSE:'turni_eliminati_v1',prossimo:1,
  async init(){
    let an=null;try{an=JSON.parse(localStorage.getItem(this.LSA)||'null')}catch(e){}
    this.caricaAnag(an&&Array.isArray(an.persone)?an:{persone:typeof ANAG_SEED!=='undefined'?clone(ANAG_SEED):[]});
    let sv={};try{sv=JSON.parse(localStorage.getItem(this.LS)||'{}')}catch(e){}
    const base=Object.assign(typeof SEED_MESI!=='undefined'?clone(SEED_MESI):{},sv);
    let el=[];try{el=JSON.parse(localStorage.getItem(this.LSE)||'[]')}catch(e){}
    for(const k of el)if(!(k in sv))delete base[k];   /* mese eliminato: non torna dal seme di prova */
    for(const k of Object.keys(DATA))delete DATA[k];
    for(const k in base)DATA[k]=normalizza(base[k]);
  },
  caricaAnag(an){
    ANAG.splice(0,ANAG.length,...clone(an.persone));
    this.prossimo=Math.max(an.prossimoId||0,0,...ANAG.map(p=>p.id||0))+1;   /* mai riutilizzato */
  },
  scrivi(){try{localStorage.setItem(this.LS,JSON.stringify(DATA));return true}catch(e){return false}},
  scriviAnag(){try{localStorage.setItem(this.LSA,JSON.stringify({schema:1,prossimoId:this.prossimo-1,persone:ANAG}));return true}catch(e){return false}},
  async salvaPersona(p){
    const c=clone(p),nuova=!c.id,i=nuova?-1:ANAG.findIndex(x=>x.id===c.id);
    if(!nuova&&i<0)return{ok:false,errore:'persona non trovata'};
    const prima=nuova?null:ANAG[i],pr=this.prossimo;
    if(nuova){c.id=this.prossimo++;ANAG.push(c)}else ANAG[i]=c;
    if(!this.scriviAnag()){if(nuova){ANAG.pop();this.prossimo=pr}else ANAG[i]=prima;return{ok:false,errore:'memoria del browser non disponibile'}}
    return{ok:true,id:c.id};
  },
  async salvaMese(k,mese,baseRev,opz={}){
    const ex=DATA[k],att=ex&&ex.rev!==undefined?ex.rev:null;
    if(!opz.forza&&att!==(baseRev===undefined?null:baseRev))return{ok:false,conflitto:true,attuale:att};
    const c=clone(mese);delete c.baseRev;c.rev=ex?(ex.rev||0)+1:0;c.agg=new Date().toISOString();normalizza(c);
    DATA[k]=c;
    if(!this.scrivi()){if(ex)DATA[k]=ex;else delete DATA[k];return{ok:false,errore:'memoria del browser non disponibile'}}
    return{ok:true,rev:c.rev,agg:c.agg};
  },
  /* Registri (V00.10), stesso contratto dell'adattatore Supabase */
  LSR:'turni_registri_v1',
  regLeggi(){try{return JSON.parse(localStorage.getItem(this.LSR)||'{}')}catch(e){return{}}},
  async leggiRegistro(k,n,L,pid){const r=this.regLeggi()[`${k}|${n}|${L}|${pid}`];return r?Object.assign({vistoRev:null,vistoIl:null,vistoSRev:null,vistoSIl:null,rett:null},clone(r)):null},
  async salvaRegistro(k,n,L,pid,dati,baseRev,invia=false,forza=false){
    const all=this.regLeggi(),key=`${k}|${n}|${L}|${pid}`,ex=all[key],ts=new Date().toISOString(),base=baseRev===undefined?null:baseRev;
    let r;
    if(ex){
      if(dati===null){r=ex;if(invia){r.inviatoRev=r.rev;r.inviatoIl=ts}}
      else{
        if(!forza&&base!==ex.rev)return{ok:false,conflitto:true,attuale:ex.rev};
        r={dati:clone(dati),rev:ex.rev+1,inviatoRev:invia?ex.rev+1:ex.inviatoRev,inviatoIl:invia?ts:ex.inviatoIl,agg:ts,vistoRev:ex.vistoRev===undefined?null:ex.vistoRev,vistoIl:ex.vistoIl||null,vistoSRev:ex.vistoSRev===undefined?null:ex.vistoSRev,vistoSIl:ex.vistoSIl||null,rett:ex.rett||null};
      }
    }else{
      if(dati===null)return{ok:false,errore:'registro non ancora salvato'};
      if(!forza&&base!==null)return{ok:false,conflitto:true,attuale:null};
      r={dati:clone(dati),rev:0,inviatoRev:invia?0:null,inviatoIl:invia?ts:null,agg:ts};
    }
    all[key]=r;
    try{localStorage.setItem(this.LSR,JSON.stringify(all))}catch(e){return{ok:false,errore:'memoria del browser non disponibile'}}
    return{ok:true,rev:r.rev,inviatoRev:r.inviatoRev,inviatoIl:r.inviatoIl,agg:r.agg};
  },
  /* Visto (V00.13): vale per la revisione inviata (vistoRev === inviatoRev). */
  async registriTurno(k,n,L){
    const all=this.regLeggi(),o=[];
    for(const key of Object.keys(all)){const[kk,nn,ll,pid]=key.split('|');
      if(kk===k&&+nn===n&&ll===L){const r=all[key];o.push({personaId:+pid,rev:r.rev,inviatoRev:r.inviatoRev,inviatoIl:r.inviatoIl,vistoRev:r.vistoRev===undefined?null:r.vistoRev,vistoIl:r.vistoIl||null,vistoSRev:r.vistoSRev===undefined?null:r.vistoSRev,vistoSIl:r.vistoSIl||null,rett:r.rett?clone(r.rett):null,dati:clone(r.dati)})}}
    return o;
  },
  async vistaRegistro(k,n,L,pid,togli=false,come=null){
    const all=this.regLeggi(),key=`${k}|${n}|${L}|${pid}`,r=all[key];
    if(!r||r.inviatoRev===null||r.inviatoRev===undefined)return{ok:false,errore:'il registro non risulta inviato'};
    const sup=L==='A'&&come==='S',fr=sup?'vistoSRev':'vistoRev',fi=sup?'vistoSIl':'vistoIl';   /* visto del supervisore su un addetto: campi a parte */
    if(togli){r[fr]=null;r[fi]=null}else{r[fr]=r.inviatoRev;r[fi]=new Date().toISOString()}
    try{localStorage.setItem(this.LSR,JSON.stringify(all))}catch(e){return{ok:false,errore:'memoria del browser non disponibile'}}
    return{ok:true,vistoRev:r[fr],vistoIl:r[fi]};
  },
  /* Rettifica dei totali (V00.14.2): salvata a parte, vale per la revisione inviata. Minuti interi; rep/str null = non rettificato. */
  async rettificaRegistro(k,n,L,pid,v,togli=false){
    const all=this.regLeggi(),key=`${k}|${n}|${L}|${pid}`,r=all[key];
    if(!r||r.inviatoRev===null||r.inviatoRev===undefined)return{ok:false,errore:'il registro non risulta inviato'};
    if(togli)r.rett=null;
    else{
      v=v||{};const rep=v.rep==null?null:v.rep,str=v.str==null?null:v.str,mt=String(v.motivo||'').trim();
      if(rep===null&&str===null)return{ok:false,errore:'indica almeno un totale da rettificare'};
      if(mt.length<5)return{ok:false,errore:'la motivazione è obbligatoria (almeno 5 caratteri)'};
      r.rett={rep,str,motivo:mt,da:null,chi:v.chi||'',il:new Date().toISOString(),rev:r.inviatoRev};
    }
    try{localStorage.setItem(this.LSR,JSON.stringify(all))}catch(e){return{ok:false,errore:'memoria del browser non disponibile'}}
    return{ok:true,rett:r.rett?clone(r.rett):null};
  },
  /* ---- Strumenti di amministrazione (V00.15) ---- */
  async registriTutti(){
    return Object.entries(this.regLeggi()).map(([key,r])=>{const[mese,turno,ruolo,pid]=key.split('|');
      return Object.assign({vistoRev:null,vistoIl:null,vistoSRev:null,vistoSIl:null,rett:null},clone(r),{mese,turno:+turno,ruolo,personaId:+pid})});
  },
  async importaRegistri(lista){
    const all=this.regLeggi();let n=0;
    for(const e of lista||[]){
      if(!e||!e.mese||!e.ruolo||e.personaId==null)continue;
      all[`${e.mese}|${e.turno}|${e.ruolo}|${e.personaId}`]={dati:clone(e.dati||{}),rev:e.rev||0,inviatoRev:e.inviatoRev===undefined?null:e.inviatoRev,inviatoIl:e.inviatoIl||null,agg:new Date().toISOString(),
        vistoRev:e.vistoRev===undefined?null:e.vistoRev,vistoIl:e.vistoIl||null,vistoSRev:e.vistoSRev===undefined?null:e.vistoSRev,vistoSIl:e.vistoSIl||null,rett:e.rett?clone(e.rett):null};
      n++;
    }
    try{localStorage.setItem(this.LSR,JSON.stringify(all))}catch(x){return{ok:false,errore:'memoria del browser non disponibile'}}
    return{ok:true,importati:n,saltati:(lista||[]).length-n};
  },
  async contaDati(){return{mesi:Object.keys(DATA).length,registri:Object.keys(this.regLeggi()).length,invii:0}},
  _eliminati(ks){let el=[];try{el=JSON.parse(localStorage.getItem(this.LSE)||'[]')}catch(e){}try{localStorage.setItem(this.LSE,JSON.stringify([...new Set([...el,...ks])]))}catch(e){}},
  async eliminaMese(k){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(k||''))return{ok:false,errore:'mese non valido'};
    const all=this.regLeggi(),mine=Object.keys(all).filter(x=>x.startsWith(k+'|')),nm=DATA[k]?1:0;
    for(const x of mine)delete all[x];delete DATA[k];this._eliminati([k]);
    try{localStorage.setItem(this.LSR,JSON.stringify(all))}catch(e){return{ok:false,errore:'memoria del browser non disponibile'}}
    this.scrivi();return{ok:true,mesi:nm,registri:mine.length,invii:0};
  },
  async azzeraDati(){
    const c=await this.contaDati();this._eliminati(Object.keys(DATA));
    for(const k of Object.keys(DATA))delete DATA[k];
    try{localStorage.setItem(this.LSR,'{}')}catch(e){return{ok:false,errore:'memoria del browser non disponibile'}}
    this.scrivi();return Object.assign({ok:true},c);
  },
  async inviaMail(){return{ok:false,nonDisponibile:true,errore:'le mail non sono disponibili con l’archivio locale'}},
  async importa(M,A){
    if(A&&Array.isArray(A.persone)){this.caricaAnag(A);this.scriviAnag()}   /* prima l'anagrafica: normalizza() la usa */
    for(const k in M)DATA[k]=normalizza(clone(M[k]));this.scrivi()
  },
  esporta(){return{app:'turni',versione:CONFIG.versione,schema:2,esportato:new Date().toISOString(),anagrafica:{prossimoId:this.prossimo-1,persone:ANAG},mesi:DATA}},
  async login(u,p){return u===CONFIG.utenteTest.id&&p===CONFIG.utenteTest.pwd},
  logout(){}
};
const ADAPTERS={local:LocalAdapter};   /* gli altri adattatori si registrano da soli (es. core/supabase.js) */
let Store=null;                        /* scelto all'avvio da app.js in base a CONFIG.adapter */
