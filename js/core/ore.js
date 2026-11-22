/* Calcoli di orari, festività e riepilogo del turno (V00.10).
   Regole (indicazioni del servizio):
   - straordinario = durata degli interventi (a cavallo di mezzanotte: diviso sui due giorni);
   - ore di reperibilità del giorno = 24 − straordinario − ore ordinarie;
   - ore ordinarie: addetto 6 da lunedì a sabato; coordinatore/supervisore 6 lun-mer-ven, 9 mar-gio; 0 nei festivi;
   - variazione d'orario (es. «reperibile dalle 17:00»): ore = (24 − ora d'inizio) − straordinario.
   Gli importi in ore sono decimali a due cifre. Formato giorno: 'AAAA-MM-GG'. */
const minDa=s=>{const m=/^(\d{1,2}):([0-5]\d)$/.exec(String(s||'').trim());return m&&+m[1]<24?(+m[1])*60+(+m[2]):null};
const durMin=s=>{const m=/^(\d+):([0-5]\d)$/.exec(String(s||'').trim());return m?(+m[1])*60+(+m[2]):null};
const fmtHM=min=>`${Math.floor(min/60)}:${pad(min%60)}`;
const r2=x=>Math.round(x*100)/100;
const fmtOre=h=>(Math.round(h*100)/100).toFixed(2).replace('.',',');
const parseOre=s=>{const t=String(s).trim().replace(',','.');if(!/^\d+(\.\d+)?$/.test(t))return null;const x=parseFloat(t);return x>=0&&x<=24?r2(x):null};
const giornoN=g=>{const[y,m,d]=g.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/86400000)};
const isoDaN=n=>new Date(n*86400000).toISOString().slice(0,10);
const dowIso=g=>new Date(giornoN(g)*86400000).getUTCDay();   /* 0 = domenica */
const giorniTurno=(a,b)=>{const o=[];for(const d=new Date(a);d<=b;d.setDate(d.getDate()+1))o.push(iso(d));return o};

/* Festività nazionali (Pasquetta inclusa) più eventuali locali in CONFIG.festiviLocali (formato 'MM-GG', es. patrono). */
const _fest={};
function festivo(g){
  const y=+g.slice(0,4);
  if(!_fest[y]){
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),gg=Math.floor((b-f+1)/3),
      h=(19*a+b-d-gg+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
      mese=Math.floor((h+l-7*m+114)/31),giorno=((h+l-7*m+114)%31)+1;
    const pasquetta=isoDaN(Math.round(Date.UTC(y,mese-1,giorno+1)/86400000));
    _fest[y]=new Set(['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26',...(CONFIG.festiviLocali||[])].map(x=>`${y}-${x}`).concat(pasquetta));
  }
  return _fest[y].has(g);
}
function ordinarie(ruolo,g){
  const w=dowIso(g);if(w===0||festivo(g))return 0;
  if(ruolo==='A')return 6;
  return w===6?0:(w===2||w===4)?9:6;
}
/* Fascia di lavoro con flessibilità: {ini, fin, flex} in minuti, o null se non si lavora. */
function finestraLavoro(ruolo,g){
  const w=dowIso(g);if(w===0||festivo(g))return null;
  if(ruolo==='A')return{ini:450,fin:810,flex:45};
  if(w===6)return null;
  return{ini:450,fin:(w===2||w===4)?1020:810,flex:90};
}

/* Durata in minuti da ora chiamata a ora fine (se la fine è prima dell'inizio: giorno dopo). */
function durataAuto(ora,fine){const a=minDa(ora),b=minDa(fine);if(a===null||b===null)return null;let d=b-a;if(d<0)d+=1440;return d}
/* Intervalli validi del registro, in minuti assoluti; l'indice i è la posizione della riga. */
function intervalli(righe){
  return righe.map((r,i)=>{const o=minDa(r.ora),d=durMin(r.durata);
    if(!r.data||!/^\d{4}-\d\d-\d\d$/.test(r.data)||o===null||d===null)return null;
    const ini=giornoN(r.data)*1440+o;return{i,ini,fin:ini+d,dur:d}}).filter(Boolean);
}
/* Un intervallo diviso per giorno solare: [{g, a, b}] con a e b in minuti dalla mezzanotte. */
function spezza(v){
  const o=[];let x=v.ini;
  while(x<v.fin){const g=Math.floor(x/1440),y=Math.min(v.fin,(g+1)*1440);o.push({g:isoDaN(g),a:x-g*1440,b:y-g*1440});x=y}
  return o;
}
function straordinarioMin(righe){
  const m={};intervalli(righe).forEach(v=>spezza(v).forEach(s=>{m[s.g]=(m[s.g]||0)+(s.b-s.a)}));return m;
}

/* Posti occupati da una persona in un giorno (titolare non sostituito, oppure sostituto). */
function slotGiorno(p,k,n,g){
  const m=DATA[k];if(!m||!m.turni||!m.turni[n])return[];
  const suo=(id,nome)=>id?id===p.id:nome===p.n,sost=(m.var||[]).filter(v=>v.turno===n&&v.t==='sost'&&v.giorno===g),o=[];
  for(const[sl,s] of Object.entries(m.turni[n])){
    if(!s)continue;const sub=sost.find(v=>v.slot===sl);
    if(sub?suo(sub.entraId,sub.entra):suo(s.id,s.n))o.push(sl);
  }
  return o;
}
/* Ora d'inizio della reperibilità se c'è una variazione d'orario per i posti occupati, altrimenti null. */
function inizioReperibilita(k,n,g,slots){
  let best=null;
  for(const v of DATA[k].var||[])if(v.turno===n&&v.t==='orario'&&slots.includes(v.slot)){
    if(/feriali/i.test(v.testo||'')&&(dowIso(g)===0||festivo(g)))continue;
    const x=minDa(v.da);if(x!==null&&(best===null||x>best))best=x;
  }
  return best;
}
/* Riepilogo automatico: un elemento per giorno del turno. c={ruolo,p,k,n,a,b,righe} */
function riepilogoAuto(c){
  const str=straordinarioMin(c.righe);
  return giorniTurno(c.a,c.b).map(g=>{
    const sl=slotGiorno(c.p,c.k,c.n,g),sm=str[g]||0,ord=ordinarie(c.ruolo,g),da=sl.length?inizioReperibilita(c.k,c.n,g,sl):null;
    const rep=da!==null?Math.max(0,(1440-da)/60-sm/60):Math.max(0,24-sm/60-ord);
    return{g,inc:sl.length>0||sm>0,ord,da,rep:r2(rep),str:r2(sm/60)};
  });
}
/* Applica le correzioni manuali ov[g]={inc,rep,str} ai valori automatici. */
function riepilogoEffettivo(auto,ov){
  return auto.map(x=>{
    const o=(ov&&ov[x.g])||{};
    return{...x,inc:o.inc!==undefined?o.inc:x.inc,rep:o.rep!==undefined?o.rep:x.rep,str:o.str!==undefined?o.str:x.str,
      man:{inc:o.inc!==undefined,rep:o.rep!==undefined,str:o.str!==undefined}};
  });
}
const totaleOre=(eff,campo)=>r2(eff.filter(x=>x.inc).reduce((s,x)=>s+x[campo],0));
