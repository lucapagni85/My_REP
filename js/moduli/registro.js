/* REGISTRO, RIEPILOGO e VERIFICHE dell'ADDETTO (V00.10).
   Passi della scheda: 1 Turno (ruoli.js) · 2 Registro · 3 Riepilogo · 4 Verifiche e invio.
   Dati nel database (Store.leggiRegistro / salvaRegistro) con numero di revisione; le modifiche non salvate
   si conservano anche sul dispositivo (bozza) e si possono ripristinare. Le verifiche non sono bloccanti. */
const RG={key:null,ctx:null,s:null};
const RG_BOZZE='turni_bozze_v1';
let rgTimer=null;

const rgK=c=>`${c.k}|${c.n}|${c.L}|${c.p.id}`;
const rgBozze=()=>{try{return JSON.parse(localStorage.getItem(RG_BOZZE)||'{}')}catch(e){return{}}};
function rgBozzaSalva(key,v){try{const b=rgBozze();if(v)b[key]=v;else delete b[key];localStorage.setItem(RG_BOZZE,JSON.stringify(b))}catch(e){}}
const rgVuoto=()=>({v:1,righe:[],ov:{}});
const rgRiga=data=>({data,ora:'',rich:'',via:'',km:'',motivo:'',arrivo:'',fine:'',durata:'',durAuto:true,descr:'',note:''});
function rgDataDefault(c,righe){
  const oggi=iso(new Date());
  return (righe.length&&righe[righe.length-1].data)||(oggi>=iso(c.a)&&oggi<=iso(c.b)?oggi:iso(c.a));
}
const rgSistema=d=>{d=d&&typeof d==='object'?d:{};d.righe=Array.isArray(d.righe)?d.righe:[];d.ov=d.ov&&typeof d.ov==='object'?d.ov:{};return d};

/* ---------- caricamento ---------- */
async function rgApri(c,rerender){
  const key=rgK(c),s={stato:'cic',dati:rgVuoto(),baseRev:null,rev:null,inviatoRev:null,inviatoIl:null,dirty:false,msg:'',err:'',bozza:null,conflitto:false,attuale:null,salvando:false};
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
    if(db){s.dati=rgSistema(db.dati);s.baseRev=db.rev;s.rev=db.rev;s.inviatoRev=db.inviatoRev;s.inviatoIl=db.inviatoIl}
    if(bz&&JSON.stringify(rgSistema(bz.dati))!==JSON.stringify(s.dati))s.bozza=bz;
    else if(bz)rgBozzaSalva(key,null);
  }
  rerender();
}
RG.assicura=function(c,rerender){if(c&&c.p&&RG.key!==rgK(c))rgApri(c,rerender)};
RG.reset=function(){RG.key=null;RG.s=null;RG.ctx=null};

/* ---------- stato e salvataggio ---------- */
function rgStatoTesto(){
  const s=RG.s;let t;
  if(s.rev===null)t='Non ancora salvato';
  else{
    t=`Revisione ${pad(s.rev)} salvata`;
    if(s.inviatoRev===null||s.inviatoRev===undefined)t+=' · non inviata';
    else t+=s.inviatoRev===s.rev&&!s.dirty?' · <b>inviata</b>':` · ultima inviata: rev ${pad(s.inviatoRev)}`;
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
  rerender();
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
  if(a)a.textContent=fmtOre(totaleOre(eff,'rep'));if(b)b.textContent=fmtOre(totaleOre(eff,'str'));
}
function rgSetOre(g,campo,v,el){
  const ov=RG.s.dati.ov,x=parseOre(v);ov[g]=ov[g]||{};
  if(x!==null)ov[g][campo]=x;else if(v.trim()==='')delete ov[g][campo];else return;   /* testo non valido: si ignora finché non lo è */
  if(!Object.keys(ov[g]).length)delete ov[g];
  if(el)el.classList.toggle('man',x!==null);
  rgTotaliDom();rgModif();
}
RG.onInput=function(e){
  const t=e.target,s=RG.s;if(!s||s.stato!=='ok'||RG.ctx.sola)return;
  if(t.dataset.f!==undefined&&t.dataset.i!==undefined)rgSetRiga(+t.dataset.i,t.dataset.f,t.value);
  else if(t.dataset.c==='rep'||t.dataset.c==='str')rgSetOre(t.dataset.g,t.dataset.c,t.value,t);
};
RG.onChange=function(e,rerender){
  const t=e.target,s=RG.s;if(!s||s.stato!=='ok'||RG.ctx.sola)return;
  if(t.dataset.c==='inc'){const ov=s.dati.ov;ov[t.dataset.g]=Object.assign(ov[t.dataset.g]||{},{inc:t.checked});rgModif();rerender();return}
  if(t.dataset.c==='rep'||t.dataset.c==='str'){const x=rgEff().find(y=>y.g===t.dataset.g);if(x)t.value=fmtOre(x[t.dataset.c])}   /* normalizza il formato */
};
RG.onClick=async function(b,rerender){
  const a=b.dataset.rg,s=RG.s,c=RG.ctx;if(!s)return;
  if(a==='add'){s.dati.righe.push(rgRiga(rgDataDefault(c,s.dati.righe)));rgModif();rerender();return}
  if(a==='del'){const i=+b.dataset.i;if(!confirm(`Eliminare l’evento n° ${i+1}?`))return;s.dati.righe.splice(i,1);rgModif();rerender();return}
  if(a==='ordina'){s.dati.righe.sort((p,q)=>(p.data+(p.ora||'')).localeCompare(q.data+(q.ora||'')));rgModif();rerender();return}
  if(a==='resetOre'){if(!confirm('Ripristinare i valori calcolati automaticamente nel riepilogo?'))return;s.dati.ov={};rgModif();rerender();return}
  if(a==='salva'){await rgSalva(false,false,rerender);return}
  if(a==='invia'){
    const av=rgVerifiche();
    const testo=av.length?`Ci sono ${av.length} avvisi nelle verifiche (non bloccanti). Inviare comunque il registro al coordinatore?`:'Inviare il registro al coordinatore?';
    if(!confirm(testo))return;await rgSalva(true,false,rerender);return;
  }
  if(a==='sovrascrivi'){await rgSalva(false,true,rerender);return}
  if(a==='ricarica'){rgBozzaSalva(RG.key,null);const c0=RG.ctx;RG.reset();rgApri(c0,rerender);return}
  if(a==='ripristina'){s.dati=rgSistema(s.bozza.dati);s.bozza=null;rgModif();rerender();return}
  if(a==='scarta'){rgBozzaSalva(RG.key,null);s.bozza=null;rerender();return}
};

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
  if(s.msg)o.push(`<p class="ok" style="margin:0 0 10px">${esc(s.msg)}</p>`);
  return o.join('');
}
const rgNav=p=>`<div class="tool rg-nav">${p>2?`<button class="ghost" data-rg="passo" data-p="${p-1}">← Indietro</button>`:`<button class="ghost" data-rg="passo" data-p="1">← Turno</button>`}<span class="sp"></span>${p<4?`<button class="go" data-rg="passo" data-p="${p+1}">Avanti →</button>`:''}</div>`;

function rgCard(r,i,ed){
  const d=ed?'':' disabled';
  const f=(k,lab,tipo='text',extra='')=>`<label>${lab}<input type="${tipo}" data-i="${i}" data-f="${k}" value="${esc(r[k]||'')}"${d} ${extra}></label>`;
  const ta=(k,lab)=>`<label class="rg-w">${lab}<textarea data-i="${i}" data-f="${k}" rows="2"${d}>${esc(r[k]||'')}</textarea></label>`;
  return `<div class="rg-ev"><div class="rg-h"><b>Evento n° ${i+1}</b>${ed?`<button class="mini" data-rg="del" data-i="${i}">Elimina</button>`:''}</div>
    <div class="rg-g">${f('data','Data','date')}${f('ora','Ora chiamata','time')}${f('rich','Soggetto richiedente')}${f('via','SP o SR','text','placeholder="es. SP 3"')}${f('km','Km','text','inputmode="decimal"')}
      ${f('motivo','Motivo della chiamata')}${f('arrivo','Orario arrivo sul posto','time')}${f('fine','Ora fine intervento','time')}${f('durata','Durata complessiva (h:mm)','text','placeholder="h:mm" inputmode="numeric"')}
      ${ta('descr','Descrizione intervento effettuato')}${ta('note','Note')}</div></div>`;
}
function rgViewRegistro(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,iv=intervalli(s.dati.righe),tot=iv.reduce((x,v)=>x+v.dur,0);
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Registro addetto</h3>
      <p class="rg-sub">Provincia di Pisa · settore viabilità<br>Turno di reperibilità dalle ore 00:00 del ${it(c.a)} alle ore 23:59 del ${it(c.b)}</p>
      ${s.dati.righe.length?s.dati.righe.map((r,i)=>rgCard(r,i,ed)).join(''):`<p class="soon" style="padding:20px">Nessun intervento registrato.${ed?' Aggiungi un intervento quando serve: se non ce ne sono stati, puoi passare direttamente al riepilogo.':''}</p>`}
      <div class="tool">${ed?'<button class="go" data-rg="add">Aggiungi intervento</button><button class="ghost" data-rg="ordina">Ordina per data e ora</button>':''}<span class="sp"></span>
        <span style="color:var(--muted);font-size:.9rem">Interventi: ${s.dati.righe.length} · durata totale ${fmtHM(tot)}</span></div></div>${rgNav(2)}`;
}
function rgViewRiepilogo(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,eff=rgEff(),nm=nomeMese(c.k).split(' '),nome=(c.p.mat?c.p.mat+' ':'')+c.p.n;
  const cella=(g,k,x)=>ed?`<input class="ore${x.man[k]?' man':''}" data-g="${g}" data-c="${k}" value="${fmtOre(x[k])}" inputmode="decimal" aria-label="${k==='rep'?'Ore di reperibilità':'Ore di straordinario'} del ${it(parse(g))}">`:fmtOre(x[k]);
  const r1=eff.map((x,i)=>`<tr class="${x.inc?'':'off'}">${i===0?`<td rowspan="${eff.length}" class="nom">${esc(nome)}</td>`:''}
      <td><label class="chk" style="gap:8px">${ed?`<input type="checkbox" data-g="${x.g}" data-c="inc"${x.inc?' checked':''} aria-label="Includi il ${it(parse(x.g))}">`:''}${it(parse(x.g))}</label></td><td class="num">${cella(x.g,'rep',x)}</td></tr>`).join('');
  const inc=eff.filter(x=>x.inc);
  const r2h=inc.length?inc.map((x,i)=>`<tr>${i===0?`<td rowspan="${inc.length}" class="nom">${esc(nome)}</td>`:''}<td>${it(parse(x.g))}</td><td class="num">${cella(x.g,'str',x)}</td></tr>`).join(''):'<tr><td class="nom">—</td><td colspan="2">Nessun giorno incluso</td></tr>';
  const ha=Object.keys(s.dati.ov).length>0;
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Riepilogo del turno</h3>
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">Precompilato dal turno e dal registro. Puoi correggere le ore, oppure togliere un giorno (es. malattia o permesso) con la casella. I valori corretti a mano sono evidenziati.</p>
      <div class="rg-doc">
        <div class="rg-ente">Istituzione dei Comuni per il governo dell’area vasta<br><small>Scuole, Strade e Sistemi di trasporto, Territorio e Ambiente · Gestione associata di servizi e assistenza ai Comuni</small><br><b>SETTORE VIABILITA’, TRASPORTI E PROTEZIONE CIVILE</b></div>
        <p class="rg-tit">MODELLO ADDETTO<br>SERVIZIO DI REPERIBILITA’ ORARIA SVOLTO NEL MESE DI ${esc(nm[0].toUpperCase())} ANNO ${esc(nm[1])}</p>
        <p>Il sottoscritto dipendente <b>${esc(c.p.n)}</b> dichiara sotto la propria responsabilità di aver prestato il Servizio di Reperibilità nei giorni e per le ore sotto indicate.</p>
        <div class="tw"><table><thead><tr><th>Nominativo dipendente</th><th>Giorni</th><th>Ore</th></tr></thead><tbody>${r1}
          <tr class="tot"><td></td><td>TOTALE ORE</td><td class="num" id="rgTotRep">${fmtOre(totaleOre(eff,'rep'))}</td></tr></tbody></table></div>
        <p>Dichiara altresì di aver svolto il Servizio di Reperibilità per il quale è previsto il riconoscimento del lavoro straordinario nei giorni e per le ore sotto indicate.</p>
        <div class="tw"><table><thead><tr><th>Nominativo dipendente</th><th>Giorni</th><th>Ore</th></tr></thead><tbody>${r2h}
          <tr class="tot"><td></td><td>TOTALE ORE</td><td class="num" id="rgTotStr">${fmtOre(totaleOre(eff,'str'))}</td></tr></tbody></table></div>
        <div class="rg-firme"><div>L’ADDETTO<br><b>${esc(c.p.n)}</b><span>Firma</span></div><div>Il Dirigente<br><b>${esc(CONFIG.dirigente||'')}</b><span>Firma</span></div></div>
      </div>
      ${ed&&ha?'<div class="tool" style="margin-top:12px"><button class="ghost" data-rg="resetOre">Ripristina i valori automatici</button></div>':''}</div>${rgNav(3)}`;
}
function rgViewVerifica(){
  const s=RG.s,c=RG.ctx,ed=!c.sola,av=rgVerifiche(),x=av.filter(a=>a.lv==='x'),l=av.filter(a=>a.lv==='l');
  const lista=(a,titolo,cls)=>a.length?`<div class="${cls}"><h3>${titolo} (${a.length})</h3><ul>${a.map(v=>`<li><b>Evento n° ${v.riga}</b>: ${esc(v.t)}</li>`).join('')}</ul></div>`:'';
  const coo=c.tt&&c.tt.COO?c.tt.COO.n:null;
  return `${rgTop()}${rgBanner()}
    <div class="sec" style="margin-top:12px"><h3>Verifiche</h3>
      <p style="color:var(--muted);margin:0 0 12px;font-size:.9rem">Le verifiche sono solo un aiuto: non bloccano il salvataggio né l’invio e non restano scritte nel report.</p>
      ${av.length?lista(x,'Anomalie','alerts')+lista(l,'Da verificare','alerts lieve'):`<div class="esito"><b>Nessuna anomalia rilevata.</b>${s.dati.righe.length?'':' Il registro non contiene interventi.'}</div>`}</div>
    <div class="sec"><h3>Invio</h3>
      <div class="grid2"><div class="box"><span>Destinatario</span><b>${coo?`Coordinatore del turno: ${esc(coo)}`:'Coordinatore del turno'}</b></div>
        <div class="box"><span>Stato</span><b id="rgStatoB">${rgStatoTesto()}</b></div></div>
      ${ed?`<div class="tool" style="margin-top:14px"><button class="ghost" data-rg="salva">Salva</button><button class="go" data-rg="invia">Salva e invia al coordinatore</button></div>`:''}
      <p style="color:var(--muted);font-size:.85rem;margin:6px 0 0">L’invio rende il registro disponibile al coordinatore nel database. PDF, Excel e mail di promemoria arriveranno nella prossima versione.</p></div>${rgNav(4)}`;
}
RG.view=function(passo,c){
  if(!c.p)return `<div class="soon" style="padding:24px 10px">${rlPuoSimulare()?'Scegli una persona dall’anteprima per vedere il suo registro.':'Il tuo account non è collegato a una persona dell’anagrafica.'}</div>`;
  if(RG.key!==rgK(c)||!RG.s||RG.s.stato==='cic')return '<div class="soon" style="padding:24px 10px">Caricamento del registro…</div>';
  RG.ctx=c;
  if(RG.s.stato==='err')return `<div class="alerts"><h3>Registro non disponibile</h3>${esc(RG.s.err)} <button class="mini" data-rg="ricarica">Riprova</button></div>`;
  return passo===2?rgViewRegistro():passo===3?rgViewRiepilogo():rgViewVerifica();
};
