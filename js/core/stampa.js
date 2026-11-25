/* STAMPA DEI REPORT (V00.10.1) — grafica approvata della V05.20.
   Il motore non conosce il database: riceve dati già pronti e restituisce l'HTML delle pagine.
   - Registro in A4 orizzontale, riepilogo in A4 verticale, intestazione con logo, firme, copertina del fascicolo.
   - Ore del riepilogo come minuti (interi) e stampate in formato h:mm, con totale somma dei minuti.
   - Le anomalie delle verifiche non compaiono mai nei report.
   Uso:  Stampa.stampa(Stampa.addetto({...}), Stampa.nomeFile('A',{...}))   (richiede LOGO, css/stampa.css) */
const ST_MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const ST_T1='Il sottoscritto dipendente dichiara sotto la propria responsabilità di aver prestato il Servizio di Reperibilità nei giorni e per le ore sotto indicate.';
const ST_T2='Dichiara altresì di aver svolto il Servizio di Reperibilità per il quale è previsto il riconoscimento del lavoro straordinario nei giorni e per le ore sotto indicate.';
/* Colonne dei registri e larghezze (%) come nella V05.20 */
const ST_COLS={
  A:['n° evento','Data','Ora chiamata','Soggetto richiedente','SP o SR','Km','Motivo della chiamata','Orario arrivo sul posto','Descrizione intervento effettuato','Ora fine intervento','Durata complessiva (h:mm)','Note'],
  C:['N° evento','Data','Ora chiamata','Soggetto richiedente','SP o SR','Km','Motivo della chiamata','Tipologia intervento','Addetti coinvolti','Orario arrivo sul posto (addetti o imprese)','Orario chiusura intervento','Imprese coinvolte','Sopralluogo diretto','Sopralluogo supervisore','Efficacia intervento','Impegno totale (diretto e/o da remoto) h:mm','Note'],
  S:['N° evento','Data','Ora chiamata','Soggetto richiedente','SP o SR','Km','Motivo della chiamata','Sopralluogo diretto (Sì/No)','Orario arrivo sul posto (solo se sopralluogo diretto)','Orario chiusura sopralluogo','Presenza coordinatore (Sì/No)','Descrizione intervento','Impegno totale (diretto e/o da remoto) h:mm','Note']
};
const ST_CG={
  C:[3.5,6,4.5,6.5,4.5,3.5,8,7.5,7.5,5.5,5.5,6.5,5.5,5.5,7,5.5,7.5],
  S:[3.5,6,4.5,8,5,3.5,11,6,7,6.5,6.5,17,6.5,9]
};
const ST_RUOLO={A:{mod:'ADDETTO',reg:'Registro dell’addetto',pref:'REP'},C:{mod:'COORDINATORE',reg:'Registro del coordinatore',pref:'REP_COORD'},S:{mod:'SUPERVISORE',reg:'Registro del supervisore',pref:'REP_SUP'}};

const stHm=m=>(m<0?'-':'')+Math.floor(Math.abs(m)/60)+':'+pad(Math.abs(m)%60);
const stRev=v=>String(v||0).padStart(2,'0');
/* "Cognome Nome" → "Nome Cognome" (firma in corsivo). Se la persona ha i campi nome/cognome separati si usano quelli;
   altrimenti l'ultima parola è il nome (limite noto: nomi composti). */
function stNomeCognome(n,p){
  if(p&&p.nome&&p.cognome)return p.nome+' '+p.cognome;
  const t=String(n||'').trim().split(/\s+/);return t.length<2?String(n||''):t[t.length-1]+' '+t.slice(0,-1).join(' ');
}
function stCognome(n,p){
  const c=p&&p.cognome?p.cognome:String(n||'').trim().split(/\s+/).slice(0,-1).join(' ')||String(n||'');
  return c.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
const stHead=(Dx,L)=>`<div class="st-hd"><img src="${LOGO}" alt=""><p class="a">PROVINCIA DI PISA</p><p class="b">SETTORE VIABILITÀ, TRASPORTI E PROTEZIONE CIVILE</p><p class="c">SERVIZIO DI REPERIBILITÀ ORARIA SVOLTO NEL MESE DI ${ST_MESI[+Dx.mese-1].toUpperCase()} ANNO ${Dx.anno}</p><p class="d">MODELLO ${ST_RUOLO[L].mod} · rev ${stRev(Dx.rev)}</p></div>`;
const stT1=n=>ST_T1.replace('dipendente','dipendente <b>'+esc(n)+'</b>');

function stTabRegistro(L,righe){
  const cols=ST_COLS[L],cg=ST_CG[L]?'<colgroup>'+ST_CG[L].map(w=>`<col style="width:${w}%">`).join('')+'</colgroup>':'';
  const corpo=righe&&righe.length?righe.map(r=>`<tr>${cols.map((_,i)=>`<td>${esc(r[i]==null?'':r[i])}</td>`).join('')}</tr>`).join('')
    :`<tr><td colspan="${cols.length}" class="vuoto">Nessun intervento</td></tr>`;
  return `<table class="st-pt${ST_CG[L]?' st-pc':''}">${cg}<thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table>`;
}
/* rows: [[etichetta giorno 'gg/mm/aaaa', minuti]]; tot: minuti */
const stTabRiep=(nome,rows,tot,rett)=>`<table class="st-rt2"><thead><tr><th>NOMINATIVO DIPENDENTE</th><th>GIORNI</th><th>ORE</th></tr></thead><tbody>${rows.map((r,i)=>`<tr>${i===0?`<td class="nm" rowspan="${rows.length+1}">${esc(nome)}</td>`:''}<td class="dt">${esc(r[0])}</td><td class="dt">${stHm(r[1])}</td></tr>`).join('')}<tr class="tot"><td>TOTALE ORE</td><td>${stHm(rett!=null?rett:tot)}${rett!=null?'*':''}</td></tr></tbody></table>`;
/* Nota sulla rettifica del supervisore (V00.14.2): t={rep,str,repOrig,strOrig,motivo,chi,il} */
const stNotaRett=t=>{if(!t||(t.rep==null&&t.str==null))return '';const p=[];
  if(t.rep!=null)p.push(`reperibilità: calcolato ${stHm(t.repOrig)}, rettificato ${stHm(t.rep)}`);
  if(t.str!=null)p.push(`straordinario: calcolato ${stHm(t.strOrig)}, rettificato ${stHm(t.str)}`);
  return `<p class="st-rn">* Totali rettificati dal supervisore${t.chi?' '+esc(t.chi):''}${t.il?' il '+esc(t.il):''} (${p.join('; ')}). Motivazione: ${esc(t.motivo)}</p>`};
/* corsivo: firma in corsivo (nome e cognome); visto: data 'gg/mm/aaaa' di approvazione */
const stFirma=(etichetta,n,corsivo,visto,p)=>`<div>${etichetta}</div><div><b>${esc(n||'')}</b></div><div class="fi">Firma<i>${corsivo&&n?`<b class="sig">${esc(stNomeCognome(n,p))}</b>`:''}</i>${visto?`<span class="vi">visto il ${esc(visto)}</span>`:''}</div>`;

const Stampa={
  /* o = { D:{anno,mese,rev}, nome, persona?, coordinatore, supervisore, da, a, righe:[[12 celle]],
           rep:{rows,tot}, str:{rows,tot}, vistoC?, vistoS? } */
  addetto(o){
    return `<section class="st-pp st-p2">${stHead(o.D,'A')}<p class="st-rp">${stT1(o.nome)}</p>${stTabRiep(o.nome,o.rep.rows,o.rep.tot,o.rett&&o.rett.rep)}<p class="st-rp">${ST_T2}</p>${stTabRiep(o.nome,o.str.rows,o.str.tot,o.rett&&o.rett.str)}${stNotaRett(o.rett)}`
     +`<div class="st-sg">${stFirma('L’ADDETTO',o.nome,true,null,o.persona)}${stFirma('IL COORDINATORE',o.coordinatore,!!o.vistoC,o.vistoC)}${stFirma('IL SUPERVISORE',o.supervisore,!!o.vistoS,o.vistoS)}</div></section>`
     +`<section class="st-pp st-p1">${stHead(o.D,'A')}<p class="st-pm"><b>${ST_RUOLO.A.reg}</b> · ${esc(o.nome)} · turno dal ${esc(o.da)} al ${esc(o.a)}</p>${stTabRegistro('A',o.righe)}</section>`;
  },
  /* righe: [[17 celle]] */
  coordinatore(o){
    return `<section class="st-pp st-p2">${stHead(o.D,'C')}<p class="st-rp">${stT1(o.nome)}</p>${stTabRiep(o.nome,o.rep.rows,o.rep.tot,o.rett&&o.rett.rep)}<p class="st-rp">${ST_T2}</p>${stTabRiep(o.nome,o.str.rows,o.str.tot,o.rett&&o.rett.str)}${stNotaRett(o.rett)}`
     +`<div class="st-sg">${stFirma('IL COORDINATORE',o.nome,true,null,o.persona)}${stFirma('IL SUPERVISORE',o.supervisore,!!o.vistoS,o.vistoS)}</div></section>`
     +`<section class="st-pp st-p1">${stHead(o.D,'C')}<p class="st-pm"><b>${ST_RUOLO.C.reg}</b> · ${esc(o.nome)} · turno dal ${esc(o.da)} al ${esc(o.a)}</p>${stTabRegistro('C',o.righe)}</section>`;
  },
  /* righe: [[14 celle]]; dirigente: nome del dirigente (firma senza corsivo) */
  supervisore(o){
    return `<section class="st-pp st-p2">${stHead(o.D,'S')}<p class="st-rp">${stT1(o.nome)}</p>${stTabRiep(o.nome,o.rep.rows,o.rep.tot)}<p class="st-rp">${ST_T2}</p>${stTabRiep(o.nome,o.str.rows,o.str.tot)}`
     +`<div class="st-sg">${stFirma('IL SUPERVISORE',o.nome,true,null,o.persona)}${stFirma('IL DIRIGENTE',o.dirigente)}</div></section>`
     +`<section class="st-pp st-p1">${stHead(o.D,'S')}<p class="st-pm"><b>${ST_RUOLO.S.reg}</b> · ${esc(o.nome)} · turno dal ${esc(o.da)} al ${esc(o.a)}</p>${stTabRegistro('S',o.righe)}</section>`;
  },
  /* Copertina del fascicolo completo: o={da,a,supervisore,coordinatore,dirigente,addetti:[nomi], tabella?:[{ruolo,nome,rep,str,rr?,rs?}]}
     Con «tabella» (V00.14.1) la composizione del turno è una tabella con i totali di ciascuno (minuti; rep/str null = registro non inviato → «—»;
     nessuna riga di somma, V00.15.1) e in fondo lo spazio per la firma olografa del dirigente;
     senza, resta l'elenco dei nomi. */
  copertina(o){
    const ad=(o.addetti||[]).filter(Boolean),T=o.tabella;
    const testa=`<p class="a">PROVINCIA DI PISA</p><p class="b">SETTORE VIABILITÀ, TRASPORTI E PROTEZIONE CIVILE</p><img src="${LOGO}" alt="">`
     +`<p class="c">SERVIZIO DI REPERIBILITÀ</p><p class="d">Turno dalle ore 00:00 del <b>${esc(o.da)}</b> alle ore 23:59:59 del <b>${esc(o.a)}</b></p><div class="rl"></div>`;
    if(T&&T.length){
      const hm=v=>v==null?'—':stHm(v),ha=r=>r.rep!=null&&r.str!=null,rt=r=>r.rr||r.rs;
      return `<section class="st-pp st-p2 st-cv st-cvt">${testa}<table class="st-cp"><thead><tr><th>Ruolo</th><th>Nominativo</th><th>Ore reperibilità</th><th>Ore straordinario</th><th>Totale ore</th></tr></thead><tbody>`
       +T.map(r=>`<tr><td class="ru">${esc(r.ruolo)}</td><td class="nm">${esc(r.nome||'—')}</td><td>${hm(r.rep)}${r.rr?'*':''}</td><td>${hm(r.str)}${r.rs?'*':''}</td><td>${ha(r)?stHm(r.rep+r.str)+(rt(r)?'*':''):'—'}</td></tr>`).join('')
       +`</tbody></table>${T.some(rt)?'<p class="st-cpn">* Valore rettificato dal supervisore (motivazione nel report della persona).</p>':''}<div class="st-sg st-cfm">${stFirma('IL DIRIGENTE',o.dirigente)}</div></section>`;
    }
    return `<section class="st-pp st-p2 st-cv">${testa}`
     +`<div class="el"><div class="r">Supervisore</div><div class="n">${esc(o.supervisore||'—')}</div><div class="r">Coordinatore</div><div class="n">${esc(o.coordinatore||'—')}</div>`
     +`<div class="r">${ad.length===1?'Addetto':'Addetti'}</div><div class="n">${ad.length?ad.map(esc).join('<br>'):'—'}</div></div></section>`;
  },
  /* Nome del file (e titolo proposto da "Salva come PDF"), come nella V05.20:
     REP_11_19-24_Cognome_rev02 · REP_COORD_… · REP_SUP_…[_completo] */
  nomeFile(L,{k,n,a,b,nome,persona,rev,completo}){
    const m=k.split('-')[1];
    return `${ST_RUOLO[L].pref}_${m}_${pad(a.getDate())}-${pad(b.getDate())}_${stCognome(nome,persona)}_rev${stRev(rev)}${completo?'_completo':''}`;
  },
  /* Apre la finestra di stampa con le pagine indicate; il titolo del documento diventa il nome del file proposto. */
  async stampa(html,nomeFile){
    let p=$('#print');if(!p){p=document.createElement('div');p.id='print';document.body.appendChild(p)}
    p.innerHTML=html;document.body.classList.add('stampa');
    try{await document.fonts.load('500 19pt Caveat','Aa')}catch(e){}
    await Promise.all([...p.querySelectorAll('img')].map(i=>i.decode?i.decode().catch(()=>{}):0));
    const old=document.title;document.title=nomeFile;
    addEventListener('afterprint',()=>{document.title=old;document.body.classList.remove('stampa');p.innerHTML=''},{once:true});
    window.print();
  }
};
