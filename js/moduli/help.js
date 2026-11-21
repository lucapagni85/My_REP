/* Scheda HELP (V00.09): guida rapida e documenti scaricabili.
   I documenti si elencano in CONFIG.documenti = [{titolo, descrizione, file}] e i file stanno nella cartella documenti/. */
Moduli.help={id:'help',titolo:'Help',monta(el){
  const doc=(CONFIG.documenti||[]);
  el.innerHTML=`<div class="panel"><div class="banner"><div><small>Aiuto</small><h2>Help e documenti</h2></div></div>
    <div class="sec" style="margin-top:0"><h3>Come si usa</h3>
      <ul class="vn" style="font-size:.95rem">
        <li><b>Turni</b>: chi è reperibile oggi e l'archivio dei turni, con i numeri da chiamare.</li>
        <li><b>Addetto, Coordinatore, Supervisore</b>: compaiono solo le schede che puoi usare. Se non ne vedi nessuna, il tuo account non è ancora collegato a una persona dell'anagrafica: rivolgiti all'amministratore.</li>
        <li><b>Senza connessione</b> l'app mostra l'ultimo turno scaricato, in sola lettura.</li>
      </ul></div>
    <div class="sec"><h3>Documenti</h3>${doc.length
      ?`<div class="grid2">${doc.map(d=>`<a class="box" href="documenti/${encodeURIComponent(d.file)}" download style="text-decoration:none;color:inherit"><b>${esc(d.titolo)}</b>${d.descrizione?`<span>${esc(d.descrizione)}</span>`:''}</a>`).join('')}</div>`
      :'<p style="color:var(--muted);margin:0">Nessun documento disponibile al momento. Manuali e regolamento verranno aggiunti qui.</p>'}</div></div>`;
}};
