/* Gestione UTENTI (V00.09, solo admin): collega ogni account di accesso a una persona dell'anagrafica.
   Gli account si creano dal pannello Supabase (Authentication > Users). */
let utLista=null, utMsg='', utErr='';
async function utCarica(){
  utErr='';
  try{utLista=await Store.elencoUtenti()}catch(e){utErr=e.message||String(e);utLista=[]}
}
function utOpzioni(u){
  const usate=new Set((utLista||[]).filter(x=>x.id!==u.id&&x.persona_id).map(x=>x.persona_id));
  return `<option value="">— non collegato —</option>`+ANAG.filter(a=>a.attivo!==false||a.id===u.persona_id)
    .sort((a,b)=>a.n.localeCompare(b.n,'it')).map(a=>`<option value="${a.id}"${a.id===u.persona_id?' selected':''}${usate.has(a.id)?' disabled':''}>${esc(etich(a))} · ${RUOLI[a.r]||''}${a.attivo===false?' (cessato)':''}${usate.has(a.id)?' · già collegata':''}</option>`).join('');
}
function viewUtenti(){
  if(!Store.elencoUtenti)return `<div class="panel"><div class="soon"><h2>Utenti</h2>Disponibile solo con l’archivio Supabase.</div></div>`;
  if(utLista===null)return `<div class="panel"><div class="soon">Caricamento degli utenti…</div></div>`;
  const usate=new Set(utLista.filter(x=>x.persona_id).map(x=>x.persona_id));
  const righe=utLista.map(u=>{
    const p=u.persona_id?ANAG.find(a=>a.id===u.persona_id):null;
    const sugg=!p&&u.email?ANAG.find(a=>a.em&&a.em.toLowerCase()===u.email.toLowerCase()&&!usate.has(a.id)):null;
    const ab=p?Object.keys(ruoliAbilitati(p)).map(x=>RUOLO_T[x]).join(', '):'';
    return `<tr><td><b>${esc(u.email||'—')}</b></td><td><span class="pill${u.ruolo==='admin'?'':' off'}">${u.ruolo==='admin'?'Amministratore':'Sola lettura'}</span></td>
      <td><select data-u="${u.id}" aria-label="Persona collegata a ${esc(u.email||'')}">${utOpzioni(u)}</select>
        ${sugg?`<small><button class="mini" data-sg="${u.id}|${sugg.id}">Collega a ${esc(sugg.n)} (stessa email)</button></small>`:''}</td>
      <td>${esc(ab)||'<span style="color:var(--muted)">nessuna</span>'}</td></tr>`}).join('');
  return `<div class="panel ed an"><div class="tool"><h2>Utenti</h2><span class="sp"></span><button class="ghost" id="utAgg">Aggiorna</button></div>
    <p style="margin:0 0 12px;color:var(--muted);font-size:.85rem">Un account può essere collegato a una sola persona, e viceversa. Le schede visibili dipendono dalla persona collegata. Gli account si creano dal pannello Supabase (Authentication › Users) e compaiono qui subito.</p>
    ${utMsg?`<p class="ok" style="margin:0 0 12px">${esc(utMsg)}</p>`:''}${utErr?`<p class="err">${esc(utErr)}</p>`:''}
    ${utLista.length?`<div class="tw"><table><thead><tr><th>Account</th><th>Accesso</th><th>Persona collegata</th><th>Schede</th></tr></thead><tbody>${righe}</tbody></table></div>`:'<p class="soon">Nessun account.</p>'}</div>`;
}
async function utCollega(uid,pid){
  const r=await Store.collegaUtente(uid,pid);
  if(r.ok){const u=utLista.find(x=>x.id===uid);u.persona_id=pid;utMsg=pid?`${u.email}: collegato a ${ANAG.find(a=>a.id===pid).n}`:`${u.email}: scollegato`;utErr=''}
  else{utErr='Collegamento non riuscito: '+r.errore;utMsg=''}
  render();
}
function bindUtenti(){
  if(!Store.elencoUtenti)return;
  if(utLista===null){utCarica().then(()=>{if(tab==='utenti')render()});return}
  const v=$('#view');
  $('#utAgg').onclick=()=>{utLista=null;utMsg='';render()};
  v.querySelectorAll('select[data-u]').forEach(s=>s.onchange=()=>utCollega(s.dataset.u,s.value?+s.value:null));
  v.querySelectorAll('button[data-sg]').forEach(b=>b.onclick=()=>{const[u,p]=b.dataset.sg.split('|');utCollega(u,+p)});
}
