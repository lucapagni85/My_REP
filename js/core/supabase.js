/* Adattatore SUPABASE (V00.07). Rispetta il contratto descritto in store.js.
   Richiede: libreria supabase-js (UMD, globale "supabase"), SUPABASE_CFG, normalizza/DATA/ANAG di store.js. */
/* Errore di rete (non di permessi): in questo caso si può usare la copia locale in sola lettura. */
const erroreRete=e=>!navigator.onLine||/fetch|network|load failed/i.test((e&&e.message)||'');
const SupabaseAdapter={
  nome:'Supabase (test)',richiedeLogin:true,utente:null,admin:false,sb:null,
  offline:false,cacheTs:null,CK:'turni_cache_v1',mailAttive:true,
  /* Copia locale: turni e recapiti essenziali (niente matricola, email, residenza). Si cancella all'uscita. */
  leggiCache(){try{return JSON.parse(localStorage.getItem(this.CK)||'null')}catch(e){return null}},
  scriviCache(){
    if(!CONFIG.cacheOffline||!this.utente)return;
    const persone=ANAG.map(({id,n,r,t,z,s,ar,attivo,ra})=>({id,n,r,t,z,s,ar,attivo,ra}));
    try{localStorage.setItem(this.CK,JSON.stringify({u:this.utente,ts:new Date().toISOString(),persone,mesi:DATA}))}catch(e){}
  },
  daCache(){
    const c=this.leggiCache();
    if(!CONFIG.cacheOffline||!c||!this.utente||!c.u||c.u.id!==this.utente.id)return false;
    ANAG.splice(0,ANAG.length,...c.persone);
    for(const k of Object.keys(DATA))delete DATA[k];
    for(const k in c.mesi)DATA[k]=c.mesi[k];
    this.offline=true;this.admin=false;this.cacheTs=c.ts;return true;   /* offline = sola lettura */
  },
  async init(){
    if(typeof supabase==='undefined'||!supabase.createClient)throw new Error('Libreria Supabase non caricata: controlla la connessione a internet.');
    if(typeof SUPABASE_CFG==='undefined'||!SUPABASE_CFG.url||!SUPABASE_CFG.chiave)throw new Error('Configurazione mancante (js/supabase.config.js).');
    this.sb=supabase.createClient(SUPABASE_CFG.url,SUPABASE_CFG.chiave);
    let s=null;try{const r=await this.sb.auth.getSession();s=r.data&&r.data.session}catch(e){}
    if(s)await this.profilo(s.user);
    else if(!navigator.onLine){const c=this.leggiCache();if(c&&c.u){this.utente=c.u;this.admin=false}}   /* avvio senza rete con copia locale */
  },
  async profilo(u){
    let ruolo=null;
    let personaId=null;
    try{const{data,error}=await this.sb.from('profili').select('ruolo,persona_id').eq('id',u.id).maybeSingle();
      if(!error){ruolo=(data&&data.ruolo)||'utente';personaId=(data&&data.persona_id)||null}else if(!erroreRete(error))ruolo='utente'}catch(e){}
    if(ruolo===null){const c=this.leggiCache(),ok=c&&c.u&&c.u.id===u.id;ruolo=ok?c.u.ruolo:'utente';personaId=ok?c.u.personaId||null:null}   /* rete assente: ultimi valori noti */
    this.utente={id:u.id,email:u.email,ruolo,personaId};this.admin=ruolo==='admin';
  },
  async login(email,pwd){
    if(!email||!pwd)return{ok:false,errore:'Inserisci email e password'};
    const{data,error}=await this.sb.auth.signInWithPassword({email,password:pwd});
    if(error)return{ok:false,errore:/invalid|credentials/i.test(error.message)?'Email o password non corretti':'Accesso non riuscito: '+error.message};
    await this.profilo(data.user);return{ok:true};
  },
  async logout(){
    try{localStorage.removeItem(this.CK)}catch(e){}
    try{await this.sb.auth.signOut()}catch(e){}
    try{Object.keys(localStorage).filter(k=>/^sb-.*-auth-token/.test(k)).forEach(k=>localStorage.removeItem(k))}catch(e){}
    location.reload();
  },
  async carica(){
    let p,m;
    try{[p,m]=await Promise.all([this.sb.from('persone').select('id,dati').order('id'),this.sb.from('mesi').select('chiave,dati,rev,agg')])}
    catch(e){p={error:e};m={}}
    const er=p.error||m.error;
    if(er&&erroreRete(er)&&this.daCache())return;
    if(er)throw new Error('Lettura dati non riuscita: '+er.message+' (lo script SQL è stato eseguito?)');
    ANAG.splice(0,ANAG.length,...p.data.map(r=>Object.assign({},r.dati,{id:r.id})));   /* prima l'anagrafica: normalizza() la usa */
    for(const k of Object.keys(DATA))delete DATA[k];
    m.data.forEach(r=>{DATA[r.chiave]=normalizza(Object.assign({},r.dati,{rev:r.rev,agg:r.agg}))});
    this.offline=false;this.scriviCache();
  },
  async elencoUtenti(){
    const{data,error}=await this.sb.from('profili').select('id,email,ruolo,persona_id').order('email');
    if(error)throw new Error(error.message);return data||[];
  },
  async collegaUtente(id,personaId){
    const{data,error}=await this.sb.from('profili').update({persona_id:personaId}).eq('id',id).select('id');
    if(error)return{ok:false,errore:error.code==='23505'?'questa persona è già collegata a un altro account':error.message};
    if(!data||!data.length)return{ok:false,errore:'permesso negato'};
    if(this.utente&&this.utente.id===id)this.utente.personaId=personaId;
    return{ok:true};
  },
  /* Colonne da leggere, dalla più completa alla più vecchia: se lo script SQL più recente non è stato eseguito
     (colonna inesistente) si ripiega sulla versione precedente, così l'app continua a funzionare. */
  _colonne(prefisso){
    const base='dati,rev,inviato_rev,inviato_il',v13='visto_rev,visto_il',v14='visto_sup_rev,visto_sup_il',v142='rett';
    return [[base,'agg',v13,v14,v142],[base,'agg',v13,v14],[base,'agg',v13],[base,'agg']].map(a=>prefisso+a.join(','));
  },
  async _leggi(costruisci,colonne){
    let r;
    try{for(const c of colonne){r=await costruisci(c);if(!(r.error&&/visto_|rett|does not exist|schema cache/i.test(r.error.message||'')))break}}
    catch(x){const e=new Error(x.message||String(x));e.rete=true;throw e}
    return r;
  },
  /* Registri (V00.10): {dati, rev, inviatoRev, inviatoIl, agg, visti, rett} oppure null se non ancora salvato */
  async leggiRegistro(k,n,L,pid){
    const r=await this._leggi(cols=>this.sb.from('registri').select(cols).eq('mese',k).eq('turno',n).eq('ruolo',L).eq('persona_id',pid).maybeSingle(),this._colonne(''));
    if(r.error){const e=new Error(r.error.message);e.rete=erroreRete(r.error);throw e}
    const d=r.data;return d?{dati:d.dati,rev:d.rev,inviatoRev:d.inviato_rev,inviatoIl:d.inviato_il,agg:d.agg,vistoRev:d.visto_rev===undefined?null:d.visto_rev,vistoIl:d.visto_il||null,vistoSRev:d.visto_sup_rev===undefined?null:d.visto_sup_rev,vistoSIl:d.visto_sup_il||null,rett:d.rett||null}:null;
  },
  /* Registri inviati di un turno per ruolo, con i visti e la rettifica (V00.13, V00.14.1, V00.14.2). Lancia un errore se la lettura non riesce. */
  async registriTurno(k,n,L){
    const r=await this._leggi(cols=>this.sb.from('registri').select(cols).eq('mese',k).eq('turno',n).eq('ruolo',L),this._colonne('persona_id,'));
    if(r.error){const e=new Error(r.error.message+(/visto_/.test(r.error.message)?' (lo script SQL V00.13 è stato eseguito?)':''));e.rete=erroreRete(r.error);throw e}
    return (r.data||[]).map(d=>({personaId:d.persona_id,rev:d.rev,inviatoRev:d.inviato_rev,inviatoIl:d.inviato_il,vistoRev:d.visto_rev===undefined?null:d.visto_rev,vistoIl:d.visto_il||null,vistoSRev:d.visto_sup_rev===undefined?null:d.visto_sup_rev,vistoSIl:d.visto_sup_il||null,rett:d.rett||null,dati:d.dati}));
  },
  /* Rettifica dei totali (minuti) di un registro inviato, o sua revoca con togli=true (V00.14.2). Solo supervisore del turno e admin. */
  async rettificaRegistro(k,n,L,pid,v,togli=false){
    let r;v=v||{};
    try{r=await this.sb.rpc('rettifica_registro',{p_mese:k,p_turno:n,p_ruolo:L,p_persona:pid,p_rep:v.rep==null?null:v.rep,p_str:v.str==null?null:v.str,p_motivo:v.motivo||null,p_togli:!!togli})}
    catch(x){return{ok:false,errore:x.message||String(x),rete:true}}
    if(r.error)return{ok:false,errore:r.error.message+(/does not exist|schema cache/i.test(r.error.message)?' (lo script SQL V00.14.2 è stato eseguito?)':''),rete:erroreRete(r.error)};
    const d=r.data;if(!d.ok)return d;
    return{ok:true,rett:d.rett||null};
  },
  /* Visto del responsabile sul registro inviato (o sua revoca con togli=true). */
  async vistaRegistro(k,n,L,pid,togli=false,come=null){
    let r;
    try{r=await this.sb.rpc('vista_registro',{p_mese:k,p_turno:n,p_ruolo:L,p_persona:pid,p_togli:!!togli,p_come:come||null})}
    catch(x){return{ok:false,errore:x.message||String(x),rete:true}}
    if(r.error)return{ok:false,errore:r.error.message+(/does not exist|schema cache/i.test(r.error.message)?' (lo script SQL V00.14.1 è stato eseguito?)':''),rete:erroreRete(r.error)};
    const d=r.data;if(!d.ok)return d;
    return{ok:true,vistoRev:d.visto_rev,vistoIl:d.visto_il};
  },
  /* dati=null con invia=true: invia l'ultima revisione salvata. Ritorna {ok,rev,inviatoRev,inviatoIl} | {ok:false,conflitto,attuale} | {ok:false,errore,rete} */
  async salvaRegistro(k,n,L,pid,dati,baseRev,invia=false,forza=false){
    let r;
    try{r=await this.sb.rpc('salva_registro',{p_mese:k,p_turno:n,p_ruolo:L,p_persona:pid,p_dati:dati,p_base_rev:baseRev===undefined?null:baseRev,p_invia:!!invia,p_forza:!!forza})}
    catch(x){return{ok:false,errore:x.message||String(x),rete:true}}
    if(r.error)return{ok:false,errore:r.error.message,rete:erroreRete(r.error)};
    const d=r.data;if(!d.ok)return d;
    return{ok:true,rev:d.rev,inviatoRev:d.inviato_rev,inviatoIl:d.inviato_il,agg:d.agg};
  },
  /* Mail (V00.12): la funzione server «invia-mail» decide destinatari e testo dal database. Ritorna sempre un oggetto, mai eccezioni. */
  async inviaMail(corpo){
    let r;
    try{r=await this.sb.functions.invoke('invia-mail',{body:corpo})}
    catch(x){return{ok:false,errore:x.message||String(x),rete:true}}
    if(r.error){
      let msg=r.error.message||'errore sconosciuto',rete=false;const cx=r.error.context;
      if(cx&&typeof cx.json==='function'){
        if(cx.status===404)msg='la funzione «invia-mail» non è stata pubblicata su Supabase';
        else{try{const j=await cx.json();if(j&&j.errore)msg=j.errore}catch(e){}}
      }else if(/fetch|network|send a request|load failed/i.test(r.error.name+' '+msg)){rete=true;msg='connessione assente o funzione non raggiungibile'}
      return{ok:false,errore:msg,rete};
    }
    return r.data&&typeof r.data==='object'?r.data:{ok:false,errore:'risposta vuota dalla funzione'};
  },
  /* Registro degli invii (solo admin): ultimi invii, senza il testo del messaggio. */
  async elencoInvii(){
    const{data,error}=await this.sb.from('invii_mail').select('id,creato,tipo,mese,turno,rev,destinatario,effettivo,nome_dest,oggetto,prova,esito,errore,reinvio_di').order('creato',{ascending:false}).limit(60);
    if(error)throw new Error(error.message+(/does not exist|relation|schema cache/i.test(error.message)?' (lo script SQL V00.12 è stato eseguito?)':''));
    return data||[];
  },
  async salvaMese(k,mese,baseRev,opz={}){
    const c=clone(mese);delete c.baseRev;delete c.rev;delete c.agg;
    const{data,error}=await this.sb.rpc('salva_mese',{p_chiave:k,p_dati:c,p_base_rev:baseRev===undefined?null:baseRev,p_forza:!!opz.forza});
    if(error)return{ok:false,errore:error.message};
    if(!data.ok)return data;
    DATA[k]=normalizza(Object.assign(c,{rev:data.rev,agg:data.agg}));this.scriviCache();
    return{ok:true,rev:data.rev,agg:data.agg};
  },
  async salvaPersona(p){
    const c=clone(p),id=c.id;delete c.id;
    if(!id){
      const{data,error}=await this.sb.from('persone').insert({dati:c}).select('id').single();
      if(error)return{ok:false,errore:error.message};
      ANAG.push(Object.assign(c,{id:data.id}));this.scriviCache();return{ok:true,id:data.id};
    }
    const{data,error}=await this.sb.from('persone').update({dati:c}).eq('id',id).select('id');
    if(error)return{ok:false,errore:error.message};
    if(!data||!data.length)return{ok:false,errore:'persona non trovata o permesso negato'};
    const i=ANAG.findIndex(x=>x.id===id);const n=Object.assign(c,{id});if(i<0)ANAG.push(n);else ANAG[i]=n;this.scriviCache();
    return{ok:true,id};
  },
  async importa(M,A){
    if(A&&Array.isArray(A.persone)){const{error}=await this.sb.rpc('importa_persone',{p_lista:A.persone});if(error)throw new Error(error.message)}
    for(const k in M){const r=await this.salvaMese(k,clone(M[k]),undefined,{forza:true});if(!r.ok)throw new Error(`mese ${k}: ${r.errore||'non salvato'}`)}
    await this.carica();
  },
  esporta(){return{app:'turni',versione:CONFIG.versione,schema:2,esportato:new Date().toISOString(),anagrafica:{prossimoId:Math.max(0,...ANAG.map(p=>p.id)),persone:ANAG},mesi:DATA}}
};
ADAPTERS.supabase=SupabaseAdapter;
