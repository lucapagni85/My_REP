/* Scheda MAIL (V00.12, solo admin, in Amministrazione): stato della configurazione, mail di prova, registro degli invii con «Reinvia».
   L'invio vero lo fa la funzione server «invia-mail» (supabase/functions/invia-mail). */
let mlStato=null,mlInvii=null,mlMsg='',mlErr='',mlBusy=false;
const ML_TIPO={registro:'Registro inviato',turno:'Turni',prova:'Prova'};
async function mlCarica(tutto){
  mlErr='';
  if(!Store.inviaMail||!Store.mailAttive){mlStato={nonDisponibile:true};mlInvii=[];return}
  if(tutto||!mlStato)mlStato=await Store.inviaMail({azione:'stato'});
  try{mlInvii=await Store.elencoInvii()}catch(e){mlInvii=[];mlErr=e.message||String(e)}
}
const mlQuando=t=>{const d=new Date(t);return `${it(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
function viewMail(){
  if(mlInvii===null||mlStato===null)return `<div class="panel"><div class="soon">Caricamento…</div></div>`;
  if(mlStato.nonDisponibile)return `<div class="panel"><div class="soon"><h2>Mail</h2>Disponibile solo con l’archivio Supabase.</div></div>`;
  const S=mlStato,ok=S.ok!==false;
  const seg=!ok?'':Object.entries(S.segreti||{}).map(([k,v])=>`<li><code>${esc(k)}</code> ${v?'<b>presente</b>':(k==='APP_URL'||k==='MAIL_FROM_NAME'?'<span style="color:var(--muted)">non impostato (facoltativo)</span>':'<b class="err">mancante</b>')}</li>`).join('');
  const conf=!ok?`<p class="err">Impossibile leggere la configurazione: ${esc(S.errore||'errore sconosciuto')}${S.rete?'':' (la funzione «invia-mail» è stata pubblicata?)'}</p>`
    :`<div class="grid2"><div class="box"><span>Modalità</span><b>${S.prova?'PROVA · tutte le mail vanno a '+esc(S.destProva||'—'):'REALE · le mail vanno ai destinatari'}</b></div>
       <div class="box"><span>Mittente</span><b>${esc(S.nomeMittente||'')} &lt;${esc(S.mittente||'—')}&gt;</b></div></div>
       <ul style="margin:12px 0 0;padding-left:18px;font-size:.9rem">${seg}</ul>
       ${S.manca&&S.manca.length?`<p class="err" style="margin:10px 0 0">Configurazione incompleta: manca ${esc(S.manca.join(', '))}.</p>`:''}
       ${S.prova?'<p style="margin:10px 0 0;color:var(--muted);font-size:.85rem">In modalità prova ogni mail ha «[PROVA]» nell’oggetto e un riquadro con il destinatario reale. Per passare all’uso reale, nei segreti di Supabase imposta <code>MAIL_MODO_PROVA</code> a <code>no</code>.</p>':''}`;
  const righe=(mlInvii||[]).map(x=>{
    const dest=esc(x.nome_dest?x.nome_dest+' · ':'')+esc(x.destinatario)+(x.effettivo&&x.effettivo!==x.destinatario?`<br><small>consegnata a ${esc(x.effettivo)}</small>`:'');
    return `<tr><td>${esc(mlQuando(x.creato))}</td><td>${esc(ML_TIPO[x.tipo]||x.tipo)}${x.prova?' <span class="pill off">prova</span>':''}${x.reinvio_di?' <small>(reinvio)</small>':''}</td><td>${dest}</td><td>${esc(x.oggetto||'')}</td>
      <td><span class="pill${x.esito==='ok'?'':' err'}">${x.esito==='ok'?'Inviata':'Non inviata'}</span>${x.errore?`<br><small class="err">${esc(x.errore)}</small>`:''}</td>
      <td><button class="mini" data-ml="reinvia" data-id="${x.id}"${mlBusy?' disabled':''}>Reinvia</button></td></tr>`}).join('');
  return `<div class="panel ed an"><div class="tool"><h2>Mail</h2><span class="sp"></span><button class="ghost" id="mlAgg">Aggiorna</button></div>
    <p style="margin:0 0 12px;color:var(--muted);font-size:.85rem">Avvisi automatici dell’app: registro inviato → coordinatore del turno; turno pubblicato o modificato («Salva e avvisa» in Genera turni) → tutte le utenze. Le mail partono da un indirizzo di sistema tramite Brevo.</p>
    ${mlMsg?`<p class="ok" style="margin:0 0 12px">${esc(mlMsg)}</p>`:''}
    <div class="sec"><h3>Configurazione</h3>${conf}
      ${ok?`<div class="tool" style="margin-top:14px"><button class="go" id="mlProva"${mlBusy||(S.manca&&S.manca.length)?' disabled':''}>Invia mail di prova al mio indirizzo</button></div>`:''}</div>
    <div class="sec"><h3>Registro degli invii</h3>${mlErr?`<p class="err">${esc(mlErr)}</p>`:''}
      ${righe?`<div class="tw"><table><thead><tr><th>Data</th><th>Tipo</th><th>Destinatario</th><th>Oggetto</th><th>Esito</th><th></th></tr></thead><tbody>${righe}</tbody></table></div>`:'<p class="soon" style="padding:16px">Nessun invio registrato.</p>'}</div></div>`;
}
async function mlEsegui(corpo){
  mlBusy=true;mlMsg='';render();
  let r;try{r=await Store.inviaMail(corpo)}catch(e){r={ok:false,errore:e.message||String(e)}}
  const e=Mail.esito(r);mlMsg=e?e.t:'Operazione conclusa.';
  mlBusy=false;await mlCarica(false);if(tab==='mail')render();
}
function bindMail(){
  if(!Store.inviaMail||!Store.mailAttive){if(mlStato===null){mlStato={nonDisponibile:true};mlInvii=[];render()}return}
  if(mlInvii===null||mlStato===null){mlCarica(true).then(()=>{if(tab==='mail')render()});return}
  const v=$('#view');
  $('#mlAgg').onclick=()=>{mlStato=null;mlInvii=null;mlMsg='';render()};
  const p=$('#mlProva');if(p)p.onclick=()=>mlEsegui({azione:'prova'});
  v.querySelectorAll('button[data-ml="reinvia"]').forEach(b=>b.onclick=()=>{
    if(confirm('Rispedire questa mail?'))mlEsegui({azione:'reinvia',id:+b.dataset.id})});
}
