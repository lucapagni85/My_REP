/* REGISTRO, RIEPILOGO e VERIFICHE dell'ADDETTO (V00.10) e del COORDINATORE (V00.13).
   Passi della scheda Addetto: 1 Turno (ruoli.js) · 2 Registro · 3 Riepilogo · 4 Verifiche e invio.
   Passi della scheda Coordinatore: 1 Turno · 2 Registro · 3 Riepilogo · 4 Addetti (registri inviati e «visto») · 5 Verifiche e invio.
   Dati nel database (Store.leggiRegistro / salvaRegistro) con numero di revisione; le modifiche non salvate
   si conservano anche sul dispositivo (bozza) e si possono ripristinare. Le verifiche non sono bloccanti. */
const RG={key:null,ctx:null,s:null,ad:null};
const RG_PASSI={A:['Turno','Registro','Riepilogo','Verifiche e invio'],C:['Turno','Registro','Riepilogo','Addetti','Verifiche e invio'],S:['Turno','Registro','Riepilogo','Registri del turno','Verifiche e conclusione']};
const RG_TITOLO={A:'Registro addetto',C:'Registro coordinatore',S:'Registro supervisore'};
const RG_DEST={A:'coordinatore',C:'supervisore'};      /* a chi va l'invio (il supervisore non invia: dalla V00.14.1 stampa e consegna il cartaceo al dirigente) */
const RG_VISTO_DA={A:'coordinatore',C:'supervisore'};
const rgNomePasso=(L,p)=>(RG_PASSI[L]||RG_PASSI.A)[p-1];
const RG_BOZZE='turni_bozze_v1';
let rgTimer=null;

const rgK=c=>`${c.k}|${c.n}|${c.L}|${c.p.id}`;
const rgBozze=()=>{try{return JSON.parse(localStorage.getItem(RG_BOZZE)||'{}')}catch(e){return{}}};
function rgBozzaSalva(key,v){try{const b=rgBozze();if(v)b[key]=v;else delete b[key];localStorage.setItem(RG_BOZZE,JSON.stringify(b))}catch(e){}}
const rgVuoto=()=>({v:1,righe:[],ov:{}});
const rgRiga=(data,L)=>Object.assign({data,ora:'',rich:'',via:'',km:'',motivo:'',arrivo:'',fine:'',durata:'',durAuto:true,descr:'',note:''},
  L==='C'?{tipo:'',addetti:[],addettiAltri:'',imprese:'',sopr:'',soprSup:'',effic:''}:L==='S'?{sopr:'',presCoo:''}:{});
const rgDmy=t=>{const d=new Date(t);return isNaN(d)?'':it(d)};
/* Coordinatore del turno e chi lo sostituisce (V00.14, scheda Supervisore). */
function rgCoordinatoriTurno(c){
  const o=[],visti=new Set(),tt=c.tt||{},add=(id,n)=>{const k=id?'i'+id:'n'+n;if(visti.has(k))return;visti.add(k);o.push({id:id||null,n})};
  if(tt.COO)add(tt.COO.id,tt.COO.n);
  for(const v of (c.m&&c.m.var)||[])if(v.turno===c.n&&v.t==='sost'&&v.slot==='COO'&&tt.COO)add(v.entraId,v.entra);
  return o.filter(x=>!(c.p&&(x.id?x.id===c.p.id:x.n===c.p.n)));
}
/* Addetti del turno (titolari e sostituti, vice coordinatore compreso) esclusa la persona che compila. */
function rgAddettiTurno(c){
  const o=[],visti=new Set(),tt=c.tt||{},add=(id,n)=>{const k=id?'i'+id:'n'+n;if(visti.has(k))return;visti.add(k);o.push({id:id||null,n})};
  for(const sl of ['VICE','Z1','Z2','Z3','Z4','Z5','Z6'])if(tt[sl])add(tt[sl].id,tt[sl].n);
  for(const v of (c.m&&c.m.var)||[])if(v.turno===c.n&&v.t==='sost'&&v.slot!=='SUP'&&v.slot!=='COO'&&tt[v.slot])add(v.entraId,v.entra);
  return o.filter(x=>!(c.p&&(x.id?x.id===c.p.id:x.n===c.p.n)));
}
function rgDataDefault(c,righe){
  const oggi=iso(new Date());
  return (righe.length&&righe[righe.length-1].data)||(oggi>=iso(c.a)&&oggi<=iso(c.b)?oggi:iso(c.a));
}
const rgSistema=d=>{d=d&&typeof d==='object'?d:{};d.righe=Array.isArray(d.righe)?d.righe:[];d.ov=d.ov&&typeof d.ov==='object'?d.ov:{};return d};

/* ---------- caricamento ---------- */
async function rgApri(c,rerender){
  const key=rgK(c),s={stato:'cic',dati:rgVuoto(),baseRev:null,rev:null,inviatoRev:null,inviatoIl:null,vistoRev:null,vistoIl:null,vistoSRev:null,vistoSIl:null,rett:null,dirty:false,msg:'',err:'',bozza:null,conflitto:false,attuale:null,salvando:false};
  RG.key=key;RG.ctx=c;RG.s=s;
  let db=null,rete=false,errore='';
  try{db=await Store.leggiRegistro(c.k,c.n,c.L,c.p.id)}catch(e){rete=!!e.rete||!navigator.onLine;errore=e.message||String(e)}
  if(RG.key!==key)return;                                   /* nel frattempo è stato scelto un altro turno */
  const bz=rgBozze()[key]||null;
  if(errore){
    if(rete&&bz){s.stato='ok';s.dati=rgSistema(bz.dati);s.baseRev=bz.baseRev;s.rev=bz.baseRev;s.dirty=true;s.err='Senza connessione: stai lavorando sulla bozza salvata su questo dispositivo.'}
    else{s.stato='err';s.err=rete?'Registro non raggiungibile: senza connessione si può aprire solo se c’è una bozza su questo dispositivo.':'Lettura del registro non riuscita: '+errore+' (lo script SQL V00.10 è stato eseguito?)'}
  }else{
    s.stato='ok';
    if(db){s.dati=rgSistema(db.dati);s.baseRev=db.rev;s.rev=db.rev;s.inviatoRev=db.inviatoRev;s.inviatoIl=db.inviatoIl;s.vistoRev=db.vistoRev===undefined?null:db.vistoRev;s.vistoIl=db.vistoIl||null;s.vistoSRev=db.vistoSRev===undefined?null:db.vistoSRev;s.vistoSIl=db.vistoSIl||null;s.rett=db.rett||null}
    if(bz&&JSON.stringify(rgSistema(bz.dati))!==JSON.stringify(s.dati))s.bozza=bz;
    else if(bz)rgBozzaSalva(key,null);
  }
  rerender();
}
RG.assicura=function(c,rerender,passo){
  if(c&&c.p&&RG.key!==rgK(c))rgApri(c,rerender);
  if(c&&c.p&&c.L!=='A'&&passo>=4&&(!RG.ad||RG.ad.key!==rgAdKey(c)))rgAdApri(c,rerender);   /* coordinatore e supervisore leggono i registri del turno */
};
RG.reset=function(){RG.key=null;RG.s=null;RG.ctx=null;RG.ad=null};

/* ---------- stato e salvataggio ---------- */
/* Il visto vale solo per la revisione inviata: se ne viene inviata un'altra, decade. */
const rgVistoValido=()=>{const s=RG.s;return !!s&&s.vistoRev!==null&&s.vistoRev!==undefined&&s.vistoRev===s.inviatoRev&&!!s.vistoIl};
/* Visto del supervisore sul registro di un addetto (V00.14.1): campi a parte, indipendente da quello del coordinatore. */
const rgVistoSValido=()=>{const s=RG.s;return !!s&&s.vistoSRev!==null&&s.vistoSRev!==undefined&&s.vistoSRev===s.inviatoRev&&!!s.vistoSIl};
function rgStatoTesto(){
  const s=RG.s,L=RG.ctx.L,S=L==='S';let t;
  if(s.rev===null)t='Non ancora salvato';
  else{
    t=`Revisione ${pad(s.rev)} salvata`;
    if(s.inviatoRev===null||s.inviatoRev===undefined)t+=S?' · non conclusa':' · non inviata';
    else t+=s.inviatoRev===s.rev&&!s.dirty?(S?' · <b>conclusa</b>':' · <b>inviata</b>'):` · ultima ${S?'conclusa':'inviata'}: rev ${pad(s.inviatoRev)}`;
    const vt=(chi,rev,il,val)=>val?` · visto dal ${chi} il ${rgDmy(il)}`:(rev!==null&&rev!==undefined?` · visto del ${chi} decaduto (inviata una revisione nuova)`:'');
    if(L!=='S')t+=vt(RG_VISTO_DA[L],s.vistoRev,s.vistoIl,rgVistoValido());
    if(L==='A')t+=vt('supervisore',s.vistoSRev,s.vistoSIl,rgVistoSValido());
  }
  return t+(s.dirty?' · <span class="mod">modifiche non salvate</span>':'');
}
function rgStatoDom(){const e=$('#rgStato');if(e)e.innerHTML=rgStatoTesto()}
function rgModif(){
  const s=RG.s,key=RG.key;s.dirty=true;s.msg='';
  clearTimeout(rgTimer);
  rgTimer=setTimeout(()=>rgBozzaSalva(key,{dati:s.dati,baseRev:s.baseRev,ts:new Date().toISOString()}),300);   /* anche se nel frattempo si cambia turno */
  rgStatoDom();
}
async function rgSalva(invia,forza,rerender){
  const s=RG.s,c=RG.ctx,key=RG.key;if(s.salvando)return;
  s.salvando=true;s.msg='';s.err='';s.conflitto=false;
  s.dati.righe.forEach((r,i)=>{r.n=i+1});
  const soloInvio=invia&&!s.dirty&&s.rev!==null;
  const r=await Store.salvaRegistro(c.k,c.n,c.L,c.p.id,soloInvio?null:s.dati,s.baseRev,invia,forza);
  s.salvando=false;
  if(RG.key!==key)return;
  if(r.ok){
    clearTimeout(rgTimer);rgBozzaSalva(key,null);
    s.baseRev=r.rev;s.rev=r.rev;s.inviatoRev=r.inviatoRev;s.inviatoIl=r.inviatoIl;s.dirty=false;
    s.msg=invia?(c.L==='S'?`Registro salvato e segnato come concluso (revisione ${pad(r.rev)}).`:`Registro salvato e inviato (revisione ${pad(r.rev)}).`):`Registro salvato (revisione ${pad(r.rev)}).`;
  }else if(r.conflitto){s.conflitto=true;s.attuale=r.attuale}
  else s.err=r.rete?'Senza connessione: le modifiche restano sul dispositivo come bozza. Riprova quando torna la rete.':'Salvataggio non riuscito: '+(r.errore||'errore sconosciuto');
  if(r.ok&&invia){s.mailRes=null;s.mailInCorso=!!Store.mailAttive&&c.L!=='S'}
  rerender();
  if(r.ok&&invia&&c.L!=='S')await rgAvvisa(rerender);                     /* il supervisore non invia nulla: nessuna mail */                    /* l'invio è già avvenuto: un errore di mail non lo annulla */
}
/* Avviso mail al coordinatore (V00.12): la funzione server sceglie destinatari e testo dal database. */
async function rgAvvisa(rerender){
  const s=RG.s,c=RG.ctx,key=RG.key;if(!s||!Store.mailAttive||!Store.inviaMail)return;
  s.mailInCorso=true;s.mailRes=null;rerender();
  let r;try{r=await Store.inviaMail({azione:'registro',mese:c.k,turno:c.n,ruolo:c.L,persona_id:c.p.id})}catch(e){r={ok:false,errore:e.message||String(e)}}
  if(RG.key!==key)return;
  s.mailInCorso=false;s.mailRes=Mail.esito(r);rerender();
}
const rgVerifiche=()=>verificaRegistro(RG.ctx.L,{righe:RG.s.dati.righe,a:RG.ctx.a,b:RG.ctx.b});
/* Verifiche incrociate: coordinatore ↔ addetti (V00.13.2) e supervisore ↔ coordinatore (V00.14). {stato:'na'|'cic'|'err'|'ok', lista, err} */
function rgIncrociate(){
  const c=RG.ctx,ad=RG.ad;
  if(!c||c.L==='A')return{stato:'na',lista:[]};
  if(!ad||ad.key!==rgAdKey(c)||ad.stato==='cic')return{stato:'cic',lista:[]};
  if(ad.stato==='err')return{stato:'err',lista:[],err:ad.err};
  const sommario=g=>g?{righe:(g.dati&&g.dati.righe)||[],rev:g.rev,inviatoRev:g.inviatoRev}:null;
  if(c.L==='S')return{stato:'ok',lista:verificaIncrociataSC(RG.s.dati.righe,ad.coords.map(x=>({n:x.n,reg:sommario(x.id?ad.regsC[x.id]:null)})))};
  return{stato:'ok',lista:verificaIncrociata(RG.s.dati.righe,ad.lista.map(x=>({id:x.id,n:x.n,reg:sommario(x.id?ad.regs[x.id]:null)})))};
}
/* Totali (minuti) di reperibilità e straordinario dal riepilogo di una persona, correzioni manuali comprese: gli stessi numeri del PDF. */
function rgTotaliPers(c,pers,L,dati,rett){
  const eff=riepilogoEffettivo(riepilogoAuto({ruolo:L,p:pers,k:c.k,n:c.n,a:c.a,b:c.b,righe:dati.righe}),dati.ov||{});
  const tot=k=>eff.filter(x=>x.inc).reduce((t,x)=>t+Math.round(x[k]*60),0);
  const o={rep:tot('rep'),str:tot('str'),rr:false,rs:false};o.cRep=o.rep;o.cStr=o.str;   /* cRep/cStr = valori calcolati dal riepilogo */
  if(rett){if(rett.rep!=null){o.rep=rett.rep;o.rr=true}if(rett.str!=null){o.str=rett.str;o.rs=true}}   /* V00.14.2: rettifica del supervisore */
  return o;
}
/* Composizione del turno con i totali di ciascuno (V00.14.1, scheda Supervisore): [{ruolo,nome,rep,str,nota}] in minuti.
   rep/str = null se la persona non ha un registro inviato (non entra nei totali). */
function rgComposizione(){
  const c=RG.ctx,ad=RG.ad;if(!c||c.L!=='S'||!RG.s||!ad||ad.stato!=='ok')return null;
  const inviato=g=>g&&g.inviatoRev!==null&&g.inviatoRev!==undefined;
  const riga=(ruolo,x,g,L)=>{
    if(!x.id||!inviato(g))return{ruolo,nome:x.n,rep:null,str:null,nota:!x.id?'non è nell’anagrafica':'registro non inviato'};
    const pers=ANAG.find(p=>p.id===x.id)||{id:x.id,n:x.n};
    return Object.assign({ruolo,nome:x.n,nota:g.rett&&!rgRettValida(g)?'rettifica da riconfermare (registro rinviato)':''},rgTotaliPers(c,pers,L,{righe:(g.dati&&g.dati.righe)||[],ov:(g.dati&&g.dati.ov)||{}},rgRettValida(g)?g.rett:null));
  };
  const o=[Object.assign({ruolo:'Supervisore',nome:c.p.n,nota:''},rgTotaliPers(c,c.p,'S',RG.s.dati))],vice=c.tt&&c.tt.VICE;
  for(const x of ad.coords)o.push(riga('Coordinatore',x,x.id?ad.regsC[x.id]:null,'C'));
  for(const x of ad.lista)o.push(riga(vice&&(x.id?x.id===vice.id:x.n===vice.n)?'Vice coordinatore':'Addetto',x,x.id?ad.regs[x.id]:null,'A'));
  return o;
}
/* La stessa composizione come tabella a schermo (passo «Registri del turno») */
function rgTabComposizione(){
  const T=rgComposizione();if(!T)return '';
  const hm=v=>v==null?'—':fmtHM(v);
  return `<div class="sec" style="margin-top:12px"><h3>Composizione del turno e ore</h3>
    <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">Le ore vengono dal riepilogo di ciascuno (correzioni manuali comprese). Chi non ha ancora inviato il registro compare con «—» e non entra nei totali. È la tabella che trovi nella copertina del fascicolo completo.</p>
    <div class="tw"><table class="rg-comp"><thead><tr><th>Ruolo</th><th>Nominativo</th><th class="num">Ore reperibilità</th><th class="num">Ore straordinario</th><th class="num">Totale ore</th></tr></thead><tbody>${
      T.map(r=>`<tr><td>${esc(r.ruolo)}</td><td><b>${esc(r.nome||'—')}</b>${r.nota?`<br><small class="mod">${esc(r.nota)}</small>`:''}</td><td class="num">${hm(r.rep)}${r.rr?'*':''}</td><td class="num">${hm(r.str)}${r.rs?'*':''}</td><td class="num">${r.rep==null?'—':fmtHM(r.rep+r.str)+(r.rr||r.rs?'*':'')}</td></tr>`).join('')
    }</tbody></table></div>${T.some(r=>r.rr||r.rs)?'<p style="margin:8px 0 0;font-size:.85rem;color:var(--muted)">* Valore rettificato dal supervisore (vedi «Rettifica» nell’elenco qui sopra e il report della persona).</p>':''}</div>`;
}
/* Fascicolo: C = coordinatore + addetti che hanno inviato; S = copertina + supervisore + coordinatore + addetti (ciascuno con il proprio «visto»). */
function rgFascicolo(){
  const c=RG.ctx,ad=RG.ad;if(!c||c.L==='A'||!ad||ad.stato!=='ok')return null;
  const S=c.L==='S',inviato=g=>g&&g.inviatoRev!==null&&g.inviatoRev!==undefined,mancanti=[];let n=0,html='';
  if(S)html+=Stampa.copertina({da:it(c.a),a:it(c.b),supervisore:c.p.n,coordinatore:ad.coords.map(x=>x.n).join(', ')||(c.tt&&c.tt.COO?c.tt.COO.n:''),addetti:ad.lista.map(x=>x.n),dirigente:CONFIG.dirigente||'',tabella:rgComposizione()});
  html+=(S?Stampa.supervisore:Stampa.coordinatore)(rgDatiStampa());
  if(S)for(const x of ad.coords){const g=x.id?ad.regsC[x.id]:null;if(!inviato(g)){mancanti.push(x.n);continue}html+=rgAdReport(c,x,g,'C').html;n++}
  for(const x of ad.lista){const g=x.id?ad.regs[x.id]:null;if(!inviato(g)){mancanti.push(x.n);continue}html+=rgAdReport(c,x,g,'A').html;n++}
  return{html,n,mancanti,nomeFile:Stampa.nomeFile(c.L,{k:c.k,n:c.n,a:c.a,b:c.b,nome:c.p.n,persona:c.p,rev:RG.s.rev,completo:true})};
}
function rgScaricaFascicolo(){
  const f=rgFascicolo();if(!f)return;
  if(f.mancanti.length&&!confirm(`${f.mancanti.length===1?'Una persona non ha':f.mancanti.length+' persone non hanno'} un registro inviato e non ${f.mancanti.length===1?'sarà inclusa':'saranno incluse'} nel fascicolo: ${f.mancanti.join(', ')}.\n\nContinuare?`))return;
  Stampa.stampa(f.html,f.nomeFile);
}

/* ---------- eventi ---------- */
function rgSetRiga(i,f,v){
  const r=RG.s.dati.righe[i];if(!r)return;
  r[f]=v;
  const aggiorna=()=>{const a=durataAuto(r.ora,r.fine);r.durata=a===null?'':fmtHM(a);const el=document.querySelector(`[data-i="${i}"][data-f="durata"]`);if(el)el.value=r.durata};
  if((f==='ora'||f==='fine')&&r.durAuto)aggiorna();
  if(f==='durata'){const t=v.trim(),a=durataAuto(r.ora,r.fine);r.durAuto=t===''||(a!==null&&t===fmtHM(a));if(t==='')aggiorna()}
  rgModif();
}
function rgEff(){
  const c=RG.ctx,s=RG.s;
  return riepilogoEffettivo(riepilogoAuto({ruolo:c.L,p:c.p,k:c.k,n:c.n,a:c.a,b:c.b,righe:s.dati.righe}),s.dati.ov);
}
function rgTotaliDom(){
  const eff=rgEff(),a=$('#rgTotRep'),b=$('#rgTotStr');
  if(a)a.textContent=totaleHM(eff,'rep');if(b)b.textContent=totaleHM(eff,'str');
}
function rgSetOre(g,campo,v,el){
  const ov=RG.s.dati.ov,x=parseHM(v);ov[g]=ov[g]||{};
  if(x!==null)ov[g][campo]=x;else if(v.trim()==='')delete ov[g][campo];else return;   /* testo non valido: si ignora finché non lo è */
  if(!Object.keys(ov[g]).length)delete ov[g];
  if(el)el.classList.toggle('man',x!==null);
  rgTotaliDom();rgModif();
}
RG.onInput=function(e){
  const t=e.target,s=RG.s;if(!s||s.stato!=='ok'||RG.ctx.sola)return;
  if(t.dataset.rt!==undefined){if(RG.ad&&RG.ad.rf)RG.ad.rf[t.dataset.rt]=t.value;return}   /* modulo di rettifica: nessun ricalcolo */
  if(t.dataset.f!==undefined&&t.dataset.i!==undefined&&t.type!=='checkbox')rgSetRiga(+t.dataset.i,t.dataset.f,t.value);
  else if(t.dataset.c==='rep'||t.dataset.c==='str')rgSetOre(t.dataset.g,t.dataset.c,t.value,t);
};
RG.onChange=function(e,rerender){
  const t=e.target,s=RG.s;if(!s||s.stato!=='ok'||RG.ctx.sola)return;
  if(t.dataset.f==='addetto'&&t.dataset.i!==undefined){                  /* addetti coinvolti (coordinatore): elenco di {id,n} */
    const r=s.dati.righe[+t.dataset.i];if(!r)return;const[id,...nn]=t.value.split('|'),n=nn.join('|'),x={id:id?+id:null,n};
    r.addetti=(r.addetti||[]).filter(y=>!(x.id?y.id===x.id:y.n===x.n));if(t.checked)r.addetti.push(x);
    rgModif();return}
  if(t.dataset.c==='inc'){const ov=s.dati.ov;ov[t.dataset.g]=Object.assign(ov[t.dataset.g]||{},{inc:t.checked});rgModif();rerender();return}
  if(t.dataset.c==='rep'||t.dataset.c==='str'){const x=rgEff().find(y=>y.g===t.dataset.g);if(x)t.value=oreHM(x[t.dataset.c])}   /* normalizza il formato */
};
RG.onClick=async function(b,rerender){
  const a=b.dataset.rg,s=RG.s,c=RG.ctx;if(!s)return;
  if(a==='add'){s.dati.righe.push(rgRiga(rgDataDefault(c,s.dati.righe),c.L));rgModif();rerender();return}
  if(a==='del'){const i=+b.dataset.i;if(!confirm(`Eliminare l’evento n° ${i+1}?`))return;s.dati.righe.splice(i,1);rgModif();rerender();return}
  if(a==='ordina'){s.dati.righe.sort((p,q)=>(p.data+(p.ora||'')).localeCompare(q.data+(q.ora||'')));rgModif();rerender();return}
  if(a==='resetOre'){if(!confirm('Ripristinare i valori calcolati automaticamente nel riepilogo?'))return;s.dati.ov={};rgModif();rerender();return}
  if(a==='salva'){await rgSalva(false,false,rerender);return}
  if(a==='pdf'){
    if(!c.sola&&(s.dirty||s.rev===null)){
      if(!confirm('Il PDF riporta l’ultima revisione salvata. Salvare ora le modifiche?'))return;
      await rgSalva(false,false,rerender);if(RG.s.dirty||RG.s.rev===null)return;
    }
    if(RG.s.rev===null){alert('Il registro non è ancora stato salvato: non c’è una revisione da stampare.');return}
    rgPdf();return;
  }
  if(a==='invia'){
    const av=rgVerifiche().concat(rgIncrociate().lista);
    const S=c.L==='S',dest=RG_DEST[c.L],testo=S?(av.length?`Ci sono ${av.length} avvisi nelle verifiche (non bloccanti). Segnare comunque il registro come concluso?`:'Segnare il registro come concluso?'):(av.length?`Ci sono ${av.length} avvisi nelle verifiche (non bloccanti). Inviare comunque il registro al ${dest}?`:`Inviare il registro al ${dest}?`);
    if(!confirm(testo))return;await rgSalva(true,false,rerender);return;
  }
  if(a==='avvisa'){await rgAvvisa(rerender);return}
  if(a==='adApri'){const a0=RG.ad;if(a0)a0.aperto=a0.aperto===+b.dataset.id?null:+b.dataset.id;rerender();return}
  if(a==='rtApri'){rgRtApri(+b.dataset.id,b.dataset.ru||'A',rerender);return}
  if(a==='rtAnnulla'){if(RG.ad)RG.ad.rf=null;rerender();return}
  if(a==='rtSalva'){await rgRtSalva(rerender);return}
  if(a==='rtTogli'){await rgRtTogli(rerender);return}
  if(a==='rtRiconferma'){await rgRtRiconferma(+b.dataset.id,b.dataset.ru||'A',rerender);return}
  if(a==='adVisto'||a==='adTogli'){await rgAdVisto(+b.dataset.id,a==='adTogli',rerender,b.dataset.ru||'A');return}
  if(a==='adReport'){const a0=RG.ad;if(a0){a0.report={id:+b.dataset.id,L:b.dataset.ru||'A'};rerender();window.scrollTo(0,0)}return}
  if(a==='adReportChiudi'){const a0=RG.ad;if(a0){a0.report=null;rerender()}return}
  if(a==='adReportStampa'){const a0=RG.ad,L=a0&&a0.report&&a0.report.L,x=a0&&a0.report&&(L==='C'?a0.coords:a0.lista).find(y=>y.id===a0.report.id),g=x&&(L==='C'?a0.regsC:a0.regs)[x.id];if(g){const r=rgAdReport(c,x,g,L);Stampa.stampa(r.html,r.nomeFile)}return}
  if(a==='fascicolo'){rgScaricaFascicolo();return}
  if(a==='adRicarica'){RG.ad=null;await rgAdApri(c,rerender);return}
  if(a==='sovrascrivi'){await rgSalva(false,true,rerender);return}
  if(a==='ricarica'){rgBozzaSalva(RG.key,null);const c0=RG.ctx;RG.reset();rgApri(c0,rerender);return}
  if(a==='ripristina'){s.dati=rgSistema(s.bozza.dati);s.bozza=null;rgModif();rerender();return}
  if(a==='scarta'){rgBozzaSalva(RG.key,null);s.bozza=null;rerender();return}
};

/* ---------- PDF (grafica V05.20, vedi core/stampa.js) ---------- */
/* Dati per il motore di stampa di un registro (anche di un altro: c.p e c.L dicono di chi e di che ruolo). */
/* Rettifica del supervisore (V00.14.2): vale solo per la revisione inviata (rett.rev = inviatoRev); altrimenti è «da riconfermare» e non si applica. */
const rgRettValida=g=>!!g&&!!g.rett&&g.inviatoRev!==null&&g.inviatoRev!==undefined&&g.rett.rev===g.inviatoRev;
/* «112», «112:30» → minuti (fino a 1240 ore); null se il formato non è valido */
const rgParseTot=t=>{const m=/^(\d{1,4})(?::([0-5]\d))?$/.exec(String(t).trim());if(!m)return null;const v=(+m[1])*60+(+(m[2]||0));return v<=74400?v:null};
function rgStampaDati(c,dati,rev,vistoDmy,vistoSDmy,rett){
  const eff=riepilogoEffettivo(riepilogoAuto({ruolo:c.L,p:c.p,k:c.k,n:c.n,a:c.a,b:c.b,righe:dati.righe}),dati.ov||{}),[y,m]=c.k.split('-').map(Number);
  const rows=k=>eff.filter(x=>x.inc).map(x=>[it(parse(x.g)),Math.round(x[k]*60)]);   /* ore → minuti interi */
  const tot=k=>rows(k).reduce((t,r)=>t+r[1],0);
  return{D:{anno:y,mese:m,rev},nome:c.p.n,persona:c.p,
    coordinatore:c.tt&&c.tt.COO?c.tt.COO.n:'',supervisore:c.tt&&c.tt.SUP?c.tt.SUP.n:'',da:it(c.a),a:it(c.b),
    righe:dati.righe.map((r,i)=>c.L==='S'
      ?[String(i+1),r.data?it(parse(r.data)):'',r.ora||'',r.rich||'',r.via||'',r.km||'',r.motivo||'',r.sopr||'',r.arrivo||'',r.fine||'',r.presCoo||'',r.descr||'',r.durata||'',r.note||'']
      :c.L==='C'
      ?[String(i+1),r.data?it(parse(r.data)):'',r.ora||'',r.rich||'',r.via||'',r.km||'',r.motivo||'',r.tipo||'',rgAddettiTesto(r),r.arrivo||'',r.fine||'',r.imprese||'',r.sopr||'',r.soprSup||'',r.effic||'',r.durata||'',r.note||'']
      :[String(i+1),r.data?it(parse(r.data)):'',r.ora||'',r.rich||'',r.via||'',r.km||'',r.motivo||'',r.arrivo||'',r.descr||'',r.fine||'',r.durata||'',r.note||'']),
    rep:{rows:rows('rep'),tot:tot('rep')},str:{rows:rows('str'),tot:tot('str')},
    rett:rett?{rep:rett.rep==null?null:rett.rep,str:rett.str==null?null:rett.str,repOrig:tot('rep'),strOrig:tot('str'),motivo:rett.motivo||'',chi:rett.chi||'',il:rett.il?rgDmy(rett.il):''}:null,
    ...(c.L==='S'?{dirigente:CONFIG.dirigente||''}:c.L==='C'?{vistoS:vistoDmy||''}:{vistoC:vistoDmy||'',vistoS:vistoSDmy||''})};
}
function rgDatiStampa(){return rgStampaDati(RG.ctx,RG.s.dati,RG.s.rev,rgVistoValido()?rgDmy(RG.s.vistoIl):'',rgVistoSValido()?rgDmy(RG.s.vistoSIl):'',rgRettValida(RG.s)?RG.s.rett:null)}
const rgAddettiTesto=r=>[...(r.addetti||[]).map(x=>x.n),...(r.addettiAltri&&r.addettiAltri.trim()?[r.addettiAltri.trim()]:[])].join(', ');
function rgPdf(){
  const c=RG.ctx,o=rgDatiStampa();
  Stampa.stampa(c.L==='S'?Stampa.supervisore(o):c.L==='C'?Stampa.coordinatore(o):Stampa.addetto(o),Stampa.nomeFile(c.L,{k:c.k,n:c.n,a:c.a,b:c.b,nome:c.p.n,persona:c.p,rev:RG.s.rev}));
}

/* ---------- viste ---------- */
function rgTop(){
  const ed=!RG.ctx.sola;
  return `<div class="rg-top"><span id="rgStato">${rgStatoTesto()}</span><span class="sp"></span>${ed?'<button class="go" data-rg="salva">Salva</button>':''}</div>`;
}
function rgBanner(){
  const s=RG.s,c=RG.ctx,o=[];
  if(c.sola)o.push(`<div class="alerts"><h3>Sola lettura</h3>${Store.offline?'Senza connessione i registri non si possono modificare.':'Stai guardando il registro di un’altra persona (anteprima): non è modificabile.'}</div>`);
  if(s.conflitto)o.push(`<div class="alerts"><h3>Registro modificato altrove</h3>Nel database c’è una versione diversa dalla tua${s.attuale!==null&&s.attuale!==undefined?` (revisione ${pad(s.attuale)})`:''}. <button class="mini" data-rg="sovrascrivi">Sovrascrivi con la mia versione</button><button class="mini" data-rg="ricarica">Ricarica dal database</button></div>`);
  if(s.bozza)o.push(`<div class="alerts"><h3>Modifiche non salvate</h3>Su questo dispositivo c’è una bozza del ${esc(new Date(s.bozza.ts).toLocaleString('it-IT'))}. <button class="mini" data-rg="ripristina">Ripristina</button><button class="mini" data-rg="scarta">Scarta</button></div>`);
  if(s.err)o.push(`<div class="alerts"><h3>Attenzione</h3>${esc(s.err)}</div>`);
  if(s.mailInCorso)o.push(`<p class="ok" style="margin:0 0 10px">Invio dell’avviso mail al ${RG_DEST[c.L]}…</p>`);
  else if(s.mailRes)o.push(s.mailRes.ok?`<p class="ok" style="margin:0 0 10px">${esc(s.mailRes.t)}</p>`:`<div class="alerts"><h3>Il registro è inviato, ma l’avviso mail no</h3>${esc(s.mailRes.t)} <button class="mini" data-rg="avvisa">Riprova l’avviso</button></div>`);
  if(s.msg)o.push(`<p class="ok" style="margin:0 0 10px">${esc(s.msg)}</p>`);
  return o.join('');
}
const rgNav=p=>{const tot=RG_PASSI[RG.ctx.L].length;return `<div class="tool rg-nav">${p>2?`<button class="ghost" data-rg="passo" data-p="${p-1}">← Indietro</button>`:`<button class="ghost" data-rg="passo" data-p="1">← Turno</button>`}<span class="sp"></span>${p<tot?`<button class="go" data-rg="passo" data-p="${p+1}">Avanti →</button>`:''}</div>`};

function rgCard(r,i,ed,L,c){
  const d=ed?'':' disabled',C=L==='C';
  const f=(k,lab,tipo='text',extra='')=>`<label>${lab}<input type="${tipo}" data-i="${i}" data-f="${k}" value="${esc(r[k]||'')}"${d} ${extra}></label>`;
  const ta=(k,lab)=>`<label class="rg-w">${lab}<textarea data-i="${i}" data-f="${k}" rows="2"${d}>${esc(r[k]||'')}</textarea></label>`;
  const sn=(k,lab)=>`<label>${lab}<select data-i="${i}" data-f="${k}"${d}><option value="">—</option>${['Sì','No'].map(v=>`<option${r[k]===v?' selected':''}>${v}</option>`).join('')}</select></label>`;
  const S=L==='S';
  const top=`${f('data','Data','date')}${f('ora','Ora chiamata','time')}${f('rich','Soggetto richiedente')}${f('via','SP o SR','text','placeholder="es. SP 3"')}${f('km','Km','text','inputmode="decimal"')}${f('motivo','Motivo della chiamata')}`;
  if(S)return `<div class="rg-ev"><div class="rg-h"><b>Evento n° ${i+1}</b>${ed?`<button class="mini" data-rg="del" data-i="${i}">Elimina</button>`:''}</div>
    <div class="rg-g">${top}${sn('sopr','Sopralluogo diretto')}${f('arrivo','Orario arrivo sul posto (solo se sopralluogo diretto)','time')}${f('fine','Orario chiusura sopralluogo','time')}${sn('presCoo','Presenza coordinatore')}
      ${ta('descr','Descrizione intervento')}${f('durata','Impegno totale (diretto e/o da remoto) h:mm','text','placeholder="h:mm" inputmode="numeric"')}${ta('note','Note')}</div></div>`;
  if(!C)return `<div class="rg-ev"><div class="rg-h"><b>Evento n° ${i+1}</b>${ed?`<button class="mini" data-rg="del" data-i="${i}">Elimina</button>`:''}</div>
    <div class="rg-g">${top}${f('arrivo','Orario arrivo sul posto','time')}${f('fine','Ora fine intervento','time')}${f('durata','Durata complessiva (h:mm)','text','placeholder="h:mm" inputmode="numeric"')}
      ${ta('descr','Descrizione intervento effettuato')}${ta('note','Note')}</div></div>`;
  const ad=rgAddettiTurno(c),sel=r.addetti||[];
  const chips=ad.map(x=>{const v=(x.id||'')+'|'+x.n,on=sel.some(y=>x.id?y.id===x.id:y.n===x.n);
    return `<label class="chk"><input type="checkbox" data-i="${i}" data-f="addetto" value="${esc(v)}"${on?' checked':''}${d}>${esc(x.n)}</label>`}).join('');
  /* addetti già scelti ma non più nel turno: restano visibili (e deselezionabili) */
  const fuori=sel.filter(y=>!ad.some(x=>x.id?y.id===x.id:y.n===x.n)).map(y=>`<label class="chk"><input type="checkbox" data-i="${i}" data-f="addetto" value="${esc((y.id||'')+'|'+y.n)}" checked${d}>${esc(y.n)}</label>`).join('');
  return `<div class="rg-ev"><div class="rg-h"><b>Evento n° ${i+1}</b>${ed?`<button class="mini" data-rg="del" data-i="${i}">Elimina</button>`:''}</div>
    <div class="rg-g">${top}${f('tipo','Tipologia intervento')}
      <div class="rg-w"><span class="rg-l">Addetti coinvolti</span><div class="rg-chips">${chips||'<small style="color:var(--muted)">Nessun addetto nel turno</small>'}${fuori}</div>
        <label style="margin-top:6px">Altri addetti attivati (testo libero)<input type="text" data-i="${i}" data-f="addettiAltri" value="${esc(r.addettiAltri||'')}"${d}></label></div>
      ${f('arrivo','Orario arrivo sul posto (addetti o imprese)','time')}${f('fine','Orario chiusura intervento','time')}${f('imprese','Imprese coinvolte')}
      ${sn('sopr','Sopralluogo diretto')}${sn('soprSup','Sopralluogo supervisore')}${f('effic','Efficacia intervento')}
      ${f('durata','Impegno totale (diretto e/o da remoto) h:mm','text','placeholder="h:mm" inputmode="numeric"')}${ta('note','Note')}</div></div>`;
}
function rgViewRegistro(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,iv=intervalli(s.dati.righe),tot=iv.reduce((x,v)=>x+v.dur,0);
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>${RG_TITOLO[c.L]}</h3>
      <p class="rg-sub">Provincia di Pisa · settore viabilità<br>Turno di reperibilità dalle ore 00:00 del ${it(c.a)} alle ore 23:59 del ${it(c.b)}</p>
      ${s.dati.righe.length?s.dati.righe.map((r,i)=>rgCard(r,i,ed,c.L,c)).join(''):`<p class="soon" style="padding:20px">Nessun intervento registrato.${ed?' Aggiungi un intervento quando serve: se non ce ne sono stati, puoi passare direttamente al riepilogo.':''}</p>`}
      <div class="tool">${ed?'<button class="go" data-rg="add">Aggiungi intervento</button><button class="ghost" data-rg="ordina">Ordina per data e ora</button>':''}<span class="sp"></span>
        <span style="color:var(--muted);font-size:.9rem">Interventi: ${s.dati.righe.length} · ${c.L!=='A'?'impegno totale':'durata totale'} ${fmtHM(tot)}</span></div></div>${rgNav(2)}`;
}
/* Avviso alla persona: il supervisore ha rettificato i suoi totali (V00.14.2) */
function rgAvvisoRett(c){
  const s=RG.s;if(!rgRettValida(s)||c.L==='S')return '';
  const t=s.rett,o=rgTotaliPers(c,c.p,c.L,s.dati,null),parti=[];
  if(t.rep!=null)parti.push(`reperibilità <b>${fmtHM(t.rep)}</b> (calcolato ${fmtHM(o.cRep)})`);
  if(t.str!=null)parti.push(`straordinario <b>${fmtHM(t.str)}</b> (calcolato ${fmtHM(o.cStr)})`);
  return `<div class="rg-rt"><b>Totali rettificati dal supervisore${t.chi?' '+esc(t.chi):''}${t.il?' il '+rgDmy(t.il):''}</b>: ${parti.join(' · ')}.<br>Motivazione: <i>${esc(t.motivo)}</i><br><small>Il riepilogo qui sotto resta quello da te inserito; i totali rettificati compaiono nel report e nella copertina del fascicolo.</small></div>`;
}
function rgViewRiepilogo(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,eff=rgEff(),nome=c.p.n,C=c.L==='C',S=c.L==='S';
  const [y,m]=c.k.split('-').map(Number),vv=rgVistoValido()?rgDmy(s.vistoIl):'',vvS=rgVistoSValido()?rgDmy(s.vistoSIl):'';
  const cella=(g,k,x)=>ed?`<input class="ore${x.man[k]?' man':''}" data-g="${g}" data-c="${k}" value="${oreHM(x[k])}" inputmode="numeric" placeholder="h:mm" aria-label="${k==='rep'?'Ore di reperibilità':'Ore di straordinario'} del ${it(parse(g))} (ore:minuti)">`:oreHM(x[k]);
  const r1=eff.map((x,i)=>`<tr class="${x.inc?'':'off'}">${i===0?`<td rowspan="${eff.length}" class="nom">${esc(nome)}</td>`:''}
      <td><label class="chk" style="gap:8px">${ed?`<input type="checkbox" data-g="${x.g}" data-c="inc"${x.inc?' checked':''} aria-label="Includi il ${it(parse(x.g))}">`:''}${it(parse(x.g))}</label></td><td class="num">${cella(x.g,'rep',x)}</td></tr>`).join('');
  const inc=eff.filter(x=>x.inc);
  const r2h=inc.length?inc.map((x,i)=>`<tr>${i===0?`<td rowspan="${inc.length}" class="nom">${esc(nome)}</td>`:''}<td>${it(parse(x.g))}</td><td class="num">${cella(x.g,'str',x)}</td></tr>`).join(''):'<tr><td class="nom">—</td><td colspan="2">Nessun giorno incluso</td></tr>';
  const ha=Object.keys(s.dati.ov).length>0,sup=c.tt&&c.tt.SUP?c.tt.SUP.n:'',coo=c.tt&&c.tt.COO?c.tt.COO.n:'';
  /* intestazione e firme identiche al PDF (stampa.js) */
  const firme=S?stFirma('IL SUPERVISORE',nome,true,null,c.p)+stFirma('IL DIRIGENTE',CONFIG.dirigente||'')
    :C?stFirma('IL COORDINATORE',nome,true,null,c.p)+stFirma('IL SUPERVISORE',sup,!!vv,vv)
    :stFirma('L’ADDETTO',nome,true,null,c.p)+stFirma('IL COORDINATORE',coo,!!vv,vv)+stFirma('IL SUPERVISORE',sup,!!vvS,vvS);
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Riepilogo del turno</h3>${rgAvvisoRett(c)}
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">Precompilato dal turno e dal registro. Puoi correggere le ore (formato ore:minuti, es. 5:30), oppure togliere un giorno (es. malattia o permesso) con la casella. I valori corretti a mano sono evidenziati.</p>
      <div class="rg-doc">
        ${stHead({anno:y,mese:m,rev:s.rev},c.L)}
        <p class="st-rp">${stT1(nome)}</p>
        <div class="tw"><table><thead><tr><th>NOMINATIVO DIPENDENTE</th><th>GIORNI</th><th>ORE</th></tr></thead><tbody>${r1}
          <tr class="tot"><td></td><td>TOTALE ORE</td><td class="num" id="rgTotRep">${totaleHM(eff,'rep')}</td></tr></tbody></table></div>
        <p class="st-rp">${ST_T2}</p>
        <div class="tw"><table><thead><tr><th>NOMINATIVO DIPENDENTE</th><th>GIORNI</th><th>ORE</th></tr></thead><tbody>${r2h}
          <tr class="tot"><td></td><td>TOTALE ORE</td><td class="num" id="rgTotStr">${totaleHM(eff,'str')}</td></tr></tbody></table></div>
        <div class="st-sg">${firme}</div>
      </div>
      ${ed&&ha?'<div class="tool" style="margin-top:12px"><button class="ghost" data-rg="resetOre">Ripristina i valori automatici</button></div>':''}</div>${rgNav(3)}`;
}
/* Sezione di coerenza con i registri degli altri (coordinatore: con gli addetti · supervisore: con il coordinatore) */
function rgViewIncrociate(){
  const S=RG.ctx.L==='S',r=rgIncrociate(),li=(a,t,cls)=>a.length?`<div class="${cls}"><h3>${t} (${a.length})</h3><ul>${a.map(v=>`<li><b>${v.riga?`Evento n° ${v.riga}`:(S?'Registro coordinatore':'Registro addetto')}</b> · ${esc(v.chi)}: ${esc(v.t)}</li>`).join('')}</ul></div>`:'';
  let corpo;
  if(r.stato==='cic')corpo='<p class="soon" style="padding:14px 0">Caricamento dei registri…</p>';
  else if(r.stato==='err')corpo=`<div class="alerts lieve"><h3>Confronto non disponibile</h3>${esc(r.err||'errore di lettura')} <button class="mini" data-rg="adRicarica">Riprova</button></div>`;
  else corpo=r.lista.length?li(r.lista.filter(a=>a.lv==='x'),'Anomalie','alerts')+li(r.lista.filter(a=>a.lv==='l'),'Da verificare','alerts lieve'):`<div class="esito"><b>Nessuna incoerenza con ${S?'il registro del coordinatore':'i registri degli addetti'}.</b></div>`;
  return `<div class="sec"><h3>${S?'Coerenza con il coordinatore':'Coerenza con gli addetti'}</h3>
    <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">${S?'Confronto con il registro già inviato dal coordinatore (tolleranza ±15 minuti sulla chiamata; si controllano anche sopralluogo del supervisore e presenza del coordinatore).':'Confronto con i registri già inviati dagli addetti (tolleranza ±15 minuti su chiamata, arrivo e fine).'} Anche queste verifiche sono solo un aiuto: non bloccano nulla e non restano scritte nel report.</p>${corpo}</div>`;
}
function rgViewVerifica(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,av=rgVerifiche(),x=av.filter(a=>a.lv==='x'),l=av.filter(a=>a.lv==='l');
  const lista=(a,titolo,cls)=>a.length?`<div class="${cls}"><h3>${titolo} (${a.length})</h3><ul>${a.map(v=>`<li><b>Evento n° ${v.riga}</b>: ${esc(v.t)}</li>`).join('')}</ul></div>`:'';
  const L=c.L,S=L==='S',C=L==='C',dest=RG_DEST[L],resp=C?(c.tt&&c.tt.SUP?c.tt.SUP.n:null):S?null:(c.tt&&c.tt.COO?c.tt.COO.n:null),respEt=C?'Supervisore del turno':'Coordinatore del turno';
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Verifiche</h3>
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">Le verifiche sono solo un aiuto: non bloccano il salvataggio né l’invio e non restano scritte nel report.</p>
      ${av.length?lista(x,'Anomalie','alerts')+lista(l,'Da verificare','alerts lieve'):`<div class="esito"><b>Nessuna anomalia rilevata.</b>${s.dati.righe.length?'':' Il registro non contiene interventi.'}</div>`}</div>
    ${L!=='A'?rgViewIncrociate():''}
    <div class="sec"><h3>${S?'Conclusione':'Invio'}</h3>
      <div class="grid2"><div class="box"><span>${S?'Dopo la stampa':'Destinatario'}</span><b>${S?'Consegna in cartaceo al Dirigente, per la firma':(resp?`${respEt}: ${esc(resp)}`:respEt)}</b></div>
        <div class="box"><span>Stato</span><b id="rgStatoB">${rgStatoTesto()}</b></div></div>
      ${ed?`<div class="tool" style="margin-top:14px"><button class="ghost" data-rg="salva">Salva</button><button class="go" data-rg="invia">${S?'Salva e segna come concluso':'Salva e invia al '+dest}</button></div>`:''}
      <div class="tool" style="margin-top:6px"><button class="ghost" data-rg="pdf">Scarica PDF</button>${L!=='A'?'<button class="ghost" data-rg="fascicolo"'+(RG.ad&&RG.ad.stato==='ok'?'':' disabled')+'>Scarica fascicolo completo</button>':''}<span style="color:var(--muted);font-size:.85rem">Si apre la stampa del browser: scegli «Salva come PDF». Il file riporta l’ultima revisione salvata${L!=='A'?`; il fascicolo include anche ${S?'la copertina e i report del coordinatore e degli addetti':'i report degli addetti'} che hanno inviato`:''}.</span></div>
      <p style="color:var(--muted);font-size:.85rem;margin:6px 0 0">${S?'Il report non viene inviato a nessuno: stampa il fascicolo completo e consegnalo in cartaceo al Dirigente per la firma. «Segna come concluso» serve solo a registrare nel database che il tuo registro è finito (nessuna mail).':`L’invio rende il registro disponibile al ${dest} nel database e gli manda una mail di avviso.`}</p></div>${rgNav(RG_PASSI[c.L].length)}`;
}
/* ---------- Registri del turno (V00.13 coordinatore: addetti · V00.14 supervisore: coordinatore + addetti) ---------- */
const rgAdKey=c=>`${c.k}|${c.n}|${c.p?c.p.id:''}`;
async function rgAdApri(c,rerender){
  const key=rgAdKey(c),ad={key,stato:'cic',lista:[],coords:[],regs:{},regsC:{},err:'',aperto:null,report:null,msg:''};RG.ad=ad;
  try{
    for(const r of await Store.registriTurno(c.k,c.n,'A'))ad.regs[r.personaId]=r;
    if(c.L==='S')for(const r of await Store.registriTurno(c.k,c.n,'C'))ad.regsC[r.personaId]=r;
    ad.stato='ok';
  }catch(e){ad.stato='err';ad.err=e.message||String(e)}
  if(!RG.ad||RG.ad.key!==key)return;
  ad.lista=rgAddettiTurno(c);ad.coords=c.L==='S'?rgCoordinatoriTurno(c):[];rerender();
}
/* Visto sul registro inviato di un'altra persona (L = ruolo del registro: 'A' o 'C').
   Chi lo mette dipende dalla scheda: nella scheda Coordinatore è il coordinatore (registri A); nella scheda Supervisore è il supervisore (registri C e, dalla V00.14.1, anche A). */
const rgVistoCome=c=>c.L==='S'?'S':'C';
async function rgAdVisto(pid,togli,rerender,L='A'){
  const c=RG.ctx,ad=RG.ad;if(!ad||c.sola)return;
  const x=(L==='C'?ad.coords:ad.lista).find(y=>y.id===pid),come=rgVistoCome(c);
  if(!togli&&!confirm(`Mettere il tuo visto sul registro di ${x?x.n:'questa persona'}? Vale per la revisione inviata.`))return;
  ad.msg='';const r=await Store.vistaRegistro(c.k,c.n,L,pid,togli,come);
  if(!RG.ad||RG.ad.key!==ad.key)return;
  if(!r.ok)ad.msg='Operazione non riuscita: '+(r.errore||'errore sconosciuto');
  else{const g=(L==='C'?ad.regsC:ad.regs)[pid];if(g){if(L==='A'&&come==='S'){g.vistoSRev=r.vistoRev;g.vistoSIl=r.vistoIl}else{g.vistoRev=r.vistoRev;g.vistoIl=r.vistoIl}}ad.msg=togli?'Visto tolto.':'Visto registrato.'}
  rerender();
}
/* Il report inviato da un addetto (L='A') o dal coordinatore (L='C'), identico al PDF: {html, nomeFile} */
function rgAdReport(c,x,g,L='A'){
  const pers=ANAG.find(p=>p.id===x.id)||{id:x.id,n:x.n},c2=Object.assign({},c,{L,p:pers});
  const inv=g.inviatoRev!==null&&g.inviatoRev!==undefined,vv=inv&&g.vistoRev===g.inviatoRev&&g.vistoIl?rgDmy(g.vistoIl):'';
  const vvS=inv&&g.vistoSRev!==null&&g.vistoSRev!==undefined&&g.vistoSRev===g.inviatoRev&&g.vistoSIl?rgDmy(g.vistoSIl):'';
  const dati={righe:(g.dati&&g.dati.righe)||[],ov:(g.dati&&g.dati.ov)||{}};
  return{html:(L==='C'?Stampa.coordinatore:Stampa.addetto)(rgStampaDati(c2,dati,g.rev,vv,vvS,rgRettValida(g)?g.rett:null)),nomeFile:Stampa.nomeFile(L,{k:c.k,n:c.n,a:c.a,b:c.b,nome:pers.n,persona:pers,rev:g.rev})};
}
function rgAdDettaglio(c,x,g){
  const righe=g.dati&&g.dati.righe||[],pers=ANAG.find(p=>p.id===x.id);
  const eff=pers?riepilogoEffettivo(riepilogoAuto({ruolo:'A',p:pers,k:c.k,n:c.n,a:c.a,b:c.b,righe}),(g.dati&&g.dati.ov)||{}):[];
  const iv=intervalli(righe).reduce((t,v)=>t+v.dur,0);
  const tr=righe.map((r,i)=>`<tr><td>${i+1}</td><td>${r.data?it(parse(r.data)):''}</td><td>${esc(r.ora||'')}</td><td>${esc(r.rich||'')}</td><td>${esc(r.motivo||'')}</td><td>${esc(r.arrivo||'')}</td><td>${esc(r.fine||'')}</td><td>${esc(r.durata||'')}</td></tr>`).join('');
  return `<div class="rg-ad-d">${g.rev>g.inviatoRev?`<p class="err" style="margin:0 0 8px">Dopo l’invio (rev ${pad(g.inviatoRev)}) l’addetto ha salvato la rev ${pad(g.rev)}, non ancora inviata: qui vedi quella più recente.</p>`:''}
    ${righe.length?`<div class="tw"><table><thead><tr><th>N°</th><th>Data</th><th>Chiamata</th><th>Richiedente</th><th>Motivo</th><th>Arrivo</th><th>Fine</th><th>Durata</th></tr></thead><tbody>${tr}</tbody></table></div>`:'<p style="margin:0 0 8px;color:var(--muted)">Nessun intervento registrato.</p>'}
    <p style="margin:8px 0 0;color:var(--muted);font-size:.9rem">Interventi: ${righe.length} · durata ${fmtHM(iv)}${eff.length?` · reperibilità ${totaleHM(eff,'rep')} · straordinario ${totaleHM(eff,'str')} (ore:minuti)`:''}</p></div>`;
}

/* Modulo di rettifica (V00.14.2): totali in h:mm; un campo lasciato uguale al calcolato non viene rettificato. */
function rgRettForm(f,g){
  return `<div class="rg-rf"><h4>Rettifica dei totali · ${esc(f.nome)}</h4>
    <div class="grid2"><label>Totale reperibilità (h:mm)<input data-rt="rep" value="${esc(f.rep)}" inputmode="numeric" placeholder="h:mm" autocomplete="off"></label>
    <label>Totale straordinario (h:mm)<input data-rt="str" value="${esc(f.str)}" inputmode="numeric" placeholder="h:mm" autocomplete="off"></label></div>
    <p class="hint">Calcolati dal riepilogo della persona: reperibilità <b>${fmtHM(f.cRep)}</b> · straordinario <b>${fmtHM(f.cStr)}</b>. Il registro inviato non cambia: la rettifica è salvata a parte e compare nel report e nella copertina.</p>
    <label>Motivazione (obbligatoria)<textarea data-rt="motivo" rows="2" maxlength="300" placeholder="Perché si forza il totale">${esc(f.motivo)}</textarea></label>
    ${f.err?`<p class="err" role="alert">${esc(f.err)}</p>`:''}
    <div class="tool"><button class="go mini" data-rg="rtSalva">Salva rettifica</button><button class="ghost mini" data-rg="rtAnnulla">Annulla</button>${g.rett?'<button class="mini" data-rg="rtTogli">Togli rettifica</button>':''}</div></div>`;
}
const rgRegDi=(ad,L,pid)=>(L==='C'?ad.regsC:ad.regs)[pid];
function rgRtApri(pid,L,rerender){
  const c=RG.ctx,ad=RG.ad;if(!ad||c.sola||c.L!=='S')return;
  const x=(L==='C'?ad.coords:ad.lista).find(y=>y.id===pid),g=rgRegDi(ad,L,pid);if(!x||!g)return;
  const pers=ANAG.find(p=>p.id===pid)||{id:pid,n:x.n},o=rgTotaliPers(c,pers,L,{righe:(g.dati&&g.dati.righe)||[],ov:(g.dati&&g.dati.ov)||{}},null),t=g.rett;
  ad.rf={id:pid,L,nome:x.n,cRep:o.cRep,cStr:o.cStr,rep:fmtHM(t&&t.rep!=null?t.rep:o.cRep),str:fmtHM(t&&t.str!=null?t.str:o.cStr),motivo:t?t.motivo||'':'',err:''};
  rerender();
}
async function rgRtSalva(rerender){
  const c=RG.ctx,ad=RG.ad,f=ad&&ad.rf;if(!f||c.sola)return;
  const rep=rgParseTot(f.rep),str=rgParseTot(f.str),mt=String(f.motivo||'').trim();
  if(rep===null||str===null)f.err='Scrivi i totali come ore:minuti (es. 112:30).';
  else if(rep===f.cRep&&str===f.cStr)f.err='Indica almeno un totale diverso da quello calcolato.';
  else if(mt.length<5)f.err='La motivazione è obbligatoria (almeno 5 caratteri).';
  else f.err='';
  if(f.err){rerender();return}
  const key=ad.key,r=await Store.rettificaRegistro(c.k,c.n,f.L,f.id,{rep:rep===f.cRep?null:rep,str:str===f.cStr?null:str,motivo:mt,chi:c.p.n},false);
  if(!RG.ad||RG.ad.key!==key)return;
  if(!r.ok){f.err='Rettifica non riuscita: '+(r.errore||'errore sconosciuto');rerender();return}
  const g=rgRegDi(ad,f.L,f.id);if(g)g.rett=r.rett;
  ad.rf=null;ad.msg='Rettifica registrata.';rerender();
}
async function rgRtTogli(rerender){
  const c=RG.ctx,ad=RG.ad,f=ad&&ad.rf;if(!f||c.sola)return;
  if(!confirm(`Togliere la rettifica dei totali di ${f.nome}? Torneranno i valori del suo riepilogo.`))return;
  const key=ad.key,r=await Store.rettificaRegistro(c.k,c.n,f.L,f.id,null,true);
  if(!RG.ad||RG.ad.key!==key)return;
  if(!r.ok){f.err='Operazione non riuscita: '+(r.errore||'errore sconosciuto');rerender();return}
  const g=rgRegDi(ad,f.L,f.id);if(g)g.rett=null;
  ad.rf=null;ad.msg='Rettifica tolta.';rerender();
}
/* Riconferma: riapplica gli stessi valori e la stessa motivazione alla revisione inviata più recente */
async function rgRtRiconferma(pid,L,rerender){
  const c=RG.ctx,ad=RG.ad;if(!ad||c.sola||c.L!=='S')return;
  const g=rgRegDi(ad,L,pid);if(!g||!g.rett)return;
  const key=ad.key,t=g.rett,r=await Store.rettificaRegistro(c.k,c.n,L,pid,{rep:t.rep,str:t.str,motivo:t.motivo,chi:c.p.n},false);
  if(!RG.ad||RG.ad.key!==key)return;
  if(r.ok){g.rett=r.rett;ad.msg='Rettifica riconfermata.'}else ad.msg='Operazione non riuscita: '+(r.errore||'errore sconosciuto');
  rerender();
}
/* Una riga dell'elenco: x = persona, g = suo registro, L = ruolo del registro, visto = può mettere il visto chi guarda.
   Sui registri degli addetti i visti sono due (coordinatore e supervisore); «mio» è quello di chi guarda. */
function rgAdRiga(c,ad,x,g,L,visto){
  const ed=!c.sola,inv=!!g&&g.inviatoRev!==null&&g.inviatoRev!==undefined,come=rgVistoCome(c);
  g=g||{};                                              /* nessun registro: tutti i campi vuoti */
  const ok=(rev,il)=>!!inv&&rev!==null&&rev!==undefined&&rev===g.inviatoRev&&!!il;
  const vC=inv&&ok(g.vistoRev,g.vistoIl),vS=inv&&L==='A'&&ok(g.vistoSRev,g.vistoSIl);
  const dec=(rev,il)=>inv&&rev!==null&&rev!==undefined&&!ok(rev,il);
  let stato,cl='';
  if(!x.id)stato='Non è nell’anagrafica: nessun registro';
  else if(!g.dati&&g.rev===undefined)stato='Nessun registro';
  else if(!inv)stato=`Salvato (rev ${pad(g.rev)}), non inviato`;
  else stato=`Inviato rev ${pad(g.inviatoRev)} il ${rgDmy(g.inviatoIl)}`;
  /* visti: sull'addetto «coordinatore» e «supervisore», sul coordinatore solo il supervisore (campo principale) */
  const vistiTesto=[];
  if(L==='A'){
    if(vC)vistiTesto.push(`<b>visto del coordinatore il ${rgDmy(g.vistoIl)}</b>`);else if(dec(g.vistoRev,g.vistoIl))vistiTesto.push('<span class="mod">visto del coordinatore decaduto</span>');
    if(vS)vistiTesto.push(`<b>visto del supervisore il ${rgDmy(g.vistoSIl)}</b>`);else if(dec(g.vistoSRev,g.vistoSIl))vistiTesto.push('<span class="mod">visto del supervisore decaduto</span>');
  }else{
    if(vC)vistiTesto.push(`<b>visto il ${rgDmy(g.vistoIl)}</b>`);else if(dec(g.vistoRev,g.vistoIl))vistiTesto.push('<span class="mod">visto decaduto (nuova revisione)</span>');
  }
  if(vistiTesto.length)stato+=' · '+vistiTesto.join(' · ');
  const mio=L==='A'&&come==='S'?vS:vC;                       /* il mio visto è valido? */
  if(mio)cl=' rg-ok';
  const sint=inv&&L==='A'?`<button class="mini" data-rg="adApri" data-id="${x.id}">${ad.aperto===x.id?'Chiudi':'Sintesi'}</button>`:'';
  const rtOk=rgRettValida(g),rtDec=inv&&!!g.rett&&!rtOk,puoRett=c.L==='S'&&ed&&inv;
  let rt='';
  if(inv&&g.rett){const t=g.rett,parti=[t.rep!=null?`reperibilità ${fmtHM(t.rep)}`:'',t.str!=null?`straordinario ${fmtHM(t.str)}`:''].filter(Boolean).join(' · ');
    rt=`<div class="rg-rt${rtOk?'':' dec'}"><b>${rtOk?'Totali rettificati':'Rettifica da riconfermare: la persona ha inviato una revisione nuova'}</b>: ${parti} — <i>${esc(t.motivo)}</i> <span class="mod">${t.chi?esc(t.chi)+', ':''}${t.il?rgDmy(t.il):''}</span>${rtDec&&puoRett?` <button class="go mini" data-rg="rtRiconferma" data-id="${x.id}" data-ru="${L}">Riconferma</button>`:''}</div>`}
  const rf=ad.rf&&ad.rf.id===x.id&&ad.rf.L===L?rgRettForm(ad.rf,g):'';
  const btnRt=puoRett?`<button class="mini" data-rg="rtApri" data-id="${x.id}" data-ru="${L}">${g.rett?'Modifica rettifica':'Rettifica totali'}</button>`:'';
  const az=inv?`${sint}<button class="mini" data-rg="adReport" data-id="${x.id}" data-ru="${L}">Apri report</button>${btnRt}${visto&&ed?(mio?`<button class="mini" data-rg="adTogli" data-id="${x.id}" data-ru="${L}">Togli visto</button>`:`<button class="go mini" data-rg="adVisto" data-id="${x.id}" data-ru="${L}">Visto</button>`):''}`:'';
  return `<div class="rg-ad${cl}"><div class="rg-ad-h"><b>${esc(x.n)}</b><span class="rg-ad-s">${stato}</span><span class="sp"></span>${az}</div>${inv&&L==='A'&&ad.aperto===x.id?rgAdDettaglio(c,x,g):''}${rt}${rf}</div>`;
}
function rgViewAddetti(){
  const c=RG.ctx,ad=RG.ad,S=c.L==='S';
  if(!ad||ad.stato==='cic')return '<div class="soon" style="padding:24px 10px">Caricamento dei registri del turno…</div>';
  if(ad.stato==='err')return `${rgTop()}<div class="alerts"><h3>Registri del turno non disponibili</h3>${esc(ad.err)} <button class="mini" data-rg="adRicarica">Riprova</button></div>${rgNav(4)}`;
  if(ad.report){
    const L=ad.report.L,x=(L==='C'?ad.coords:ad.lista).find(y=>y.id===ad.report.id),g=x&&(L==='C'?ad.regsC:ad.regs)[x.id];
    if(x&&g){const r=rgAdReport(c,x,g,L);
      return `${rgTop()}<div class="tool rg-nav"><button class="ghost" data-rg="adReportChiudi">← Elenco</button><span class="sp"></span><button class="go" data-rg="adReportStampa">Stampa / Scarica PDF</button></div>
        <p style="color:var(--muted);margin:0 0 10px;font-size:.88rem">Report di <b>${esc(x.n)}</b> come l’ha inviato (revisione ${pad(g.rev)}), nello stesso formato del PDF.${g.rev>g.inviatoRev?` <span class="err">Dopo l’invio (rev ${pad(g.inviatoRev)}) ha salvato modifiche non ancora inviate: qui vedi la più recente.</span>`:''} Su telefono scorri di lato per vedere tutta la pagina.</p>
        <div class="rep-view">${r.html}</div>
        <div class="tool rg-nav" style="margin-top:10px"><button class="ghost" data-rg="adReportChiudi">← Elenco</button></div>`}
    ad.report=null;
  }
  const elencoA=ad.lista.map(x=>rgAdRiga(c,ad,x,x.id?ad.regs[x.id]:null,'A',true)).join('')||'<p class="soon" style="padding:20px">Nel turno non ci sono addetti.</p>';
  const elencoC=S?ad.coords.map(x=>rgAdRiga(c,ad,x,x.id?ad.regsC[x.id]:null,'C',true)).join('')||'<p class="soon" style="padding:20px">Nel turno non è indicato il coordinatore.</p>':'';
  const intro=S?'I registri inviati dal coordinatore e dagli addetti si leggono direttamente dal database. Dopo averli controllati metti il tuo «visto» sul registro del <b>coordinatore</b> e su quello di ciascun <b>addetto</b>: compare accanto alla tua firma nel report. Sugli addetti il tuo visto è distinto da quello del coordinatore. Ogni visto vale per la revisione inviata: se la persona ne invia una nuova, va rimesso.'
    :'I registri inviati dagli addetti del turno si leggono direttamente dal database. Dopo averli controllati metti il «visto»: compare accanto alla tua firma nel report dell’addetto. Il visto vale per la revisione inviata: se l’addetto ne invia una nuova, va rimesso. (Sul report dell’addetto può mettere il proprio visto anche il supervisore.)';
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>${S?'Registri del turno':'Registri degli addetti'}</h3>
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">${intro}</p>
      ${ad.msg?`<p class="ok" style="margin:0 0 10px">${esc(ad.msg)}</p>`:''}
      ${S?`<h4 class="rg-sub">Coordinatore</h4>${elencoC}<h4 class="rg-sub">Addetti</h4>`:''}${elencoA}
      <div class="tool" style="margin-top:10px"><button class="ghost" data-rg="adRicarica">Aggiorna</button><button class="ghost" data-rg="fascicolo">Scarica fascicolo completo</button></div></div>${S?rgTabComposizione():''}${rgNav(4)}`;
}
RG.view=function(passo,c){
  if(!c.p)return `<div class="soon" style="padding:24px 10px">${rlPuoSimulare()?'Scegli una persona dall’anteprima per vedere il suo registro.':'Il tuo account non è collegato a una persona dell’anagrafica.'}</div>`;
  if(RG.key!==rgK(c)||!RG.s||RG.s.stato==='cic')return '<div class="soon" style="padding:24px 10px">Caricamento del registro…</div>';
  RG.ctx=c;
  if(RG.s.stato==='err')return `<div class="alerts"><h3>Registro non disponibile</h3>${esc(RG.s.err)} <button class="mini" data-rg="ricarica">Riprova</button></div>`;
  const nome=rgNomePasso(c.L,passo);
  return nome==='Registro'?rgViewRegistro():nome==='Riepilogo'?rgViewRiepilogo():(nome==='Addetti'||nome==='Registri del turno')?rgViewAddetti():rgViewVerifica();
};
