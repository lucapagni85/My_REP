/* Verifiche di compatibilità del registro (V00.10). Non bloccanti: producono solo avvisi a schermo,
   che non vengono salvati né riportati nei report.
   Livelli: 'x' = anomalia, 'l' = da verificare (più leggero). */
function verificaRegistro(ruolo,c){   /* c={righe, a, b} con a e b Date di inizio e fine turno */
  const out=[],add=(lv,riga,t)=>out.push({lv,riga,t}),A=iso(c.a),B=iso(c.b),C=ruolo!=='A',S=ruolo==='S';   /* C: la durata è l'impegno totale (anche da remoto), non chiamata→fine */
  c.righe.forEach((r,i)=>{
    const n=i+1,o=minDa(r.ora),f=minDa(r.fine);
    if(!r.data)add('x',n,'manca la data');
    else if(r.data<A||r.data>B)add('x',n,`la data ${it(parse(r.data))} è fuori dal turno (dal ${it(c.a)} al ${it(c.b)})`);
    if(o===null)add('x',n,'manca l’ora di chiamata');
    if(f===null&&!(S&&r.sopr!=='Sì'))add(C?'l':'x',n,S?'manca l’orario di chiusura del sopralluogo':C?'manca l’orario di chiusura dell’intervento':'manca l’ora di fine intervento');
    if(S){                                           /* supervisore: arrivo e chiusura solo con sopralluogo diretto */
      if(r.sopr!=='Sì'&&r.sopr!=='No')add('l',n,'indicare se il sopralluogo è stato diretto (Sì/No)');
      if(r.sopr==='Sì'&&minDa(r.arrivo)===null)add('l',n,'sopralluogo diretto: manca l’orario di arrivo sul posto');
      if(r.sopr==='No'&&(r.arrivo||r.fine))add('l',n,'arrivo e/o chiusura indicati, ma il sopralluogo non è diretto');
      if(r.presCoo!=='Sì'&&r.presCoo!=='No')add('l',n,'indicare se era presente il coordinatore (Sì/No)');
    }
    if(C&&o!==null&&durMin(r.durata)===null)add('x',n,'manca l’impegno totale');
    if(o!==null&&f!==null){
      const auto=durataAuto(r.ora,r.fine),d=durMin(r.durata);
      if(d===null){if(!C)add('x',n,'manca la durata dell’intervento')}
      else if(!C&&Math.abs(d-auto)>1)add('x',n,`la durata indicata (${r.durata}) non corrisponde a chiamata e fine (${fmtHM(auto)})`);
      const ar=minDa(r.arrivo);
      if(ar!==null){let x=ar-o;if(x<0)x+=1440;if(x>auto)add('x',n,'l’orario di arrivo sul posto non è compreso tra chiamata e fine')}
    }
  });
  const iv=intervalli(c.righe);
  iv.forEach(v=>{
    let forte=null,lieve=false;
    for(const s of spezza(v)){
      const w=finestraLavoro(ruolo,s.g);if(!w)continue;
      const c0=w.ini+w.flex,c1=w.fin,tocca=(x,y)=>s.a<y&&s.b>x;
      if(tocca(c0,c1))forte=[c0,c1];
      else if(tocca(w.ini,c0)||tocca(w.fin,w.fin+w.flex))lieve=true;
    }
    if(forte)add('x',v.i+1,`l’intervento cade nell’orario di lavoro (${fmtHM(forte[0])}–${fmtHM(forte[1])}): non risulta fuori orario`);
    else if(lieve)add('l',v.i+1,'da verificare: l’intervento tocca la fascia di flessibilità dell’orario di lavoro');
  });
  let prec=null;
  [...iv].sort((p,q)=>p.ini-q.ini).forEach(v=>{
    if(prec&&v.ini<prec.fin)add(C?'l':'x',v.i+1,C?`si sovrappone all’evento n° ${prec.i+1}: l’impegno totale potrebbe essere contato due volte nello straordinario`:`si sovrappone all’evento n° ${prec.i+1} (gli interventi possono essere consecutivi, non sovrapposti)`);
    if(!prec||v.fin>prec.fin)prec=v;
  });
  return out.sort((p,q)=>p.riga-q.riga||(p.lv<q.lv?-1:1));
}

/* ---------- Verifiche incrociate coordinatore ↔ addetti (V00.13.2) ----------
   righeC: righe del registro del coordinatore; addetti: [{id, n, reg: {righe, rev, inviatoRev} | null}] (reg = registro dell'addetto, se esiste).
   Tolleranza di ±15 minuti su chiamata, arrivo e fine. Livelli: 'x' anomalia, 'l' da verificare. riga=0: avviso non legato a un evento.
   Restituisce [{lv, riga, chi, t}]. Non bloccante, non resta scritto nei report. */
const TOLL_INCR=15;
function verificaIncrociata(righeC,addetti){
  const out=[],add=(lv,riga,chi,t)=>out.push({lv,riga,chi,t});
  const gi=d=>{const[y,m,g]=String(d).split('-').map(Number);return Math.round(Date.UTC(y,m-1,g)/86400000)};
  const dt=(d,h)=>{const m=minDa(h);return d&&m!==null?gi(d)*1440+m:null};
  const dm=(a,b)=>{const d=Math.abs(a-b)%1440;return Math.min(d,1440-d)};      /* distanza tra due orari, a cavallo di mezzanotte */
  const regOk=a=>a.reg&&a.reg.inviatoRev!==null&&a.reg.inviatoRev!==undefined;
  const usati=new Set(),coinv=(r,a)=>(r.addetti||[]).some(x=>x.id?x.id===a.id:x.n===a.n);
  const dmy=d=>it(parse(d));
  addetti.forEach(a=>{if(regOk(a)&&a.reg.rev>a.reg.inviatoRev)add('l',0,a.n,`ha salvato modifiche dopo l’invio (rev ${pad(a.reg.rev)}, inviata la ${pad(a.reg.inviatoRev)}): il confronto usa la versione più recente`)});
  righeC.forEach((r,i)=>{
    const n=i+1,tc=dt(r.data,r.ora);if(tc===null)return;                        /* data e ora mancanti: già segnalate dalle verifiche proprie */
    for(const co of r.addetti||[]){
      const ai=addetti.findIndex(a=>co.id?a.id===co.id:a.n===co.n);
      if(ai<0){add('l',n,co.n,'non risulta tra gli addetti del turno');continue}
      const a=addetti[ai];
      if(!regOk(a)){add('l',n,a.n,'è indicato come coinvolto ma non ha ancora inviato il registro');continue}
      let best=-1,bd=1e9;
      a.reg.righe.forEach((q,j)=>{const tq=dt(q.data,q.ora);if(tq===null||usati.has(ai+':'+j))return;const d=Math.abs(tq-tc);if(d<=TOLL_INCR&&d<bd){best=j;bd=d}});
      if(best<0){
        const stessi=a.reg.righe.filter(q=>q.data===r.data&&minDa(q.ora)!==null).map(q=>q.ora);
        add('x',n,a.n,`nessun intervento corrispondente nel suo registro (stessa data, chiamata entro ±${TOLL_INCR} minuti)${stessi.length?`; quel giorno ha registrato chiamate alle ${stessi.join(', ')}`:'; quel giorno non ha registrato interventi'}`);
        continue;
      }
      usati.add(ai+':'+best);const q=a.reg.righe[best];
      for(const[k,lab]of[['arrivo','arrivo sul posto'],['fine','fine intervento']]){
        const x=minDa(r[k]),y=minDa(q[k]);
        if(x!==null&&y!==null&&dm(x,y)>TOLL_INCR)add('l',n,a.n,`${lab}: coordinatore ${r[k]}, addetto ${q[k]} (differenza oltre ±${TOLL_INCR} minuti)`);
      }
    }
  });
  /* interventi degli addetti che il coordinatore non ha registrato (o in cui l'addetto non risulta coinvolto) */
  addetti.forEach((a,ai)=>{
    if(!regOk(a))return;
    a.reg.righe.forEach((q,j)=>{
      if(usati.has(ai+':'+j))return;const tq=dt(q.data,q.ora);if(tq===null)return;
      const i=righeC.findIndex(r=>{const tc=dt(r.data,r.ora);return tc!==null&&Math.abs(tc-tq)<=TOLL_INCR});
      const quando=`${dmy(q.data)} alle ${q.ora}`;
      if(i<0)add('l',0,a.n,`intervento del ${quando} non risulta tra gli eventi del coordinatore`);
      else if(!coinv(righeC[i],a))add('l',i+1,a.n,`ha registrato un intervento del ${quando} che corrisponde a questo evento, ma non è tra gli addetti coinvolti`);
    });
  });
  return out;
}

/* ---------- Verifiche incrociate supervisore ↔ coordinatore (V00.14) ----------
   righeS: righe del registro del supervisore; coord: [{n, reg:{righe,rev,inviatoRev}|null}] (un elemento per coordinatore/sostituto del turno).
   Si confrontano chiamata (±15 minuti), sopralluogo del supervisore e presenza del coordinatore; arrivo e chiusura non si confrontano
   perché nel registro del coordinatore descrivono addetti e imprese. [{lv,riga,chi,t}], non bloccante. */
function verificaIncrociataSC(righeS,coord){
  const out=[],add=(lv,riga,chi,t)=>out.push({lv,riga,chi,t});
  const gi=d=>{const[y,m,g]=String(d).split('-').map(Number);return Math.round(Date.UTC(y,m-1,g)/86400000)};
  const dt=(d,h)=>{const m=minDa(h);return d&&m!==null?gi(d)*1440+m:null};
  if(!coord.length){add('l',0,'Coordinatore','nel turno non è indicato il coordinatore: confronto non possibile');return out}
  const inviati=coord.filter(c=>c.reg&&c.reg.inviatoRev!==null&&c.reg.inviatoRev!==undefined);
  if(!inviati.length){add('l',0,coord.map(c=>c.n).join(', '),'non ha ancora inviato il registro: il confronto non è possibile');return out}
  inviati.forEach(c=>{if(c.reg.rev>c.reg.inviatoRev)add('l',0,c.n,`ha salvato modifiche dopo l’invio (rev ${pad(c.reg.rev)}, inviata la ${pad(c.reg.inviatoRev)}): il confronto usa la versione più recente`)});
  const evC=[];inviati.forEach(c=>c.reg.righe.forEach(q=>{const t=dt(q.data,q.ora);if(t!==null)evC.push({q,t,chi:c.n,usato:false})}));
  righeS.forEach((r,i)=>{
    const n=i+1,t=dt(r.data,r.ora);if(t===null)return;
    let best=null;evC.forEach(e=>{const d=Math.abs(e.t-t);if(d<=TOLL_INCR&&(!best||d<best.d))best={e,d}});
    if(!best){add('x',n,'Coordinatore',`nessun evento corrispondente nel suo registro (stessa data, chiamata entro ±${TOLL_INCR} minuti)`);return}
    best.e.usato=true;const q=best.e.q;
    if(q.soprSup!=='Sì')add('l',n,best.e.chi,'nel suo registro questo evento non ha «Sopralluogo supervisore» = Sì');
    if(r.presCoo==='Sì'&&q.sopr!=='Sì')add('l',n,best.e.chi,'indichi la presenza del coordinatore, ma lui non risulta aver fatto sopralluogo diretto in questo evento');
  });
  evC.forEach(e=>{if(!e.usato&&e.q.soprSup==='Sì')add('l',0,e.chi,`evento del ${it(parse(e.q.data))} alle ${e.q.ora} con sopralluogo del supervisore: non risulta nel tuo registro`)});
  return out;
}
