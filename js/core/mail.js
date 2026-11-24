/* Mail informative (V00.12): messaggi di esito per l'utente. L'invio vero lo fa la funzione server «invia-mail» (supabase/functions).
   Il risultato di Store.inviaMail(...) è: {ok, inviati, errori, prova, destinatari[], dettagli[], ripetuto?, nessunDestinatario?}
   oppure {ok:false, errore} (con nonDisponibile:true se l'archivio non invia mail, es. archivio locale). */
const Mail={
  /* Testo di esito: {ok:boolean, t:string} oppure null se non c'è nulla da dire. */
  esito(r){
    if(!r||r.nonDisponibile||r.nessunDestinatario)return null;
    const agg=Store&&Store.admin?' Si può rinviare da Amministrazione › Mail.':' Avvisa l’amministratore.';
    if(r.ripetuto)return{ok:true,t:'Avviso mail già inviato poco fa.'};
    if(!r.ok&&!r.dettagli)return{ok:false,t:'Avviso mail non inviato: '+(r.errore||'errore sconosciuto')+'.'+(r.rete?'':agg)};
    const n=r.inviati||0,e=r.errori||0,p=r.prova?` (modalità prova: recapitato a ${(r.destinatari&&r.destinatari[0])||'indirizzo di prova'})`:'';
    const av=r.avvertenze&&r.avvertenze.length?` Attenzione: ${r.avvertenze.join('; ')}.`:'';
    if(!e)return{ok:true,t:`Avviso mail inviato a ${n} ${n===1?'destinatario':'destinatari'}${p}.${av}`};
    return{ok:false,t:`Avviso mail: ${n} inviat${n===1?'a':'e'}, ${e} non riuscit${e===1?'a':'e'} (${(r.dettagli||[]).join('; ')}).${av}${agg}`};
  }
};
