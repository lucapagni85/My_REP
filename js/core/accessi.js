/* Accessi (V00.09): chi è l'utente, quali schede vede, in quali turni compare.
   Una scheda è visibile se la persona collegata all'account:
   - ha quel ruolo principale in anagrafica (r), oppure
   - ha quel ruolo tra quelli aggiuntivi (ra, impostati dall'admin: es. coordinatore che fa anche il supervisore), oppure
   - è vice coordinatore nel turno in corso o nel precedente: vede in automatico anche Coordinatore e Addetto.
   L'amministratore (e l'archivio locale di prova) vede tutte le schede. */
const personaMia=()=>Store&&Store.utente&&Store.utente.personaId?ANAG.find(p=>p.id===Store.utente.personaId)||null:null;
const tuttiAdmin=()=>!Store.richiedeLogin||!!Store.admin;

function turnoRef(d){const r=range(d);return{k:iso(d).slice(0,7),n:r.n,a:r.a,b:r.b}}
/* Turno in corso e turno precedente (può stare nel mese prima). */
function turniRecenti(oggi=new Date()){
  const c=turnoRef(oggi);
  return[c,turnoRef(new Date(c.a.getFullYear(),c.a.getMonth(),c.a.getDate()-1))];
}
/* Posti occupati da una persona in un turno: titolare oppure sostituto in qualche giorno. */
function slotsDi(p,k,n){
  const m=DATA[k];if(!m||!m.turni||!m.turni[n])return[];
  const suo=(id,nome)=>id?id===p.id:nome===p.n;
  const out=Object.entries(m.turni[n]).filter(([,s])=>s&&suo(s.id,s.n)).map(([sl])=>sl);
  (m.var||[]).filter(v=>v.turno===n&&v.t==='sost'&&suo(v.entraId,v.entra)).forEach(v=>{if(!out.includes(v.slot))out.push(v.slot)});
  return out;
}
/* Schede abilitate per una persona: {A|C|S: motivo} */
function ruoliAbilitati(p,oggi=new Date()){
  const out={};
  if(p.r)out[p.r]='ruolo principale';
  (p.ra||[]).forEach(x=>{if(!out[x])out[x]='abilitazione aggiuntiva'});
  for(const t of turniRecenti(oggi))if(slotsDi(p,t.k,t.n).includes('VICE')){
    const m=`vice coordinatore nel ${t.n}° turno di ${nomeMese(t.k)}`;
    if(!out.C)out.C=m;if(!out.A)out.A=m;
  }
  return out;
}
/* Schede visibili all'utente collegato: {A|C|S: motivo}; vuoto se l'account non è collegato. */
function schedeVisibili(oggi=new Date()){
  if(tuttiAdmin())return{A:'amministratore',C:'amministratore',S:'amministratore'};
  const p=personaMia();return p?ruoliAbilitati(p,oggi):{};
}
