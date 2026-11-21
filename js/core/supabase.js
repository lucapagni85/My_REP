/* Adattatore SUPABASE (V00.07). Rispetta il contratto descritto in store.js.
   Richiede: libreria supabase-js (UMD, globale "supabase"), SUPABASE_CFG, normalizza/DATA/ANAG di store.js. */
/* Errore di rete (non di permessi): in questo caso si può usare la copia locale in sola lettura. */
const erroreRete=e=>!navigator.onLine||/fetch|network|load failed/i.test((e&&e.message)||'');
const SupabaseAdapter={
  nome:'Supabase (test)',richiedeLogin:true,utente:null,admin:false,sb:null,
  offline:false,cacheTs:null,CK:'turni_cache_v1',
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
    /* admin: anagrafica completa; gli altri: vista ridotta (nome, ruolo, telefoni, zona) + il proprio record completo */
    const tabP=this.admin?'persone':'persone_pubbliche';
    try{[p,m]=await Promise.all([this.sb.from(tabP).select('id,dati').order('id'),this.sb.from('mesi').select('chiave,dati,rev,agg')])}
    catch(e){p={error:e};m={}}
    const er=p.error||m.error;
    if(er&&erroreRete(er)&&this.daCache())return;
    if(er)throw new Error('Lettura dati non riuscita: '+er.message+' (lo script SQL è stato eseguito?)');
    ANAG.splice(0,ANAG.length,...p.data.map(r=>Object.assign({},r.dati,{id:r.id})));   /* prima l'anagrafica: normalizza() la usa */
    if(!this.admin&&this.utente&&this.utente.personaId){
      try{const o=await this.sb.from('persone').select('id,dati').eq('id',this.utente.personaId).maybeSingle();
        if(o.data){const i=ANAG.findIndex(x=>x.id===o.data.id),n=Object.assign({},o.data.dati,{id:o.data.id});if(i<0)ANAG.push(n);else ANAG[i]=n}}catch(e){}
    }
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
