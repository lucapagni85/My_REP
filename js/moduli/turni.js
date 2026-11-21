/* Modulo TURNI: vista in corso, archivio e generazione. Dipende da util.js e store.js */
const SLOTS={SUP:['Supervisore','Confini provinciali'],COO:['Coordinatore','Confini provinciali'],VICE:['Vice Coordinatore',''],
 Z1:['Addetto','Ovest · Zona 1 · Nord'],Z4:['Addetto','Est · Zona 4 · Nord'],Z2:['Addetto','Ovest · Zona 2 · Centro'],
 Z5:['Addetto','Est · Zona 5 · Centro'],Z3:['Addetto','Ovest · Zona 3 · Sud'],Z6:['Addetto','Est · Zona 6 · Sud']};
const ORDER=['SUP','COO','VICE','Z1','Z4','Z2','Z5','Z3','Z6'];
function findPerson(mese,ref){for(const t of Object.values(mese.turni))for(const s of Object.values(t))if(ref.id?s.id===ref.id:s.n===ref.n)return s;{const a=anagOf(ref);return{n:ref.n,t:a?a.t.filter(Boolean):[]}}}

/* ===== STATO ===== */
let consulta=iso(new Date()), giorno=null, tab='corso';

const RC={SUP:'r-sup',COO:'r-coo',VICE:'r-vic',Z1:'r-nord',Z4:'r-nord',Z2:'r-cen',Z5:'r-cen',Z3:'r-sud',Z6:'r-sud'};
const rc=k=>RC[k]+(['SUP','COO','VICE','Z1','Z2','Z3'].includes(k)?' g':'');
/* ===== VISTA TURNO IN CORSO ===== */
function viewCorso(){
  const d=parse(consulta), key=`${d.getFullYear()}-${pad(d.getMonth()+1)}`, mese=DATA[key];
  const sim=`<label class="sim">Data di consultazione <input type="date" id="dt" value="${consulta}"></label>`;
  if(!mese){
    return `<div class="panel"><div class="banner"><h2>Turno del ${it(d)}</h2>${sim}</div>
      <div class="soon"><h2>Turno non ancora compilato</h2>Per questo mese non sono presenti turni.
</div></div>`;
  }
  const r=range(d), t=mese.turni[r.n];
  if(!giorno||parse(giorno)<r.a||parse(giorno)>r.b) giorno=(d>=r.a&&d<=r.b)?iso(d):iso(r.a);
  const gd=parse(giorno), oggi=iso(new Date());
  const vars=mese.var.filter(v=>v.turno===r.n&&t[v.slot]);
  const delGiorno=v=>v.t==='sost'?v.giorno===giorno:true;
  const attive=vars.filter(delGiorno);
  /* giorni del turno */
  let chips='';
  for(let x=new Date(r.a);x<=r.b;x=new Date(x.getFullYear(),x.getMonth(),x.getDate()+1)){
    const k=iso(x), has=vars.some(v=>v.t==='sost'&&v.giorno===k);
    chips+=`<button class="day${k===oggi?' today':''}" data-g="${k}" aria-pressed="${k===giorno}">${has?'<i title="Sostituzione"></i>':''}<span>${WD[x.getDay()]}</span><b>${x.getDate()}</b></button>`;
  }
  /* avvisi giornalieri */
  const avv=attive.filter(v=>v.t==='sost'||v.t==='orario').map(v=>{
    const s=t[v.slot];
    return v.t==='sost'?`<li><b>${esc(v.entra)}</b> sostituisce <b>${esc(s.n)}</b> (${esc(SLOTS[v.slot][0]==='Addetto'?SLOTS[v.slot][1]:SLOTS[v.slot][0])})</li>`
      :`<li><b>${esc(s.n)}</b>: reperibile dalle ore ${v.da}${v.testo?' ('+esc(v.testo)+')':''}</li>`}).join('');
  /* righe */
  let rows='';
  for(const k of ORDER){
    const s=t[k], [prof,areaDef]=SLOTS[k];
    if(!s){rows+=`<div class="row vuoto ${rc(k)}"><div class="prof">${prof}</div><div class="area">${esc(areaDef)}</div><div class="nome">${k==='VICE'?'non presente':'non assegnato'}</div><div></div><div></div></div>`;continue}
    const area=s.area||areaDef;
    const sost=attive.find(v=>v.t==='sost'&&v.slot===k);
    let pers=s, extra='';
    if(sost){pers=findPerson(mese,{id:sost.entraId,n:sost.entra});extra=`<span class="badge">Sostituisce ${esc(s.n)}</span>`}
    vars.filter(v=>v.slot===k&&delGiorno(v)&&v.t!=='sost').forEach(v=>{
      extra+=v.t==='orario'?`<span class="badge">Dalle ore ${v.da}${v.testo?' · '+esc(v.testo):''}</span>`:`<span class="badge">${esc(v.testo)}</span>`});
    rows+=`<div class="row ${rc(k)}"><div class="prof">${prof}</div><div class="area">${esc(area)}</div>
      <div class="nome">${sost?`<span class="old">${esc(s.n)}</span>`:''}${esc(pers.n)}<div>${extra}</div></div>
      <div>${pers.t[0]?call(pers.t[0]):''}</div><div>${pers.t[1]?call(pers.t[1]):''}</div></div>`;
  }
  const fissi=mese.fissi.filter(f=>f.numero).map(f=>`<div class="box fixed"><span>${esc(f.etichetta)}</span>${call(f.numero)}</div>`).join('');
  const imp=impHtml(mese.imprese);
  return `<div class="panel">
    <div class="banner"><div><small>Turno ${r.n} · in servizio</small><h2>Dalle ore 00:00 del ${it(r.a)}<br>alle ore 24:00 del ${it(r.b)}</h2></div>${sim}</div>
    <div class="days" role="group" aria-label="Giorni del turno">${chips}</div>
    ${avv?`<div class="alerts"><h3>Variazioni del ${it(gd)}</h3><ul>${avv}</ul></div>`:''}
    <div class="hd"><div>Profilo operativo</div><div>Area operativa</div><div>Nominativo</div><div>Recapito 1</div><div>Recapito 2</div></div>
    ${rows}
    <div class="sec"><h3>Recapiti di riferimento</h3><div class="grid2">${fissi}</div></div>
    <div class="sec"><h3>Imprese di pronto intervento</h3><div class="grid2">${imp}</div></div>
  </div>`;
}


/* ===== IMPRESE (raggruppate per area) ===== */
function impHtml(I){
  const grp=(tit,arr,c)=>`<div class="grp ${c}"><h4>${tit}</h4>${arr.map(i=>`<div class="box"><span>${esc(i.zona)}</span><b>${esc(i.nome)}</b>${i.tel?call(i.tel):''}</div>`).join('')}</div>`;
  return `<div class="grps">${grp('Area Ovest',I.ovest,'ov')}${grp('Area Est',I.est,'es')}</div>${grp('Imprese comuni · tutte le zone',I.comune,'com')}`;
}

/* ===== ARCHIVIO TURNI ===== */
const MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const nomeMese=k=>{const[y,m]=k.split('-');return MESI[m-1]+' '+y};
let meseSel=null;
function descVar(v,t){
  const s=t[v.slot], lab=SLOTS[v.slot][0]==='Addetto'?'addetto':SLOTS[v.slot][0].toLowerCase(), cap=x=>x[0].toUpperCase()+x.slice(1);
  if(v.t==='sost') return `Il ${it(parse(v.giorno))} ${lab} ${s.n} è sostituito da ${v.entra}`;
  if(v.t==='orario') return cap(`${lab} ${s.n}: reperibile dalle ore ${v.da}${v.testo?` (${v.testo})`:''}`);
  return `${s.n}: ${v.testo}`;
}
function varTxt(mese,n){const t=mese.turni[n];return mese.var.filter(v=>v.turno===n&&t[v.slot]).sort((a,b)=>(a.giorno||'').localeCompare(b.giorno||'')).map(v=>descVar(v,t))}
const stampaImp=I=>{const f=x=>({zona:x.zona,nome:x.nome+(x.tel?' · '+x.tel:''),tel:''});return{ovest:I.ovest.map(f),est:I.est.map(f),comune:I.comune.map(f)}};
function sheet(key){
  const mese=DATA[key], [y,m]=key.split('-').map(Number), oggi=new Date();
  let out=`<div class="sheet"><h2>Reperibilità ${nomeMese(key)}</h2><p>Servizio viabilità · Provincia di Pisa${mese.rev!==undefined?` · rev ${pad(mese.rev)} del ${it(new Date(mese.agg))}`:''}</p>`;
  for(let n=1;n<=5;n++){
    const t=mese.turni[n]; if(!t) continue;
    const last=new Date(y,m,0).getDate(), a=new Date(y,m-1,(n-1)*6+1), b=new Date(y,m-1,n===5?last:n*6);
    const cur=oggi>=a&&new Date(oggi.getFullYear(),oggi.getMonth(),oggi.getDate())<=b;
    const rws=ORDER.map(k=>{const s=t[k],[prof,ar]=SLOTS[k];
      const c='r-'+(k==='SUP'?'sup':k==='COO'?'coo':k==='VICE'?'vic':'add')+(['SUP','COO','VICE','Z1'].includes(k)?' g':'');
      return s?`<tr class="${c}"><td>${prof}</td><td>${esc(s.area||ar)}</td><td><b>${esc(s.n)}</b></td><td>${esc(s.t[0]||'')}</td><td>${esc(s.t[1]||'')}</td></tr>`
        :`<tr class="v ${c}"><td>${prof}</td><td>${esc(ar)}</td><td>${k==='VICE'?'non presente':'non assegnato'}</td><td></td><td></td></tr>`}).join('');
    const vt=varTxt(mese,n);
    out+=`<section class="turn"><h3>Dalle ore 00:00 del ${it(a)} alle ore 24:00 del ${it(b)}${cur?'<span class="pill">in corso</span>':''}</h3>
      <div class="tw"><table><thead><tr><th>Profilo</th><th>Area</th><th>Nominativo</th><th>Recapito 1</th><th>Recapito 2</th></tr></thead><tbody>${rws}</tbody></table></div>
      ${vt.length?`<ul class="vn">${vt.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</section>`;
  }
  out+=`<section class="turn"><h3>Recapiti di riferimento</h3><div class="grid2">${mese.fissi.map(f=>`<div class="box"><span>${esc(f.etichetta)}</span><b>${esc(f.numero)}</b></div>`).join('')}</div></section>
    <section class="turn"><h3>Imprese di pronto intervento</h3>${impHtml(stampaImp(mese.imprese))}</section></div>`;
  return out;
}
function viewArchivio(){
  const keys=Object.keys(DATA).sort(), cur=iso(new Date()).slice(0,7);
  if(!keys.length)return `<div class="panel"><div class="soon"><h2>Archivio vuoto</h2>Non ci sono ancora mesi salvati.</div></div>`;
  if(!meseSel||!DATA[meseSel]) meseSel=DATA[cur]?cur:keys[keys.length-1];
  const i=keys.indexOf(meseSel);
  return `<div class="panel"><div class="tool no-print">
    <button class="ghost" id="pv" ${i<=0?'disabled':''} aria-label="Mese precedente">‹</button>
    <select id="ms" aria-label="Mese">${keys.map(k=>`<option value="${k}" ${k===meseSel?'selected':''}>${nomeMese(k)}</option>`).join('')}</select>
    <button class="ghost" id="nx" ${i>=keys.length-1?'disabled':''} aria-label="Mese successivo">›</button>
    <span class="sp"></span><button class="go" id="pdf">Esporta PDF</button></div>${sheet(meseSel)}</div>`;
}


/* ===== PERSONE: riferimento per id (se in anagrafica) o per nome (inserimento libero) ===== */
const anagId=id=>ANAG.find(a=>a.id===id);
const anagOf=s=>s?(s.id?anagId(s.id):ANAG.find(a=>a.n===s.n)):undefined;
const chiave=s=>s.id?'i'+s.id:'n'+String(s.n).toLowerCase();
const etich=a=>ANAG.filter(x=>x.n===a.n).length>1?`${a.n} #${a.id}`:a.n;
const trova=t=>{const x=/^(.*) #(\d+)$/.exec(t);if(x)return anagId(+x[2]);return ANAG.find(a=>a.n.toLowerCase()===t.toLowerCase())};

/* ===== GENERA TURNI ===== */
const IDEAL={Z1:1,Z4:4,Z2:2,Z5:5,Z3:3,Z6:6}, SET={Z1:'Nord',Z4:'Nord',Z2:'Centro',Z5:'Centro',Z3:'Sud',Z6:'Sud'};
let auth=false,gk=null,draft=null,gt=1,gv='turni',showAll=false,gmsg='',lerr='';
/* Modello vuoto per il primo mese in assoluto (nessun dato reale nel codice). */
const RECAPITI_VUOTI={fissi:['Recapito unico di chiamata','Protezione Civile H24 (solo emergenze)','118 Pisa-Livorno · chiusura strade'].map(e=>({etichetta:e,numero:''})),
  imprese:{ovest:['Zona 1 · Nord','Zona 2 · Centro','Zona 3 · Sud'].map(z=>({zona:z,nome:'',tel:''})),est:['Zona 4 · Nord','Zona 5 · Centro','Zona 6 · Sud'].map(z=>({zona:z,nome:'',tel:''})),comune:[{zona:'Sversamenti e sinistri',nome:'',tel:''}]}};
function nuovoMese(k){
  const ks=Object.keys(DATA).sort().filter(x=>x<k), pr=ks.length?DATA[ks[ks.length-1]]:null;
  return{turni:{1:{},2:{},3:{},4:{},5:{}},var:[],fissi:clone(pr?pr.fissi:RECAPITI_VUOTI.fissi),imprese:clone(pr?pr.imprese:RECAPITI_VUOTI.imprese),schema:1};
}
function apri(k){gk=k;draft=DATA[k]?clone(DATA[k]):nuovoMese(k);draft.baseRev=DATA[k]&&DATA[k].rev!==undefined?DATA[k].rev:null;if(!draft.turni[gt])draft.turni[gt]={};gmsg=DATA[k]?'':Object.keys(DATA).some(x=>x<k)?'Nuovo mese: recapiti e imprese ripresi dal mese precedente.':'Nuovo mese: compila recapiti e imprese nella scheda dedicata.'}
const usati=()=>{const u=new Set();for(const t of Object.values(draft.turni))for(const s of Object.values(t))u.add(chiave(s));return u};
function vicini(){
  const y=+gk.slice(0,4),m=+gk.slice(5),pk=m===1?`${y-1}-12`:`${y}-${pad(m-1)}`,nk=m===12?`${y+1}-01`:`${y}-${pad(m+1)}`;
  const nm=o=>new Set(Object.values(o||{}).map(chiave));
  return{pk,nk,pv:nm(DATA[pk]&&DATA[pk].turni[5]),nx:nm(DATA[nk]&&DATA[nk].turni[1])};
}
function avvisi(t,n){
  const a=[],cnt={},V=vicini();
  for(const [m,tt] of Object.entries(draft.turni))for(const s of Object.values(tt))(cnt[chiave(s)]=cnt[chiave(s)]||[]).push(+m);
  if(!t.SUP)a.push('Supervisore non indicato');if(!t.COO)a.push('Coordinatore non indicato');
  for(const k of ['Z1','Z4','Z2','Z5','Z3','Z6']){
    const s=t[k]; if(!s){a.push(`Nessun addetto per la Zona ${IDEAL[k]} (${SET[k]})`);continue}
    const p=anagOf(s); if(p&&p.z&&p.z!==IDEAL[k])a.push(`${s.n} (Zona ${p.z}) occupa il posto previsto per la Zona ${IDEAL[k]}`);
  }
  for(const [k,s] of Object.entries(t)){
    const p=anagOf(s), need=k==='SUP'?'S':k==='COO'?'C':'A';
    if(!p)a.push(`${s.n}: nominativo non presente in anagrafica (recapiti inseriti a mano)`);
    else if(p.r!==need)a.push(`${s.n} non è censito in anagrafica per il ruolo di ${SLOTS[k][0].toLowerCase()}`);
    if(p&&p.attivo===false)a.push(`${s.n} risulta cessato in anagrafica`);
    const o=cnt[chiave(s)]||[]; if(o.length>1)a.push(`${s.n} compare ${o.length} volte nel mese (turni ${[...new Set(o)].join(', ')})`);
    if(n===1&&V.pv.has(chiave(s)))a.push(`${s.n} ha svolto l’ultimo turno di ${nomeMese(V.pk)}: turni consecutivi`);
    if(n===5&&V.nx.has(chiave(s)))a.push(`${s.n} è previsto nel primo turno di ${nomeMese(V.nk)}: turni consecutivi`);
  }
  draft.var.filter(v=>v.turno===n&&v.t==='sost'&&t[v.slot]).forEach(v=>{
    if(!anagOf({id:v.entraId,n:v.entra}))a.push(`Sostituto ${v.entra} non presente in anagrafica`);
    if(Object.values(t).some(s=>chiave(s)===chiave({id:v.entraId,n:v.entra})))a.push(`${v.entra} sostituisce il ${it(parse(v.giorno))} ma è già in servizio nello stesso turno`);
  });
  return a;
}
function opzioni(k,cur){
  const u=usati(),V=vicini(),ck=cur?chiave(cur):null; let L=ANAG.filter(a=>a.attivo!==false&&(k==='SUP'?a.r==='S':k==='COO'?a.r==='C':a.r==='A'&&(k==='VICE'||showAll||a.s===SET[k])));
  L=L.filter(a=>(!u.has(chiave(a))||chiave(a)===ck)&&!(gt===1&&V.pv.has(chiave(a)))&&!(gt===5&&V.nx.has(chiave(a))));
  return L.map(a=>`<option value="${esc(etich(a))}"${a.z?` label="Zona ${a.z}"`:''}></option>`).join('');
}
function viewVar(n,t){
  const y=+gk.slice(0,4),m=+gk.slice(5),last=new Date(y,m,0).getDate(),a=(n-1)*6+1,b=n===5?last:n*6,days=[];
  for(let d=a;d<=b;d++){const x=new Date(y,m-1,d);days.push(`<option value="${iso(x)}">${WD[x.getDay()]} ${it(x)}</option>`)}
  const sl=ORDER.filter(k=>t[k]).map(k=>`<option value="${k}">${SLOTS[k][0]} · ${esc(t[k].n)}</option>`).join('');
  const L=draft.var.map((v,i)=>[v,i]).filter(x=>x[0].turno===n&&t[x[0].slot]);
  return `<div class="sec"><h3>Variazioni del turno</h3>
   ${L.length?`<ul class="vn">${L.map(([v,i])=>`<li>${esc(descVar(v,t))}<button data-del="${i}">Elimina</button></li>`).join('')}</ul>`:'<p style="color:var(--muted);margin:0 0 10px">Nessuna variazione registrata.</p>'}
   <div class="vf"><label>Tipo<select id="vt"><option value="sost">Sostituzione giornaliera</option><option value="orario">Orario ridotto</option><option value="nota">Nota sulla persona</option></select></label>
   <label>Posto<select id="vs">${sl}</select></label><label>Giorno (sostituzione)<select id="vd">${days.join('')}</select></label>
   <label>Sostituto<input id="ve" list="dlAll" placeholder="Scrivi o scegli"></label><label>Dalle ore<input id="vh" type="time"></label><label>Nota / dettaglio<input id="vx" placeholder="es. solo giorni feriali"></label></div>
   <datalist id="dlAll">${ANAG.filter(a=>a.attivo!==false).map(a=>`<option value="${esc(etich(a))}"></option>`).join('')}</datalist>
   <button class="go" id="va" style="margin-top:10px">Aggiungi variazione</button> <small style="color:var(--muted)">Per uno scambio inserisci due sostituzioni.</small></div>`;
}
const statoSalv=()=>{const d=DATA[gk];return !d?'Mese non ancora salvato':d.rev===undefined?'Salvato (dati di prova)':`Ultima versione salvata: rev ${pad(d.rev)} del ${it(new Date(d.agg))}`};
function viewLogin(){
  if(Store.richiedeLogin)return `<div class="panel login"><h2>Sezione riservata</h2><p style="margin:0;color:var(--muted)">Solo gli amministratori possono modificare turni e anagrafica. Il tuo profilo (${esc(Store.utente?Store.utente.email:'')}) è in sola lettura.</p></div>`;
  return `<div class="panel login"><h2>Accesso riservato</h2><p style="margin:0;color:var(--muted)">La compilazione dei turni è riservata.</p>
   <label>ID<input id="u" autocomplete="username"></label><label>Password<input id="p" type="password" autocomplete="current-password"></label>
   <div class="err" id="er">${esc(lerr)}</div><button class="go" id="lg" style="margin:0">Accedi</button></div>`;
}
function viewGenera(){
  if(!auth)return viewLogin();
  const keys=Object.keys(DATA).sort(); if(!gk)apri(keys.length?keys[keys.length-1]:iso(new Date()).slice(0,7));
  const y=+gk.slice(0,4),m=+gk.slice(5),last=new Date(y,m,0).getDate(),t=draft.turni[gt]||(draft.turni[gt]={});
  const rng=n=>`${pad((n-1)*6+1)}–${pad(n===5?last:n*6)}`;
  const tabs=[1,2,3,4,5].map(n=>`<button data-gt="${n}" aria-pressed="${n===gt&&gv==='turni'}">Turno ${n} · ${rng(n)}</button>`).join('')
    +`<button data-gv="rec" aria-pressed="${gv==='rec'}">Recapiti e imprese</button>`;
  let body='';
  if(gv==='turni'){
    const al=avvisi(t,gt);
    const row=(k,cls,prof)=>{const s=t[k],man=s&&!anagOf(s);return `<div class="gr ${cls}"><b>${prof}${k[0]==='Z'?`<br><small>Slot ${SET[k]} · Zona ${IDEAL[k]}</small>`:''}</b>
      <span><input list="dl-${k}" data-k="${k}" value="${esc(s?s.n:'')}" placeholder="Scrivi o scegli un nominativo" aria-label="${prof}" style="width:100%"><datalist id="dl-${k}">${opzioni(k,s)}</datalist></span>
      ${man?`<span class="ph"><input data-ph="0" data-k="${k}" placeholder="Recapito 1" value="${esc(s.t[0]||'')}"><input data-ph="1" data-k="${k}" placeholder="Recapito 2" value="${esc(s.t[1]||'')}"></span>`
      :`<small>${s?esc((s.area?s.area+' · ':'')+(s.t||[]).join(' / ')):''}</small>`}</div>`};
    body=`${al.length?`<div class="alerts"><h3>Avvisi sul turno (non compaiono in stampa)</h3><ul>${al.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'<div class="alerts" style="background:var(--sage-l);border-color:var(--sage)"><h3>Turno conforme al modello ideale</h3></div>'}
      ${row('SUP','sup','Supervisore')}${row('COO','coo','Coordinatore')}${row('VICE','vic','Vice coordinatore')}
      ${['Z1','Z4','Z2','Z5','Z3','Z6'].map(k=>row(k,'add','Addetto')).join('')}
      <label class="chk"><input type="checkbox" id="all" ${showAll?'checked':''}> Mostra addetti di tutti i settori</label>${viewVar(gt,t)}`;
  } else {
    const ar=(arr,g)=>arr.map((i,j)=>`<div class="ar"><b>${esc(i.zona)}</b><input data-g="${g}" data-j="${j}" data-c="nome" value="${esc(i.nome)}" aria-label="Impresa"><input data-g="${g}" data-j="${j}" data-c="tel" value="${esc(i.tel)}" aria-label="Telefono"></div>`).join('');
    body=`<h3 style="font:600 1.2rem var(--serif)">Recapiti di riferimento</h3>${draft.fissi.map((f,j)=>`<div class="ar"><input data-g="fissi" data-j="${j}" data-c="etichetta" value="${esc(f.etichetta)}" aria-label="Descrizione"><span></span><input data-g="fissi" data-j="${j}" data-c="numero" value="${esc(f.numero)}" aria-label="Numero"></div>`).join('')}
      <h3 style="font:600 1.2rem var(--serif);margin-top:20px">Imprese di pronto intervento</h3><p style="color:var(--muted);margin:0 0 8px">Area Ovest</p>${ar(draft.imprese.ovest,'ovest')}
      <p style="color:var(--muted);margin:8px 0">Area Est</p>${ar(draft.imprese.est,'est')}<p style="color:var(--muted);margin:8px 0">Imprese comuni</p>${ar(draft.imprese.comune,'comune')}`;
  }
  return `<div class="panel ed"><div class="tool">
    <h2>Genera turni</h2><select id="gm" aria-label="Mese">${[...new Set([...keys,gk])].sort().map(k=>`<option value="${k}" ${k===gk?'selected':''}>${nomeMese(k)}${DATA[k]?'':' (non salvato)'}</option>`).join('')}</select>
    <input type="month" id="nm" aria-label="Nuovo mese"><button class="ghost" id="cm">Crea mese</button><span class="sp"></span>
    <button class="ghost" id="ex">Esporta backup</button><label style="display:inline-block;border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;color:var(--ink);font-size:1rem">Importa backup<input type="file" id="im" accept=".json,application/json" hidden></label><button class="ghost" id="lo">Esci</button></div>
    <p style="margin:0 0 12px;color:var(--muted);font-size:.85rem">Archivio: ${Store.nome}. Esporta un backup periodicamente.</p>
    <div class="gt">${tabs}</div>${body}
    <div class="tool" style="margin-top:20px"><button class="go" id="sv">Salva nell’archivio</button><button class="ghost" id="ar">Apri archivio / PDF</button>
    <span class="ok">${esc(gmsg)}</span><small style="color:var(--muted)">${esc(statoSalv())}</small></div></div>`;
}
function bindLogin(){
  if(!$('#lg'))return;
  const go=async()=>{if(await Store.login($('#u').value,$('#p').value)){auth=true;lerr='';render()}else{$('#er').textContent='ID o password non corretti'}};
  $('#lg').onclick=go;$('#p').onkeydown=e=>{if(e.key==='Enter')go()};
}
function bindGenera(){
  const v=$('#view');
  if(!auth){bindLogin();return}
  $('#gm').onchange=e=>{apri(e.target.value);gt=1;gv='turni';render()};
  $('#cm').onclick=()=>{const k=$('#nm').value;if(k){if(!DATA[k]&&!gkNew(k))return;apri(k);gt=1;gv='turni';render()}};
  $('#ex').onclick=()=>{const b=new Blob([JSON.stringify(Store.esporta(),null,1)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='turni_backup_'+iso(new Date())+'_'+CONFIG.versione+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);gmsg='Backup esportato';render()};
  $('#im').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{
    const J=JSON.parse(r.result),M=J.mesi,A=J.anagrafica&&Array.isArray(J.anagrafica.persone)?J.anagrafica:null;if(!M||typeof M!=='object')throw 0;const ks=Object.keys(M);
    if(!confirm(`Importare ${ks.length} mesi? I mesi già presenti verranno sovrascritti.`+(A?` Verrà sostituita anche l’anagrafica (${A.persone.length} persone).`:' Il backup non contiene l’anagrafica: resta quella attuale.')))return;
    await Store.importa(M,A);gk=null;gmsg=`Backup importato: ${ks.length} mesi`;render()}catch(x){gmsg=x&&x.message&&!(x instanceof SyntaxError)?'Importazione non riuscita: '+x.message:'File di backup non valido';render()}};r.readAsText(f)};
  $('#lo').onclick=()=>{Store.logout();auth=false;gk=null;render()};
  v.querySelectorAll('[data-gt]').forEach(b=>b.onclick=()=>{gt=+b.dataset.gt;gv='turni';if(!draft.turni[gt])draft.turni[gt]={};render()});
  v.querySelectorAll('[data-gv]').forEach(b=>b.onclick=()=>{gv='rec';render()});
  v.querySelectorAll('input[data-k]:not([data-ph])').forEach(inp=>{inp.onfocus=()=>inp.select();inp.onchange=()=>{
    const k=inp.dataset.k,t=draft.turni[gt],n=inp.value.trim(),old=t[k];
    if(!n)delete t[k];else{const a=trova(n);
      if(a){const o={id:a.id,n:a.n,t:a.t.filter(Boolean)};if(k!=='SUP'&&k!=='COO')o.area=a.ar;t[k]=o}
      else t[k]={n,t:old&&!anagOf(old)?old.t:['','']}}
    gmsg=draft.var.some(x=>x.turno===gt&&x.slot===k)?'Attenzione: questo posto ha variazioni collegate, verificale':'';render()}});
  v.querySelectorAll('input[data-ph]').forEach(i=>i.oninput=()=>{draft.turni[gt][i.dataset.k].t[+i.dataset.ph]=i.value});
  v.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{draft.var.splice(+b.dataset.del,1);gmsg='';render()});
  const va=$('#va');if(va)va.onclick=()=>{
    const tp=$('#vt').value,k=$('#vs').value,x={t:tp,turno:gt,slot:k};
    if(tp==='sost'){x.giorno=$('#vd').value;{const tx=$('#ve').value.trim(),a=trova(tx);x.entra=a?a.n:tx;if(a)x.entraId=a.id}}
    else if(tp==='orario'){x.da=$('#vh').value;x.testo=$('#vx').value.trim()}else x.testo=$('#vx').value.trim();
    if(!k||(tp==='sost'&&!x.entra)||(tp==='orario'&&!x.da)||(tp==='nota'&&!x.testo)){gmsg='Compila i campi della variazione';render();return}
    draft.var.push(x);gmsg='';render()};
  const al=$('#all');if(al)al.onchange=()=>{showAll=al.checked;render()};
  v.querySelectorAll('input[data-g]').forEach(i=>i.oninput=()=>{const g=i.dataset.g==='fissi'?draft.fissi:draft.imprese[i.dataset.g];g[+i.dataset.j][i.dataset.c]=i.value;gmsg=''});
  $('#sv').onclick=async()=>{
    let r=await Store.salvaMese(gk,draft,draft.baseRev);
    if(r.conflitto&&confirm(`Questo mese è stato modificato da un altro utente (rev ${pad(r.attuale)}) dopo l’apertura. Sovrascrivere comunque?`))r=await Store.salvaMese(gk,draft,draft.baseRev,{forza:true});
    if(r.ok){draft.rev=r.rev;draft.agg=r.agg;draft.baseRev=r.rev;gmsg=`Salvato (${Store.nome}) · rev ${pad(r.rev)}`}
    else gmsg=r.conflitto?'Salvataggio annullato: mese modificato da altri':'Errore di salvataggio: '+(r.errore||'');
    render()};
  $('#ar').onclick=()=>{meseSel=gk;tab='archivio';document.querySelectorAll('nav.tabs button').forEach(x=>x.setAttribute('aria-selected',x.dataset.v==='archivio'));render()};
}
const gkNew=k=>{DATA[k]=undefined;delete DATA[k];return true};

/* ===== ROUTING ===== */
function render(){
  const v=$('#view');
  if(tab==='corso'){v.innerHTML=viewCorso();
    const dt=$('#dt'); if(dt) dt.onchange=e=>{if(e.target.value){consulta=e.target.value;giorno=null;render()}};
    v.querySelectorAll('.day').forEach(b=>b.onclick=()=>{giorno=b.dataset.g;render()});
  } else if(tab==='archivio'){
    v.innerHTML=viewArchivio();
    const keys=Object.keys(DATA).sort(), i=keys.indexOf(meseSel);
    $('#ms').onchange=e=>{meseSel=e.target.value;render()};
    $('#pv').onclick=()=>{meseSel=keys[i-1];render()};
    $('#nx').onclick=()=>{meseSel=keys[i+1];render()};
    $('#pdf').onclick=()=>{const t=document.title;document.title='Turni_reperibilita_'+meseSel+'_'+CONFIG.versione;window.print();document.title=t};
  } else if(tab==='anagrafica'){
    v.innerHTML=viewAnagrafica();bindAnagrafica();
  } else if(tab==='utenti'){
    v.innerHTML=viewUtenti();bindUtenti();
  } else {
    v.innerHTML=viewGenera();bindGenera();
  }
}

/* ===== API per gli altri moduli: chi è in servizio in un dato giorno (con sostituzioni applicate) ===== */
function turnoAl(d){
  const dd=parse(d),mese=DATA[d.slice(0,7)];if(!mese)return null;
  const r=range(dd),t=mese.turni[r.n];if(!t)return null;
  const righe=ORDER.filter(k=>t[k]).map(k=>{const s=t[k];let p=s,tit=null;
    mese.var.filter(v=>v.turno===r.n&&v.slot===k&&v.t==='sost'&&v.giorno===d).forEach(v=>{tit=s.n;p=findPerson(mese,{id:v.entraId,n:v.entra})});
    const note=mese.var.filter(v=>v.turno===r.n&&v.slot===k&&v.t!=='sost').map(v=>v.t==='orario'?`dalle ore ${v.da}${v.testo?' ('+v.testo+')':''}`:v.testo);
    return{slot:k,profilo:SLOTS[k][0],area:s.area||SLOTS[k][1],id:p.id||null,nome:p.n,tel:(p.t||[]).filter(Boolean),titolare:tit,note};});
  return{mese:d.slice(0,7),turno:r.n,dal:iso(r.a),al:iso(r.b),rev:mese.rev===undefined?null:mese.rev,righe};
}
const TABS={corso:'Turno in corso',archivio:'Archivio turni',genera:'Genera turni',anagrafica:'Anagrafica',utenti:'Utenti'};
/* opz.tabs: quali schede mostrare (Turni: corso, archivio; Amministrazione: genera, anagrafica, utenti) */
function montaTurni(root,opz={}){
  if(Store.richiedeLogin)auth=!!Store.admin;          /* con login reale: modifica solo per gli admin */
  const tabs=opz.tabs||['corso','archivio'];
  if(!tabs.includes(tab))tab=tabs[0];
  root.innerHTML=`<div id="m-turni"><nav class="tabs" role="tablist">${tabs.map(t=>`<button role="tab" aria-selected="${t===tab}" data-v="${t}">${TABS[t]}</button>`).join('')}</nav><section id="view"></section></div>`;
  root.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.v;root.querySelectorAll('nav.tabs button').forEach(x=>x.setAttribute('aria-selected',x===b));render()});
  render();
}
Moduli.turni={id:'turni',titolo:'Turni',monta:montaTurni,api:{turnoAl}};
