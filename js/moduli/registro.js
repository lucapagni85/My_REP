/* REGISTRO, RIEPILOGO e VERIFICHE dell'ADDETTO (V00.10) e del COORDINATORE (V00.13).
   Passi della scheda Addetto: 1 Turno (ruoli.js) · 2 Registro · 3 Riepilogo · 4 Verifiche e invio.
   Passi della scheda Coordinatore: 1 Turno · 2 Registro · 3 Riepilogo · 4 Addetti (registri inviati e «visto») · 5 Verifiche e invio.
   Dati nel database (Store.leggiRegistro / salvaRegistro) con numero di revisione; le modifiche non salvate
   si conservano anche sul dispositivo (bozza) e si possono ripristinare. Le verifiche non sono bloccanti. */
const RG={key:null,ctx:null,s:null,ad:null};
const RG_PASSI={A:['Turno','Registro','Riepilogo','Verifiche e invio'],C:['Turno','Registro','Riepilogo','Addetti','Verifiche e invio']};
const RG_DEST={A:'coordinatore',C:'supervisore'};      /* a chi va l'invio (e il «visto» arriva da chi sta sopra) */
const RG_VISTO_DA={A:'coordinatore',C:'supervisore'};
const rgNomePasso=(L,p)=>(RG_PASSI[L]||RG_PASSI.A)[p-1];
const RG_BOZZE='turni_bozze_v1';
let rgTimer=null;

const rgK=c=>`${c.k}|${c.n}|${c.L}|${c.p.id}`;
const rgBozze=()=>{try{return JSON.parse(localStorage.getItem(RG_BOZZE)||'{}')}catch(e){return{}}};
function rgBozzaSalva(key,v){try{const b=rgBozze();if(v)b[key]=v;else delete b[key];localStorage.setItem(RG_BOZZE,JSON.stringify(b))}catch(e){}}
const rgVuoto=()=>({v:1,righe:[],ov:{}});
const rgRiga=(data,L)=>Object.assign({data,ora:'',rich:'',via:'',km:'',motivo:'',arrivo:'',fine:'',durata:'',durAuto:true,descr:'',note:''},
  L==='C'?{tipo:'',addetti:[],addettiAltri:'',imprese:'',sopr:'',soprSup:'',effic:''}:{});
const rgDmy=t=>{const d=new Date(t);return isNaN(d)?'':it(d)};
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
  const key=rgK(c),s={stato:'cic',dati:rgVuoto(),baseRev:null,rev:null,inviatoRev:null,inviatoIl:null,vistoRev:null,vistoIl:null,dirty:false,msg:'',err:'',bozza:null,conflitto:false,attuale:null,salvando:false};
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
    if(db){s.dati=rgSistema(db.dati);s.baseRev=db.rev;s.rev=db.rev;s.inviatoRev=db.inviatoRev;s.inviatoIl=db.inviatoIl;s.vistoRev=db.vistoRev===undefined?null:db.vistoRev;s.vistoIl=db.vistoIl||null}
    if(bz&&JSON.stringify(rgSistema(bz.dati))!==JSON.stringify(s.dati))s.bozza=bz;
    else if(bz)rgBozzaSalva(key,null);
  }
  rerender();
}
RG.assicura=function(c,rerender,passo){
  if(c&&c.p&&RG.key!==rgK(c))rgApri(c,rerender);
  if(c&&c.p&&c.L==='C'&&rgNomePasso('C',passo)==='Addetti'&&(!RG.ad||RG.ad.key!==rgAdKey(c)))rgAdApri(c,rerender);
};
RG.reset=function(){RG.key=null;RG.s=null;RG.ctx=null;RG.ad=null};

/* ---------- stato e salvataggio ---------- */
/* Il visto vale solo per la revisione inviata: se ne viene inviata un'altra, decade. */
const rgVistoValido=()=>{const s=RG.s;return !!s&&s.vistoRev!==null&&s.vistoRev!==undefined&&s.vistoRev===s.inviatoRev&&!!s.vistoIl};
function rgStatoTesto(){
  const s=RG.s;let t;
  if(s.rev===null)t='Non ancora salvato';
  else{
    t=`Revisione ${pad(s.rev)} salvata`;
    if(s.inviatoRev===null||s.inviatoRev===undefined)t+=' · non inviata';
    else t+=s.inviatoRev===s.rev&&!s.dirty?' · <b>inviata</b>':` · ultima inviata: rev ${pad(s.inviatoRev)}`;
    if(rgVistoValido())t+=` · visto dal ${RG_VISTO_DA[RG.ctx.L]} il ${rgDmy(s.vistoIl)}`;
    else if(s.vistoRev!==null&&s.vistoRev!==undefined)t+=' · visto decaduto (inviata una revisione nuova)';
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
    s.msg=invia?`Registro salvato e inviato (revisione ${pad(r.rev)}).`:`Registro salvato (revisione ${pad(r.rev)}).`;
  }else if(r.conflitto){s.conflitto=true;s.attuale=r.attuale}
  else s.err=r.rete?'Senza connessione: le modifiche restano sul dispositivo come bozza. Riprova quando torna la rete.':'Salvataggio non riuscito: '+(r.errore||'errore sconosciuto');
  if(r.ok&&invia){s.mailRes=null;s.mailInCorso=!!Store.mailAttive}
  rerender();
  if(r.ok&&invia)await rgAvvisa(rerender);                    /* l'invio è già avvenuto: un errore di mail non lo annulla */
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
    const av=rgVerifiche();
    const dest=RG_DEST[c.L],testo=av.length?`Ci sono ${av.length} avvisi nelle verifiche (non bloccanti). Inviare comunque il registro al ${dest}?`:`Inviare il registro al ${dest}?`;
    if(!confirm(testo))return;await rgSalva(true,false,rerender);return;
  }
  if(a==='avvisa'){await rgAvvisa(rerender);return}
  if(a==='adApri'){const a0=RG.ad;if(a0)a0.aperto=a0.aperto===+b.dataset.id?null:+b.dataset.id;rerender();return}
  if(a==='adVisto'||a==='adTogli'){await rgAdVisto(+b.dataset.id,a==='adTogli',rerender);return}
  if(a==='adReport'){const a0=RG.ad;if(a0){a0.report=+b.dataset.id;rerender();window.scrollTo(0,0)}return}
  if(a==='adReportChiudi'){const a0=RG.ad;if(a0){a0.report=null;rerender()}return}
  if(a==='adReportStampa'){const a0=RG.ad,x=a0&&a0.lista.find(y=>y.id===a0.report),g=x&&a0.regs[x.id];if(g){const r=rgAdReport(c,x,g);Stampa.stampa(r.html,r.nomeFile)}return}
  if(a==='adRicarica'){RG.ad=null;await rgAdApri(c,rerender);return}
  if(a==='sovrascrivi'){await rgSalva(false,true,rerender);return}
  if(a==='ricarica'){rgBozzaSalva(RG.key,null);const c0=RG.ctx;RG.reset();rgApri(c0,rerender);return}
  if(a==='ripristina'){s.dati=rgSistema(s.bozza.dati);s.bozza=null;rgModif();rerender();return}
  if(a==='scarta'){rgBozzaSalva(RG.key,null);s.bozza=null;rerender();return}
};

/* ---------- PDF (grafica V05.20, vedi core/stampa.js) ---------- */
/* Dati per il motore di stampa di un registro (anche di un altro: c.p e c.L dicono di chi e di che ruolo). */
function rgStampaDati(c,dati,rev,vistoDmy){
  const eff=riepilogoEffettivo(riepilogoAuto({ruolo:c.L,p:c.p,k:c.k,n:c.n,a:c.a,b:c.b,righe:dati.righe}),dati.ov||{}),[y,m]=c.k.split('-').map(Number);
  const rows=k=>eff.filter(x=>x.inc).map(x=>[it(parse(x.g)),Math.round(x[k]*60)]);   /* ore → minuti interi */
  const tot=k=>rows(k).reduce((t,r)=>t+r[1],0);
  return{D:{anno:y,mese:m,rev},nome:c.p.n,persona:c.p,
    coordinatore:c.tt&&c.tt.COO?c.tt.COO.n:'',supervisore:c.tt&&c.tt.SUP?c.tt.SUP.n:'',da:it(c.a),a:it(c.b),
    righe:dati.righe.map((r,i)=>c.L==='C'
      ?[String(i+1),r.data?it(parse(r.data)):'',r.ora||'',r.rich||'',r.via||'',r.km||'',r.motivo||'',r.tipo||'',rgAddettiTesto(r),r.arrivo||'',r.fine||'',r.imprese||'',r.sopr||'',r.soprSup||'',r.effic||'',r.durata||'',r.note||'']
      :[String(i+1),r.data?it(parse(r.data)):'',r.ora||'',r.rich||'',r.via||'',r.km||'',r.motivo||'',r.arrivo||'',r.descr||'',r.fine||'',r.durata||'',r.note||'']),
    rep:{rows:rows('rep'),tot:tot('rep')},str:{rows:rows('str'),tot:tot('str')},
    ...(c.L==='C'?{vistoS:vistoDmy||''}:{vistoC:vistoDmy||''})};
}
function rgDatiStampa(){return rgStampaDati(RG.ctx,RG.s.dati,RG.s.rev,rgVistoValido()?rgDmy(RG.s.vistoIl):'')}
const rgAddettiTesto=r=>[...(r.addetti||[]).map(x=>x.n),...(r.addettiAltri&&r.addettiAltri.trim()?[r.addettiAltri.trim()]:[])].join(', ');
function rgPdf(){
  const c=RG.ctx,o=rgDatiStampa();
  Stampa.stampa(c.L==='C'?Stampa.coordinatore(o):Stampa.addetto(o),Stampa.nomeFile(c.L,{k:c.k,n:c.n,a:c.a,b:c.b,nome:c.p.n,persona:c.p,rev:RG.s.rev}));
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
  const top=`${f('data','Data','date')}${f('ora','Ora chiamata','time')}${f('rich','Soggetto richiedente')}${f('via','SP o SR','text','placeholder="es. SP 3"')}${f('km','Km','text','inputmode="decimal"')}${f('motivo','Motivo della chiamata')}`;
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
    <div class="sec" style="margin-top:12px"><h3>${c.L==='C'?'Registro coordinatore':'Registro addetto'}</h3>
      <p class="rg-sub">Provincia di Pisa · settore viabilità<br>Turno di reperibilità dalle ore 00:00 del ${it(c.a)} alle ore 23:59 del ${it(c.b)}</p>
      ${s.dati.righe.length?s.dati.righe.map((r,i)=>rgCard(r,i,ed,c.L,c)).join(''):`<p class="soon" style="padding:20px">Nessun intervento registrato.${ed?' Aggiungi un intervento quando serve: se non ce ne sono stati, puoi passare direttamente al riepilogo.':''}</p>`}
      <div class="tool">${ed?'<button class="go" data-rg="add">Aggiungi intervento</button><button class="ghost" data-rg="ordina">Ordina per data e ora</button>':''}<span class="sp"></span>
        <span style="color:var(--muted);font-size:.9rem">Interventi: ${s.dati.righe.length} · ${c.L==='C'?'impegno totale':'durata totale'} ${fmtHM(tot)}</span></div></div>${rgNav(2)}`;
}
function rgViewRiepilogo(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,eff=rgEff(),nome=c.p.n,C=c.L==='C';
  const [y,m]=c.k.split('-').map(Number),vv=rgVistoValido()?rgDmy(s.vistoIl):'';
  const cella=(g,k,x)=>ed?`<input class="ore${x.man[k]?' man':''}" data-g="${g}" data-c="${k}" value="${oreHM(x[k])}" inputmode="numeric" placeholder="h:mm" aria-label="${k==='rep'?'Ore di reperibilità':'Ore di straordinario'} del ${it(parse(g))} (ore:minuti)">`:oreHM(x[k]);
  const r1=eff.map((x,i)=>`<tr class="${x.inc?'':'off'}">${i===0?`<td rowspan="${eff.length}" class="nom">${esc(nome)}</td>`:''}
      <td><label class="chk" style="gap:8px">${ed?`<input type="checkbox" data-g="${x.g}" data-c="inc"${x.inc?' checked':''} aria-label="Includi il ${it(parse(x.g))}">`:''}${it(parse(x.g))}</label></td><td class="num">${cella(x.g,'rep',x)}</td></tr>`).join('');
  const inc=eff.filter(x=>x.inc);
  const r2h=inc.length?inc.map((x,i)=>`<tr>${i===0?`<td rowspan="${inc.length}" class="nom">${esc(nome)}</td>`:''}<td>${it(parse(x.g))}</td><td class="num">${cella(x.g,'str',x)}</td></tr>`).join(''):'<tr><td class="nom">—</td><td colspan="2">Nessun giorno incluso</td></tr>';
  const ha=Object.keys(s.dati.ov).length>0,sup=c.tt&&c.tt.SUP?c.tt.SUP.n:'',coo=c.tt&&c.tt.COO?c.tt.COO.n:'';
  /* intestazione e firme identiche al PDF (stampa.js) */
  const firme=C?stFirma('IL COORDINATORE',nome,true,null,c.p)+stFirma('IL SUPERVISORE',sup,!!vv,vv)
    :stFirma('L’ADDETTO',nome,true,null,c.p)+stFirma('IL COORDINATORE',coo,!!vv,vv)+stFirma('IL SUPERVISORE',sup,false,null);
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Riepilogo del turno</h3>
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
function rgViewVerifica(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,av=rgVerifiche(),x=av.filter(a=>a.lv==='x'),l=av.filter(a=>a.lv==='l');
  const lista=(a,titolo,cls)=>a.length?`<div class="${cls}"><h3>${titolo} (${a.length})</h3><ul>${a.map(v=>`<li><b>Evento n° ${v.riga}</b>: ${esc(v.t)}</li>`).join('')}</ul></div>`:'';
  const C=c.L==='C',coo=(C?c.tt&&c.tt.SUP:c.tt&&c.tt.COO)?(C?c.tt.SUP.n:c.tt.COO.n):null,dest=RG_DEST[c.L];
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Verifiche</h3>
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">Le verifiche sono solo un aiuto: non bloccano il salvataggio né l’invio e non restano scritte nel report.</p>
      ${av.length?lista(x,'Anomalie','alerts')+lista(l,'Da verificare','alerts lieve'):`<div class="esito"><b>Nessuna anomalia rilevata.</b>${s.dati.righe.length?'':' Il registro non contiene interventi.'}</div>`}</div>
    <div class="sec"><h3>Invio</h3>
      <div class="grid2"><div class="box"><span>Destinatario</span><b>${coo?`${C?'Supervisore':'Coordinatore'} del turno: ${esc(coo)}`:`${C?'Supervisore':'Coordinatore'} del turno`}</b></div>
        <div class="box"><span>Stato</span><b id="rgStatoB">${rgStatoTesto()}</b></div></div>
      ${ed?`<div class="tool" style="margin-top:14px"><button class="ghost" data-rg="salva">Salva</button><button class="go" data-rg="invia">Salva e invia al ${dest}</button></div>`:''}
      <div class="tool" style="margin-top:6px"><button class="ghost" data-rg="pdf">Scarica PDF</button><span style="color:var(--muted);font-size:.85rem">Si apre la stampa del browser: scegli «Salva come PDF». Il file riporta l’ultima revisione salvata.</span></div>
      <p style="color:var(--muted);font-size:.85rem;margin:6px 0 0">L’invio rende il registro disponibile al ${dest} nel database e gli manda una mail di avviso.</p></div>${rgNav(RG_PASSI[c.L].length)}`;
}
/* ---------- Addetti del turno (scheda Coordinatore): registri inviati e «visto» ---------- */
const rgAdKey=c=>`${c.k}|${c.n}|${c.p?c.p.id:''}`;
async function rgAdApri(c,rerender){
  const key=rgAdKey(c),ad={key,stato:'cic',lista:[],regs:{},err:'',aperto:null,report:null,msg:''};RG.ad=ad;
  try{const regs=await Store.registriTurno(c.k,c.n,'A');for(const r of regs)ad.regs[r.personaId]=r;ad.stato='ok'}
  catch(e){ad.stato='err';ad.err=e.message||String(e)}
  if(!RG.ad||RG.ad.key!==key)return;
  ad.lista=rgAddettiTurno(c);rerender();
}
async function rgAdVisto(pid,togli,rerender){
  const c=RG.ctx,ad=RG.ad;if(!ad||c.sola)return;
  const x=ad.lista.find(y=>y.id===pid);
  if(!togli&&!confirm(`Mettere il visto sul registro di ${x?x.n:'questo addetto'}? Vale per la revisione inviata.`))return;
  ad.msg='';const r=await Store.vistaRegistro(c.k,c.n,'A',pid,togli);
  if(!RG.ad||RG.ad.key!==ad.key)return;
  if(!r.ok)ad.msg='Operazione non riuscita: '+(r.errore||'errore sconosciuto');
  else{const g=ad.regs[pid];if(g){g.vistoRev=r.vistoRev;g.vistoIl=r.vistoIl}ad.msg=togli?'Visto tolto.':'Visto registrato.'}
  rerender();
}
/* Il report inviato dall'addetto, identico al PDF: {html, nomeFile} */
function rgAdReport(c,x,g){
  const pers=ANAG.find(p=>p.id===x.id)||{id:x.id,n:x.n},c2=Object.assign({},c,{L:'A',p:pers});
  const inv=g.inviatoRev!==null&&g.inviatoRev!==undefined,vv=inv&&g.vistoRev===g.inviatoRev&&g.vistoIl?rgDmy(g.vistoIl):'';
  const dati={righe:(g.dati&&g.dati.righe)||[],ov:(g.dati&&g.dati.ov)||{}};
  return{html:Stampa.addetto(rgStampaDati(c2,dati,g.rev,vv)),nomeFile:Stampa.nomeFile('A',{k:c.k,n:c.n,a:c.a,b:c.b,nome:pers.n,persona:pers,rev:g.rev})};
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
function rgViewAddetti(){
  const c=RG.ctx,ad=RG.ad,ed=!c.sola;
  if(!ad||ad.stato==='cic')return '<div class="soon" style="padding:24px 10px">Caricamento dei registri degli addetti…</div>';
  if(ad.stato==='err')return `${rgTop()}<div class="alerts"><h3>Registri degli addetti non disponibili</h3>${esc(ad.err)} <button class="mini" data-rg="adRicarica">Riprova</button></div>${rgNav(4)}`;
  if(ad.report){
    const x=ad.lista.find(y=>y.id===ad.report),g=x&&ad.regs[x.id];
    if(x&&g){const r=rgAdReport(c,x,g);
      return `${rgTop()}<div class="tool rg-nav"><button class="ghost" data-rg="adReportChiudi">← Elenco addetti</button><span class="sp"></span><button class="go" data-rg="adReportStampa">Stampa / Scarica PDF</button></div>
        <p style="color:var(--muted);margin:0 0 10px;font-size:.88rem">Report di <b>${esc(x.n)}</b> come l’ha inviato (revisione ${pad(g.rev)}), nello stesso formato del PDF.${g.rev>g.inviatoRev?` <span class="err">Dopo l’invio (rev ${pad(g.inviatoRev)}) ha salvato modifiche non ancora inviate: qui vedi la più recente.</span>`:''} Su telefono scorri di lato per vedere tutta la pagina.</p>
        <div class="rep-view">${r.html}</div>
        <div class="tool rg-nav" style="margin-top:10px"><button class="ghost" data-rg="adReportChiudi">← Elenco addetti</button></div>`}
    ad.report=null;
  }
  const righe=ad.lista.map(x=>{
    const g=x.id?ad.regs[x.id]:null,inv=g&&g.inviatoRev!==null&&g.inviatoRev!==undefined,vv=inv&&g.vistoRev===g.inviatoRev&&g.vistoIl;
    let stato,cl='';
    if(!x.id)stato='Non è nell’anagrafica: nessun registro';
    else if(!g)stato='Nessun registro';
    else if(!inv)stato=`Salvato (rev ${pad(g.rev)}), non inviato`;
    else stato=`Inviato rev ${pad(g.inviatoRev)} il ${rgDmy(g.inviatoIl)}`;
    if(vv){stato+=` · <b>visto il ${rgDmy(g.vistoIl)}</b>`;cl=' rg-ok'}
    else if(inv&&g.vistoRev!==null&&g.vistoRev!==undefined)stato+=' · <span class="mod">visto decaduto (nuova revisione)</span>';
    const az=inv?`<button class="mini" data-rg="adApri" data-id="${x.id}">${ad.aperto===x.id?'Chiudi':'Sintesi'}</button><button class="mini" data-rg="adReport" data-id="${x.id}">Apri report</button>${ed?(vv?`<button class="mini" data-rg="adTogli" data-id="${x.id}">Togli visto</button>`:`<button class="go mini" data-rg="adVisto" data-id="${x.id}">Visto</button>`):''}`:'';
    return `<div class="rg-ad${cl}"><div class="rg-ad-h"><b>${esc(x.n)}</b><span class="rg-ad-s">${stato}</span><span class="sp"></span>${az}</div>${inv&&ad.aperto===x.id?rgAdDettaglio(c,x,g):''}</div>`}).join('');
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Registri degli addetti</h3>
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">I registri inviati dagli addetti del turno si leggono direttamente dal database. Dopo averli controllati metti il «visto»: compare accanto alla tua firma nel report dell’addetto. Il visto vale per la revisione inviata: se l’addetto ne invia una nuova, va rimesso.</p>
      ${ad.msg?`<p class="ok" style="margin:0 0 10px">${esc(ad.msg)}</p>`:''}
      ${righe||'<p class="soon" style="padding:20px">Nel turno non ci sono addetti.</p>'}
      <div class="tool" style="margin-top:10px"><button class="ghost" data-rg="adRicarica">Aggiorna</button></div></div>${rgNav(4)}`;
}
RG.view=function(passo,c){
  if(!c.p)return `<div class="soon" style="padding:24px 10px">${rlPuoSimulare()?'Scegli una persona dall’anteprima per vedere il suo registro.':'Il tuo account non è collegato a una persona dell’anagrafica.'}</div>`;
  if(RG.key!==rgK(c)||!RG.s||RG.s.stato==='cic')return '<div class="soon" style="padding:24px 10px">Caricamento del registro…</div>';
  RG.ctx=c;
  if(RG.s.stato==='err')return `<div class="alerts"><h3>Registro non disponibile</h3>${esc(RG.s.err)} <button class="mini" data-rg="ricarica">Riprova</button></div>`;
  const nome=rgNomePasso(c.L,passo);
  return nome==='Registro'?rgViewRegistro():nome==='Riepilogo'?rgViewRiepilogo():nome==='Addetti'?rgViewAddetti():rgViewVerifica();
};
