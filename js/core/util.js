/* Utilità comuni a tutti i moduli */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const it=d=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
const WD=['dom','lun','mar','mer','gio','ven','sab'];
const ICON='<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
const call=n=>`<a class="call" href="tel:${n.replace(/[^\d+]/g,'')}">${ICON}${esc(n)}</a>`;
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
function turnoDi(d){const day=d.getDate();return Math.min(5,Math.ceil(day/6))}
function range(d){const n=turnoDi(d),y=d.getFullYear(),m=d.getMonth();
  const last=new Date(y,m+1,0).getDate();return{n,a:new Date(y,m,(n-1)*6+1),b:new Date(y,m,n===5?last:n*6)}}
const clone=o=>JSON.parse(JSON.stringify(o));
const Moduli={};
