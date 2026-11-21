/* Schede dei ruoli (V00.09): Addetto, Coordinatore, Supervisore.
   Prima pagina precompilata dal turno: chi compila, date del turno, componenti con recapiti.
   Il registro degli interventi e il riepilogo arrivano con la V00.10. */
const RUOLO_T={A:'Addetto',C:'Coordinatore',S:'Supervisore'};
const SLOT_RUOLI={SUP:['S'],COO:['C'],VICE:['A','C'],Z1:['A'],Z2:['A'],Z3:['A'],Z4:['A'],Z5:['A'],Z6:['A']};
const RIGA_CL={SUP:'r-sup',COO:'r-coo',VICE:'r-vic'};
let rlL='A', rlSt={k:null,n:null,pid:null};

/* Turni selezionabili: quelli degli ultimi tre mesi presenti in archivio, dal più recente. */
function rlElenco(){
  const out=[];
  for(const k of Object.keys(DATA).sort().reverse().slice(0,3)){
    const[y,m]=k.split('-').map(Number);
    for(const n of Object.keys(DATA[k].turni||{}).map(Number).sort((a,b)=>b-a)){
      if(!Object.keys(DATA[k].turni[n]).length)continue;
      const r=range(new Date(y,m-1,(n-1)*6+1));out.push({k,n,a:r.a,b:r.b});
    }
  }
  return out;
}
const rlPuoSimulare=()=>tuttiAdmin();   /* l'admin (o la prova locale) può aprire la scheda "come" un'altra persona */
function rlPersona(){return rlPuoSimulare()&&rlSt.pid?ANAG.find(a=>a.id===rlSt.pid)||null:personaMia()}
function rlScegli(p,el,oggi=new Date()){
  const iniziati=el.filter(t=>t.a<=oggi);
  const fine=t=>new Date(t.b.getFullYear(),t.b.getMonth(),t.b.getDate()+1);
  return (p&&iniziati.find(t=>slotsDi(p,t.k,t.n).length))||iniziati.find(t=>oggi<fine(t))||el[0];
}
const rlTel=a=>(a||[]).filter(Boolean).map(x=>call(x)).join(' ');

function viewRuolo(L,oggi=new Date()){
  const nome=RUOLO_T[L],p=rlPersona(),el=rlElenco();
  if(!el.length)return `<div class="panel"><div class="soon"><h2>Scheda ${nome}</h2>Non ci sono ancora turni in archivio.</div></div>`;
  if(!el.some(t=>t.k===rlSt.k&&t.n===rlSt.n)){const c=rlScegli(p,el,oggi);rlSt.k=c.k;rlSt.n=c.n}
  const t=el.find(x=>x.k===rlSt.k&&x.n===rlSt.n),m=DATA[t.k],tt=m.turni[t.n];
  const miei=p?slotsDi(p,t.k,t.n):[];
  const etichSlot=s=>SLOTS[s][0]==='Addetto'?'Addetto':SLOTS[s][0];
  let nota='';
  if(p){
    if(!miei.length)nota=`<div class="alerts"><h3>Turno</h3>Non risulti tra i componenti di questo turno.</div>`;
    else if(!miei.some(s=>SLOT_RUOLI[s].includes(L)))nota=`<div class="alerts"><h3>Attenzione al ruolo</h3>In questo turno risulti come ${miei.map(etichSlot).join(', ')}, ma stai aprendo la scheda ${nome}.</div>`;
  }
  const ab=p?ruoliAbilitati(p,oggi):{};
  const sim=rlPuoSimulare()?`<label class="chk" style="margin:0 0 14px;flex-direction:column!important;align-items:stretch;gap:4px!important">Anteprima come (solo amministratore)
      <select id="rlP"><option value="">— nessuna —</option>${ANAG.filter(a=>a.attivo!==false).sort((a,b)=>a.n.localeCompare(b.n,'it')).map(a=>`<option value="${a.id}"${p&&a.id===p.id&&rlSt.pid?' selected':''}>${esc(etich(a))} · ${RUOLI[a.r]||''}</option>`).join('')}</select></label>`:'';
  const chi=p?`<div class="grid2">
      <div class="box"><span>Nominativo</span><b>${esc(p.n)}</b></div>
      <div class="box"><span>Ruolo in anagrafica</span><b>${RUOLI[p.r]||'—'}</b></div>
      ${p.mat?`<div class="box"><span>Matricola</span><b>${esc(p.mat)}</b></div>`:''}
      <div class="box"><span>Residenza</span><b>${p.res?esc(p.res):'<i style="font-weight:400;color:var(--muted)">non indicata</i>'}</b></div>
      ${p.em?`<div class="box"><span>Email</span><b>${esc(p.em)}</b></div>`:''}
      ${(p.t||[]).some(Boolean)?`<div class="box"><span>Telefoni</span>${rlTel(p.t)}</div>`:''}
      <div class="box"><span>Schede abilitate</span><b>${Object.keys(ab).map(x=>RUOLO_T[x]).join(', ')||'—'}</b><span>${Object.entries(ab).map(([x,mo])=>RUOLO_T[x]+': '+mo).join(' · ')}</span></div></div>`
    :`<p style="color:var(--muted);margin:0">${rlPuoSimulare()?'Scegli una persona per vedere la scheda come la vedrebbe lei.':'Il tuo account non è collegato a una persona dell’anagrafica.'}</p>`;
  const righe=ORDER.filter(s=>tt[s]).map(s=>{const x=tt[s],mio=miei.includes(s),a=x.area||SLOTS[s][1];
    return `<tr class="${RIGA_CL[s]||'r-add'}"><td>${etichSlot(s)}${a?`<br><small style="color:var(--muted)">${esc(a)}</small>`:''}</td><td><b>${esc(x.n)}</b>${mio?' <span class="pill">tu</span>':''}</td><td>${rlTel(x.t)}</td></tr>`}).join('');
  const varz=varTxt(m,t.n);
  return `<div class="panel"><div class="banner"><div><small>Scheda</small><h2>${nome}</h2></div><span class="pill">Registro e riepilogo: V00.10</span></div>
    ${sim}
    <div class="sec" style="margin-top:0"><h3>Chi compila</h3>${chi}</div>
    <div class="sec"><h3>Turno</h3>
      <div class="tool"><select id="rlT" aria-label="Turno">${el.map(x=>`<option value="${x.k}|${x.n}"${x.k===t.k&&x.n===t.n?' selected':''}>${x.n}° turno · ${nomeMese(x.k)} · dal ${it(x.a).slice(0,5)} al ${it(x.b).slice(0,5)}${p&&slotsDi(p,x.k,x.n).length?' ●':''}</option>`).join('')}</select>
        <span style="color:var(--muted);font-size:.88rem">● = turni in cui compari</span></div>
      <div class="grid2" style="margin-bottom:12px"><div class="box"><span>Inizio turno</span><b>${it(t.a)} · ore 00:00</b></div><div class="box"><span>Fine turno</span><b>${it(t.b)} · ore 23:59</b></div></div>
      ${nota}
      <div class="sheet"><div class="tw"><table><thead><tr><th>Ruolo</th><th>Nominativo</th><th>Recapiti</th></tr></thead><tbody>${righe}</tbody></table></div>
      ${varz.length?`<ul class="vn">${varz.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}</div></div>
    <div class="sec"><div class="soon" style="padding:24px 10px"><h2>Registro degli interventi e riepilogo del turno</h2>In arrivo con la prossima versione: compilazione, controlli, PDF ed Excel.</div></div></div>`;
}
function rlRender(){
  const el=$('#m-ruolo');if(!el)return;
  el.innerHTML=viewRuolo(rlL);
  const t=$('#rlT');if(t)t.onchange=e=>{const[k,n]=e.target.value.split('|');rlSt.k=k;rlSt.n=+n;rlRender()};
  const s=$('#rlP');if(s)s.onchange=e=>{rlSt.pid=e.target.value?+e.target.value:null;rlSt.k=rlSt.n=null;rlRender()};
}
Moduli.ruoli={id:'ruoli',titolo:'Schede dei ruoli',monta(el,L){rlL=L;el.innerHTML='<div id="m-ruolo"></div>';rlRender()}};
