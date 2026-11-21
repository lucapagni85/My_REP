/* ===== Strato dati =====
   Contratto che ogni adattatore deve rispettare (LocalAdapter, SupabaseAdapter; domani il server dell'ente):
     init()                              prepara l'adattatore; il locale carica subito anagrafica e mesi in ANAG e DATA (cache in memoria)
     richiedeLogin, utente, admin        se richiedeLogin=true l'app chiede il login all'avvio e poi chiama carica()
     carica()                            (solo adattatori remoti) legge anagrafica e mesi in ANAG e DATA
     salvaMese(k, mese, baseRev, opz)    -> {ok, rev, agg} | {ok:false, conflitto:true, attuale} | {ok:false, errore}
     salvaPersona(p)                     -> {ok, id} | {ok:false, errore}   (p senza id = nuova persona: l'id lo assegna l'adattatore)
     importa(mesi, anagrafica) / esporta()
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
  nome:'archivio locale',richiedeLogin:false,LS:'turni_archivio_v1',LSA:'turni_anagrafica_v1',prossimo:1,
  async init(){
    let an=null;try{an=JSON.parse(localStorage.getItem(this.LSA)||'null')}catch(e){}
    this.caricaAnag(an&&Array.isArray(an.persone)?an:{persone:typeof ANAG_SEED!=='undefined'?clone(ANAG_SEED):[]});
    let sv={};try{sv=JSON.parse(localStorage.getItem(this.LS)||'{}')}catch(e){}
    const base=Object.assign(typeof SEED_MESI!=='undefined'?clone(SEED_MESI):{},sv);
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
