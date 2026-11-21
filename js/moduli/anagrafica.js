/* Modulo ANAGRAFICA (V00.06): elenco, nuova persona, modifica, cessazione e riattivazione.
   Dipende da util.js e store.js; per accesso e ridisegno usa da turni.js: auth, viewLogin, bindLogin, render, gk. */
const RUOLI={S:'Supervisore',C:'Coordinatore',A:'Addetto'};
const ZONE={1:['Ovest','Nord'],2:['Ovest','Centro'],3:['Ovest','Sud'],4:['Est','Nord'],5:['Est','Centro'],6:['Est','Sud']};
const areaZona=z=>`${ZONE[z][0]} · Zona ${z} · ${ZONE[z][1]}`;

let anF={ruolo:'',stato:'att',q:''}, anEd=null, anErr=[], anMsg='';
const anVuota=()=>({id:null,n:'',mat:'',r:'',z:'',t1:'',t2:'',em:'',res:'',ra:[]});
const anDa=p=>({id:p.id,n:p.n,mat:p.mat||'',r:p.r,z:p.z||'',t1:(p.t||[])[0]||'',t2:(p.t||[])[1]||'',em:p.em||'',res:p.res||'',ra:(p.ra||[]).slice()});

function anFiltra(){
  const q=anF.q.trim().toLowerCase();
  return ANAG.filter(p=>(!anF.ruolo||p.r===anF.ruolo)
      &&(anF.stato==='tutti'||(anF.stato==='att')===(p.attivo!==false))
      &&(!q||[p.n,p.mat,p.em,p.res,...(p.t||[])].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>a.n.localeCompare(b.n,'it'));
}
function anTabella(){
  const L=anFiltra();
  if(!L.length)return '<p class="soon">Nessuna persona corrisponde ai filtri.</p>';
  return `<div class="tw"><table><thead><tr><th>ID</th><th>Nominativo</th><th>Ruolo</th><th>Area</th><th>Residenza</th><th>Recapiti</th><th>Stato</th><th></th></tr></thead><tbody>${
    L.map(p=>{const ces=p.attivo===false;
      return `<tr class="${ces?'ces':''}"><td class="num">${p.id}</td>
        <td><b>${esc(p.n)}</b>${p.mat?`<small>Matricola ${esc(p.mat)}</small>`:''}</td>
        <td><span class="rl ${p.r}">${RUOLI[p.r]||'—'}</span>${(p.ra||[]).length?`<small>anche: ${p.ra.map(x=>RUOLI[x]).join(', ')}</small>`:''}</td><td>${esc(p.ar||'')}</td>
        <td>${p.res?esc(p.res):'<span style="color:var(--muted)">—</span>'}</td>
        <td>${(p.t||[]).filter(Boolean).map(x=>esc(x)).join('<br>')}${p.em?`<small>${esc(p.em)}</small>`:''}</td>
        <td><span class="pill${ces?' off':''}">${ces?'Cessato':'In servizio'}</span></td>
        <td style="white-space:nowrap"><button class="mini" data-mod="${p.id}">Modifica</button><button class="mini" data-${ces?'att':'ces'}="${p.id}">${ces?'Riattiva':'Cessa'}</button></td></tr>`}).join('')
  }</tbody></table></div>`;
}
function viewAnLista(){
  const att=ANAG.filter(p=>p.attivo!==false).length, sel=(a,b)=>a===b?' selected':'';
  return `<div class="panel ed an"><div class="tool"><h2>Anagrafica</h2><span class="sp"></span>
    <button class="go" id="anNew">Nuova persona</button><button class="ghost" id="anLo">Esci</button></div>
    <p style="margin:0 0 12px;color:var(--muted);font-size:.85rem">${att} in servizio · ${ANAG.length-att} cessati · Archivio: ${Store.nome}.
      Le modifiche non alterano i turni già salvati. Il backup (scheda «Genera turni») include anche l’anagrafica.</p>
    ${anMsg?`<p class="ok" style="margin:0 0 12px">${esc(anMsg)}</p>`:''}
    <div class="tool">
      <select id="anR" aria-label="Ruolo"><option value=""${sel(anF.ruolo,'')}>Tutti i ruoli</option>${Object.entries(RUOLI).map(([k,v])=>`<option value="${k}"${sel(anF.ruolo,k)}>${v}</option>`).join('')}</select>
      <select id="anS" aria-label="Stato"><option value="att"${sel(anF.stato,'att')}>In servizio</option><option value="ces"${sel(anF.stato,'ces')}>Cessati</option><option value="tutti"${sel(anF.stato,'tutti')}>Tutti</option></select>
      <input id="anQ" type="search" placeholder="Cerca nome, matricola, telefono…" value="${esc(anF.q)}" style="flex:1;min-width:180px" aria-label="Cerca">
    </div><div id="anTab">${anTabella()}</div></div>`;
}
function viewAnForm(){
  const e=anEd, nuova=!e.id;
  const f=(k,lab,extra='')=>`<label>${lab}<input data-f="${k}" value="${esc(e[k])}" ${extra}></label>`;
  return `<div class="panel ed an"><div class="tool"><h2>${nuova?'Nuova persona':'Modifica persona · id '+e.id}</h2></div>
    ${anErr.length?`<div class="alerts"><h3>Controlla i dati</h3><ul>${anErr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <div class="afm">
      ${f('n','Nominativo (Cognome Nome) *','placeholder="es. Rossi Mario"')}${f('mat','Matricola')}
      <label>Ruolo *<select id="anRu"><option value="">Scegli…</option>${Object.entries(RUOLI).map(([k,v])=>`<option value="${k}"${e.r===k?' selected':''}>${v}</option>`).join('')}</select></label>
      ${e.r==='A'?`<label>Zona *<select data-f="z"><option value="">Scegli…</option>${Object.keys(ZONE).map(z=>`<option value="${z}"${+e.z===+z?' selected':''}>${areaZona(z)}</option>`).join('')}</select></label>`:''}
      ${f('t1','Telefono 1','type="tel"')}${f('t2','Telefono 2','type="tel"')}${f('em','Email','type="email"')}${f('res','Residenza')}
      <div class="ra" style="grid-column:1/-1"><span>Può operare anche come</span>${Object.entries(RUOLI).filter(([k])=>k!==e.r).map(([k,v])=>`<label class="chk"><input type="checkbox" data-ra="${k}"${(e.ra||[]).includes(k)?' checked':''}>${v}</label>`).join('')}</div>
    </div>
    <p style="color:var(--muted);font-size:.85rem;margin:10px 0 0">Esempio: un coordinatore che a volte fa il supervisore. Il vice coordinatore vede in automatico anche la scheda Coordinatore nel suo turno: non serve impostarlo qui.</p>
    <p style="color:var(--muted);font-size:.85rem;margin:14px 0 0">${nuova?'L’id progressivo viene assegnato dal sistema al salvataggio.':'Le modifiche ai recapiti non cambiano i turni già salvati.'} I campi con * sono obbligatori.</p>
    <div class="tool" style="margin-top:14px"><button class="go" id="anSv">Salva</button><button class="ghost" id="anNo">Annulla</button></div></div>`;
}
const viewAnagrafica=()=>!auth?viewLogin():anEd!==null?viewAnForm():viewAnLista();

async function anSalva(){
  const e=anEd, n=e.n.trim().replace(/\s+/g,' '), mat=e.mat.trim(), em=e.em.trim(), err=[];
  if(!n)err.push('Il nominativo è obbligatorio');
  if(!e.r)err.push('Scegli il ruolo');
  if(e.r==='A'&&!e.z)err.push('Per un addetto indica la zona');
  if(em&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))err.push('L’indirizzo email non sembra valido');
  if(mat){const d=ANAG.find(a=>a.id!==e.id&&String(a.mat||'')===mat);if(d)err.push(`La matricola ${mat} è già assegnata a ${d.n} (id ${d.id})`)}
  if(err.length){anErr=err;render();return}
  const om=ANAG.filter(a=>a.id!==e.id&&a.n.toLowerCase()===n.toLowerCase());
  if(om.length&&!confirm(`Esiste già ${om.length>1?om.length+' persone':'una persona'} con il nominativo «${n}» (id ${om.map(a=>a.id).join(', ')}). Salvare comunque come persona distinta?`))return;
  const vecchia=e.id?ANAG.find(a=>a.id===e.id):null;
  const p=Object.assign(vecchia?clone(vecchia):{attivo:true},{n,r:e.r,t:[e.t1.trim(),e.t2.trim()].filter(Boolean)});
  const ra=(e.ra||[]).filter(x=>x!==e.r&&RUOLI[x]);if(ra.length)p.ra=ra;else delete p.ra;
  if(e.id)p.id=e.id;
  for(const [k,v] of [['mat',mat],['em',em],['res',e.res.trim()]]){if(v)p[k]=v;else delete p[k]}
  if(e.r==='A'){p.z=+e.z;p.s=ZONE[p.z][1];p.ar=areaZona(p.z)}else{delete p.z;delete p.s;delete p.ar}
  const r=await Store.salvaPersona(p);
  if(!r.ok){anErr=['Errore di salvataggio: '+(r.errore||'')];render();return}
  anMsg=e.id?`${n}: modifiche salvate`:`${n}: aggiunto con id ${r.id}`;anEd=null;anErr=[];render();
}
function bindAnagrafica(){
  if(!auth){bindLogin();return}
  const v=$('#view');
  if(anEd!==null){
    v.querySelectorAll('[data-f]').forEach(i=>i.oninput=()=>{anEd[i.dataset.f]=i.value});
    v.querySelectorAll('[data-ra]').forEach(i=>i.onchange=()=>{anEd.ra=[...v.querySelectorAll('[data-ra]:checked')].map(x=>x.dataset.ra)});
    $('#anRu').onchange=e=>{anEd.r=e.target.value;if(anEd.r!=='A')anEd.z='';anEd.ra=(anEd.ra||[]).filter(x=>x!==anEd.r);anErr=[];render()};
    $('#anSv').onclick=anSalva;
    $('#anNo').onclick=()=>{anEd=null;anErr=[];render()};
    return;
  }
  $('#anNew').onclick=()=>{anEd=anVuota();anErr=[];anMsg='';render()};
  $('#anLo').onclick=()=>{Store.logout();auth=false;gk=null;anEd=null;anMsg='';render()};
  const agg=()=>{$('#anTab').innerHTML=anTabella()};
  $('#anR').onchange=e=>{anF.ruolo=e.target.value;agg()};
  $('#anS').onchange=e=>{anF.stato=e.target.value;agg()};
  $('#anQ').oninput=e=>{anF.q=e.target.value;agg()};
  $('#anTab').onclick=async e=>{
    const b=e.target.closest('button[data-mod],button[data-ces],button[data-att]');if(!b)return;
    const id=+(b.dataset.mod||b.dataset.ces||b.dataset.att),p=ANAG.find(a=>a.id===id);if(!p)return;
    if(b.dataset.mod){anEd=anDa(p);anErr=[];anMsg='';render();return}
    const ces=b.dataset.ces!==undefined;
    if(ces&&!confirm(`Segnare ${p.n} come cessato? Non comparirà più nelle scelte dei turni, ma resterà nello storico.`))return;
    const r=await Store.salvaPersona(Object.assign(clone(p),{attivo:!ces}));
    anMsg=r.ok?`${p.n}: ${ces?'cessato':'riattivato'}`:'Errore: '+r.errore;render();
  };
}
Moduli.anagrafica={id:'anagrafica',titolo:'Anagrafica'};
