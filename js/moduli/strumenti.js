/* Scheda STRUMENTI (V00.15, solo admin, in Amministrazione): backup completo (anagrafica + mesi + registri), importazione con anteprima,
   elimina mese e azzera dati di prova. Ogni operazione che cancella scarica PRIMA un backup e chiede una conferma scritta.
   Le funzioni SQL (elimina_mese, azzera_dati_prova, importa_registri) controllano comunque che chi chiama sia admin. */
let stMsg='',stErr='',stBusy=false,stConta=null,stSel='';

/* Scarica un file JSON (nessuna dipendenza dal server) */
function stScarica(nome,oggetto){
  const b=new Blob([JSON.stringify(oggetto,null,1)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
const stIntesta=tipo=>({app:'turni',versione:CONFIG.versione,schema:3,tipo,esportato:new Date().toISOString()});
const stData=()=>iso(new Date());

/* Backup completo: anagrafica, mesi e registri (con visti e rettifiche). Scarica il file e restituisce i conteggi. */
async function stBackupCompleto(nomeFile){
  const registri=Store.registriTutti?await Store.registriTutti():[],e=Store.esporta();
  stScarica(nomeFile||`turni_backup_completo_${stData()}_${CONFIG.versione}.json`,Object.assign(stIntesta('completo'),{anagrafica:e.anagrafica,mesi:e.mesi,registri}));
  return{persone:e.anagrafica.persone.length,mesi:Object.keys(e.mesi).length,registri:registri.length};
}
/* Backup di un solo mese (senza anagrafica: in ripristino resta quella attuale) */
async function stBackupMese(k){
  const registri=(Store.registriTutti?await Store.registriTutti():[]).filter(r=>r.mese===k);
  stScarica(`turni_backup_mese_${k}_${stData()}_${CONFIG.versione}.json`,Object.assign(stIntesta('mese'),{mesi:{[k]:DATA[k]},registri}));
  return{registri:registri.length};
}
/* Importa un backup già letto (oggetto JSON): anteprima con conteggi e conferma. Restituisce il messaggio, oppure lancia l'errore. */
async function stImportaOggetto(J){
  if(!J||typeof J!=='object'||!J.mesi||typeof J.mesi!=='object')throw new SyntaxError('File di backup non valido');
  const M=J.mesi,ks=Object.keys(M),A=J.anagrafica&&Array.isArray(J.anagrafica.persone)?J.anagrafica:null,R=Array.isArray(J.registri)?J.registri:[];
  const righe=[`${ks.length} ${ks.length===1?'mese':'mesi'}`,`${R.length} ${R.length===1?'registro':'registri'}`,A?`anagrafica di ${A.persone.length} persone`:'nessuna anagrafica'];
  if(!confirm(`Il backup contiene: ${righe.join(', ')}.\n\nI mesi e i registri già presenti verranno sovrascritti`+(A?' e l’anagrafica verrà sostituita.':'; l’anagrafica attuale resta com’è.')+'\n\nProcedere con l’importazione?'))return 'Importazione annullata.';
  await Store.importa(M,A);
  let msg=`Backup importato: ${ks.length} ${ks.length===1?'mese':'mesi'}`;
  if(R.length){
    if(!Store.importaRegistri)throw new Error('questo archivio non permette di ripristinare i registri');
    const r=await Store.importaRegistri(R);
    if(!r.ok)throw new Error('registri non ripristinati: '+(r.errore||'errore sconosciuto'));
    msg+=`, ${r.importati} registri`+(r.saltati?` (${r.saltati} saltati: persona non presente in anagrafica)`:'');
  }
  return msg;
}
/* Elimina un mese: backup, conferma scritta (il mese stesso), cancellazione. */
async function stEliminaMese(k){
  if(!k)return 'Scegli il mese da eliminare.';
  const registri=Store.registriTutti?(await Store.registriTutti()).filter(r=>r.mese===k).length:0;
  if(!confirm(`Eliminare ${nomeMese(k)}?\n\nVerranno cancellati il mese con i suoi 5 turni, ${registri} ${registri===1?'registro':'registri'} e le mail registrate per quel mese. L’anagrafica non viene toccata.\n\nPrima di cancellare viene scaricato un backup del mese.`))return 'Eliminazione annullata.';
  await stBackupMese(k);
  const t=prompt(`Per confermare scrivi il mese esattamente così: ${k}`);
  if(t===null||String(t).trim()!==k)return 'Eliminazione annullata: il mese scritto non coincide.';
  const r=await Store.eliminaMese(k);
  if(!r.ok)throw new Error(r.errore||'errore sconosciuto');
  gk=null;if(meseSel===k)meseSel=null;stSel='';
  return `${nomeMese(k)} eliminato (${r.registri} ${r.registri===1?'registro':'registri'}, ${r.invii} ${r.invii===1?'mail':'mail'}). Il backup del mese è stato scaricato.`;
}
/* Azzera i dati di prova: conteggi, backup completo, doppia conferma (la seconda scritta). Anagrafica e account restano. */
async function stAzzera(){
  const c=await Store.contaDati();
  if(!confirm(`Azzerare i dati di prova?\n\nVerranno cancellati: ${c.mesi} ${c.mesi===1?'mese':'mesi'}, ${c.registri} ${c.registri===1?'registro':'registri'}, ${c.invii} mail registrate.\nAnagrafica e account NON vengono toccati.\n\nL’operazione non si può annullare (si ripristina solo dal backup). Prima viene scaricato un backup completo.`))return 'Azzeramento annullato.';
  await stBackupCompleto(`turni_backup_prima_azzeramento_${stData()}_${CONFIG.versione}.json`);
  const t=prompt('Seconda conferma: scrivi AZZERA (maiuscolo) per cancellare turni, registri e invii.');
  if(t===null||String(t).trim()!=='AZZERA')return 'Azzeramento annullato.';
  const r=await Store.azzeraDati();
  if(!r.ok)throw new Error(r.errore||'errore sconosciuto');
  gk=null;meseSel=null;stSel='';
  return `Dati di prova azzerati: ${r.mesi} ${r.mesi===1?'mese':'mesi'}, ${r.registri} ${r.registri===1?'registro':'registri'}, ${r.invii} mail. Anagrafica e account sono rimasti. Il backup è stato scaricato.`;
}

async function stCarica(){stErr='';try{stConta=Store.contaDati?await Store.contaDati():{mesi:Object.keys(DATA).length,registri:0,invii:0};stConta.persone=ANAG.length}catch(e){stConta={mesi:Object.keys(DATA).length,registri:null,invii:null,persone:ANAG.length};stErr='Conteggi non disponibili: '+(e.message||e)}}

function viewStrumenti(){
  if(stConta===null)return `<div class="panel"><div class="soon">Caricamento…</div></div>`;
  const keys=Object.keys(DATA).sort(),n=v=>v===null||v===undefined?'—':v;
  if(!stSel||!keys.includes(stSel))stSel=keys[keys.length-1]||'';
  return `<div class="panel ed"><h2>Strumenti di amministrazione</h2>
    <p style="margin:0 0 14px;color:var(--muted)">Archivio: ${esc(Store.nome)}. Operazioni riservate all’amministratore. Quelle che cancellano scaricano prima un backup e chiedono una conferma scritta.</p>
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="box"><span>Persone</span><b>${n(stConta.persone)}</b></div><div class="box"><span>Mesi</span><b>${n(stConta.mesi)}</b></div>
      <div class="box"><span>Registri</span><b>${n(stConta.registri)}</b></div><div class="box"><span>Mail registrate</span><b>${n(stConta.invii)}</b></div></div>
    <div class="sec" style="margin-top:18px"><h3>Backup</h3>
      <p style="margin:0 0 10px;color:var(--muted)">Il backup completo contiene l’anagrafica, tutti i mesi e tutti i registri (con visti e rettifiche). Conservalo in un posto sicuro: non contiene gli account di accesso.</p>
      <div class="tool"><button class="go" id="stBk"${stBusy?' disabled':''}>Scarica backup completo</button>
      <label class="ghostlabel" style="display:inline-block;border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;color:var(--ink);font-size:1rem">Importa backup<input type="file" id="stIm" accept=".json,application/json" hidden></label></div>
      <p style="margin:8px 0 0;color:var(--muted);font-size:.85rem">L’importazione mostra prima cosa contiene il file e chiede conferma; i mesi e i registri già presenti vengono sovrascritti.</p></div>
    <div class="sec" style="margin-top:18px"><h3>Elimina un mese</h3>
      <p style="margin:0 0 10px;color:var(--muted)">Cancella il mese scelto con i suoi turni, i registri e le mail registrate. Prima scarica il backup del mese; per confermare devi scrivere il mese.</p>
      <div class="tool"><select id="stMs" aria-label="Mese da eliminare">${keys.length?keys.map(k=>`<option value="${k}"${k===stSel?' selected':''}>${esc(nomeMese(k))}</option>`).join(''):'<option value="">Nessun mese</option>'}</select>
      <button class="ghost danger" id="stEl"${stBusy||!keys.length?' disabled':''}>Elimina mese…</button></div></div>
    <div class="sec" style="margin-top:18px"><h3>Azzera dati di prova</h3>
      <p style="margin:0 0 10px;color:var(--muted)">Svuota turni, registri e registro degli invii. <b>Non tocca</b> l’anagrafica né gli account. Serve a ripartire puliti dopo il collaudo: prima viene scaricato un backup completo e servono due conferme.</p>
      <div class="tool"><button class="ghost danger" id="stAz"${stBusy?' disabled':''}>Azzera dati di prova…</button></div></div>
    <p class="ok" style="margin:14px 0 0" role="status">${esc(stMsg)}</p>${stErr?`<p class="err" role="alert" style="margin:6px 0 0">${esc(stErr)}</p>`:''}</div>`;
}
function bindStrumenti(){
  if(stConta===null){stCarica().then(()=>{if(tab==='strumenti')render()});return}
  const esegui=async fn=>{stBusy=true;stMsg='';stErr='';render();
    try{stMsg=await fn()}catch(x){stErr=x instanceof SyntaxError?'File di backup non valido':'Operazione non riuscita: '+(x&&x.message?x.message:x)}
    stBusy=false;await stCarica();if(tab==='strumenti')render()};
  $('#stBk').onclick=()=>esegui(async()=>{const c=await stBackupCompleto();return `Backup completo scaricato: ${c.persone} persone, ${c.mesi} mesi, ${c.registri} registri.`});
  $('#stIm').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>esegui(()=>stImportaOggetto(JSON.parse(r.result)));r.readAsText(f)};
  $('#stMs').onchange=e=>{stSel=e.target.value};
  $('#stEl').onclick=()=>esegui(()=>stEliminaMese($('#stMs')?$('#stMs').value:stSel));
  $('#stAz').onclick=()=>esegui(stAzzera);
}
