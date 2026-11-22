/* Verifiche di compatibilità del registro (V00.10). Non bloccanti: producono solo avvisi a schermo,
   che non vengono salvati né riportati nei report.
   Livelli: 'x' = anomalia, 'l' = da verificare (più leggero). */
function verificaRegistro(ruolo,c){   /* c={righe, a, b} con a e b Date di inizio e fine turno */
  const out=[],add=(lv,riga,t)=>out.push({lv,riga,t}),A=iso(c.a),B=iso(c.b);
  c.righe.forEach((r,i)=>{
    const n=i+1,o=minDa(r.ora),f=minDa(r.fine);
    if(!r.data)add('x',n,'manca la data');
    else if(r.data<A||r.data>B)add('x',n,`la data ${it(parse(r.data))} è fuori dal turno (dal ${it(c.a)} al ${it(c.b)})`);
    if(o===null)add('x',n,'manca l’ora di chiamata');
    if(f===null)add('x',n,'manca l’ora di fine intervento');
    if(o!==null&&f!==null){
      const auto=durataAuto(r.ora,r.fine),d=durMin(r.durata);
      if(d===null)add('x',n,'manca la durata dell’intervento');
      else if(Math.abs(d-auto)>1)add('x',n,`la durata indicata (${r.durata}) non corrisponde a chiamata e fine (${fmtHM(auto)})`);
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
    if(prec&&v.ini<prec.fin)add('x',v.i+1,`si sovrappone all’evento n° ${prec.i+1} (gli interventi possono essere consecutivi, non sovrapposti)`);
    if(!prec||v.fin>prec.fin)prec=v;
  });
  return out.sort((p,q)=>p.riga-q.riga||(p.lv<q.lv?-1:1));
}
