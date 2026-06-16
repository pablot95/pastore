import { db, auth } from "../firebase-config.js";
import { collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = id => document.getElementById(id);

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function escHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function fmtFecha(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return `${DIAS[dt.getDay()]} ${d}/${String(m).padStart(2,'0')}/${y}`;
}
function fmtTs(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function toast(msg, type='info'){
  const tc=$('toastContainer'); if(!tc) return;
  const t=document.createElement('div'); t.className='toast '+type;
  t.innerHTML=`<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]||'ℹ️'}</span><span>${escHtml(msg)}</span>`;
  tc.appendChild(t);
  setTimeout(()=>{ t.style.animation='toastOut .3s ease forwards'; setTimeout(()=>t.remove(),300); },3000);
}

let hasUnsavedChanges=false;
function markDirty(){ hasUnsavedChanges=true; }
function clearDirty(){ hasUnsavedChanges=false; }
window.addEventListener('beforeunload',e=>{ if(hasUnsavedChanges){ e.preventDefault(); e.returnValue='¿Seguro que querés salir? Hay cambios sin guardar.'; }});

// ── Modal ───────────────────────────────────────────────────────────────
function openModal(title, content){
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=content;
  $('modalOverlay').classList.add('open');
}
function closeModal(){ $('modalOverlay').classList.remove('open'); clearDirty(); }
$('modalClose')?.addEventListener('click',()=>{
  if(hasUnsavedChanges && !confirm('¿Seguro que querés salir? Hay cambios sin guardar.')) return;
  closeModal();
});
$('modalOverlay')?.addEventListener('click',e=>{
  if(e.target===$('modalOverlay')){
    if(hasUnsavedChanges && !confirm('¿Seguro que querés salir? Hay cambios sin guardar.')) return;
    closeModal();
  }
});

// ── Auth gate ───────────────────────────────────────────────────────────
let currentUser=null;
onAuthStateChanged(auth, async user=>{
  currentUser=user;
  if(user){
    const adminSnap = await getDoc(doc(db,'admins', user.email));
    if(!adminSnap.exists()){
      await signOut(auth);
      const errEl=$('authError');
      if(errEl){ errEl.textContent='No tenés permisos de administrador.'; errEl.hidden=false; }
      return;
    }
    $('authScreen').hidden=true; $('adminApp').hidden=false;
    initAdmin();
  } else {
    $('authScreen').hidden=false; $('adminApp').hidden=true;
  }
});

$('loginBtn')?.addEventListener('click', async()=>{
  const email=$('authEmail').value.trim(), pass=$('authPass').value;
  const errEl=$('authError'); errEl.hidden=true;
  if(!email||!pass){ errEl.textContent='Completá todos los campos.'; errEl.hidden=false; return; }
  const btn=$('loginBtn'); btn.textContent='Ingresando…'; btn.disabled=true;
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    const msgs={
      'auth/invalid-credential':'Email o contraseña incorrectos.',
      'auth/user-not-found':'No existe una cuenta con ese email.',
      'auth/wrong-password':'Contraseña incorrecta.',
      'auth/too-many-requests':'Demasiados intentos. Esperá unos minutos.',
      'auth/network-request-failed':'Error de red. Verificá tu conexión.',
    };
    errEl.textContent = msgs[e.code] || `Error: ${e.code||e.message}`;
    errEl.hidden=false;
    btn.textContent='Ingresar'; btn.disabled=false;
  }
});
$('authPass')?.addEventListener('keydown',e=>{ if(e.key==='Enter')$('loginBtn')?.click(); });
$('logoutBtn')?.addEventListener('click',()=>signOut(auth));

// ── Tabs ────────────────────────────────────────────────────────────────
document.querySelectorAll('.snav-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.snav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    $('tab-'+btn.dataset.tab)?.classList.add('active');
    $('pageTitle').textContent=btn.dataset.label||btn.dataset.tab;
    if($('sidebar')?.classList.contains('open')) $('sidebar').classList.remove('open');
  });
});
$('menuToggle')?.addEventListener('click',()=>$('sidebar')?.classList.toggle('open'));

// ── Init ────────────────────────────────────────────────────────────────
let allSlots=[];
function initAdmin(){
  loadSlots();
  loadReservas();
  loadConfig();
}

// ── TURNOS ──────────────────────────────────────────────────────────────
async function loadSlots(){
  try{
    const snap=await getDocs(collection(db,'slots'));
    allSlots=snap.docs.map(d=>({id:d.id,...d.data()}));
    allSlots.sort((a,b)=> a.date===b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
    renderSlotsTable();
  }catch(e){ console.error('[loadSlots]',e); toast('Error al cargar turnos','error'); }
}

function renderSlotsTable(){
  const tbody=$('slotsTbody'); if(!tbody) return;
  if(!allSlots.length){
    tbody.innerHTML='<tr class="empty-row"><td colspan="4">Sin turnos cargados. Agregá los días y horarios disponibles.</td></tr>';
    return;
  }
  tbody.innerHTML=allSlots.map(s=>`<tr>
    <td><strong>${escHtml(fmtFecha(s.date))}</strong></td>
    <td>${escHtml(s.time)} hs</td>
    <td>${s.status==='reservado'
        ? '<span class="status-pill amber">Reservado</span>'
        : '<span class="status-pill green">Disponible</span>'}</td>
    <td><button class="btn-danger" data-del-slot="${s.id}">Eliminar</button></td>
  </tr>`).join('');
  tbody.querySelectorAll('[data-del-slot]').forEach(btn=>
    btn.addEventListener('click',()=>deleteSlot(btn.dataset.delSlot)));
}

async function deleteSlot(id){
  const slot=allSlots.find(s=>s.id===id);
  if(slot?.status==='reservado' && !confirm('Este turno está RESERVADO por un cliente. ¿Eliminarlo de todas formas?')) return;
  if(slot?.status!=='reservado' && !confirm('¿Eliminar este turno?')) return;
  try{
    await deleteDoc(doc(db,'slots',id));
    toast('Turno eliminado','success');
    await loadSlots();
  }catch(e){ console.error(e); toast('Error al eliminar','error'); }
}

// Estado del modal de alta de turnos
let _newDates=[];
let _newTimes=[];

$('newSlotBtn')?.addEventListener('click', openSlotModal);
function openSlotModal(){
  _newDates=[]; _newTimes=[];
  const todayIso=new Date().toISOString().slice(0,10);
  openModal('Agregar turnos', `
    <p class="modal-help">Elegí una o varias fechas y uno o varios horarios. Se creará un turno por cada combinación de fecha y hora.</p>
    <div class="form-group">
      <label>Fecha</label>
      <div class="inline-add">
        <input type="date" id="slotDateInput" min="${todayIso}" value="${todayIso}">
        <button type="button" class="btn-ghost-sm" id="addDateBtn">Agregar fecha</button>
      </div>
      <div class="chip-list" id="datesChips"></div>
    </div>
    <div class="form-group">
      <label>Horario</label>
      <div class="quick-times" id="quickTimes">
        ${['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'].map(t=>`<button type="button" class="qt-btn" data-qt="${t}">${t}</button>`).join('')}
      </div>
      <div class="inline-add" style="margin-top:.6rem">
        <input type="time" id="slotTimeInput" step="900">
        <button type="button" class="btn-ghost-sm" id="addTimeBtn">Agregar horario</button>
      </div>
      <div class="chip-list" id="timesChips"></div>
    </div>
    <div class="modal-summary" id="slotSummary">Elegí al menos una fecha y un horario.</div>
    <button class="btn-primary btn-full" id="saveSlotsBtn" style="margin-top:1rem">Crear turnos</button>
  `);

  const addDate=()=>{
    const v=$('slotDateInput')?.value;
    if(v && !_newDates.includes(v)){ _newDates.push(v); _newDates.sort(); markDirty(); renderDatesChips(); updateSlotSummary(); }
  };
  const addTime=()=>{
    const v=$('slotTimeInput')?.value;
    if(v && !_newTimes.includes(v)){ _newTimes.push(v); _newTimes.sort(); markDirty(); renderTimesChips(); updateSlotSummary(); }
  };
  $('addDateBtn')?.addEventListener('click', addDate);
  $('addTimeBtn')?.addEventListener('click', addTime);
  // Elegir una fecha/hora en el selector ya la agrega, sin obligar a tocar "Agregar".
  $('slotDateInput')?.addEventListener('change', addDate);
  $('slotTimeInput')?.addEventListener('change', addTime);
  // La fecha de hoy viene precargada en el input: la agregamos directamente.
  addDate();
  $('quickTimes')?.querySelectorAll('.qt-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.qt;
      if(_newTimes.includes(t)){ _newTimes=_newTimes.filter(x=>x!==t); }
      else { _newTimes.push(t); _newTimes.sort(); }
      markDirty(); renderTimesChips(); updateSlotSummary();
    });
  });
  $('saveSlotsBtn')?.addEventListener('click', crearTurnos);
}

function renderDatesChips(){
  const c=$('datesChips'); if(!c) return;
  c.innerHTML=_newDates.length
    ? _newDates.map(d=>`<span class="chip">${escHtml(fmtFecha(d))}<button type="button" data-rm-date="${d}">✕</button></span>`).join('')
    : '<span class="chip-empty">Sin fechas</span>';
  c.querySelectorAll('[data-rm-date]').forEach(b=>b.addEventListener('click',()=>{
    _newDates=_newDates.filter(x=>x!==b.dataset.rmDate); renderDatesChips(); updateSlotSummary();
  }));
}
function renderTimesChips(){
  const c=$('timesChips'); if(!c) return;
  c.innerHTML=_newTimes.length
    ? _newTimes.map(t=>`<span class="chip">${escHtml(t)}<button type="button" data-rm-time="${t}">✕</button></span>`).join('')
    : '<span class="chip-empty">Sin horarios</span>';
  c.querySelectorAll('[data-rm-time]').forEach(b=>b.addEventListener('click',()=>{
    _newTimes=_newTimes.filter(x=>x!==b.dataset.rmTime); renderTimesChips(); updateSlotSummary();
  }));
  $('quickTimes')?.querySelectorAll('.qt-btn').forEach(btn=>
    btn.classList.toggle('active', _newTimes.includes(btn.dataset.qt)));
}
function updateSlotSummary(){
  const el=$('slotSummary'); if(!el) return;
  const total=_newDates.length*_newTimes.length;
  el.textContent = total
    ? `Se ${total===1?'creará':'crearán'} ${total} turno${total===1?'':'s'}.`
    : 'Elegí al menos una fecha y un horario.';
}

async function crearTurnos(){
  const total=_newDates.length*_newTimes.length;
  if(!total){ toast('Elegí al menos una fecha y un horario','error'); return; }
  const btn=$('saveSlotsBtn'); btn.disabled=true; btn.textContent='Creando…';
  try{
    let creados=0, repetidos=0;
    for(const date of _newDates){
      for(const time of _newTimes){
        const exists=allSlots.some(s=>s.date===date && s.time===time);
        if(exists){ repetidos++; continue; }
        const id=`${date}_${time.replace(':','')}`;
        await setDoc(doc(db,'slots',id), { date, time, status:'disponible', createdAt:serverTimestamp() });
        creados++;
      }
    }
    clearDirty(); closeModal();
    toast(`${creados} turno${creados===1?'':'s'} creado${creados===1?'':'s'}${repetidos?` (${repetidos} ya existían)`:''}`,'success');
    await loadSlots();
  }catch(e){
    console.error('[crearTurnos]',e);
    toast('Error al crear turnos','error');
    btn.disabled=false; btn.textContent='Crear turnos';
  }
}

// ── RESERVAS ────────────────────────────────────────────────────────────
let allReservas=[];
async function loadReservas(){
  try{
    const snap=await getDocs(collection(db,'reservas'));
    allReservas=snap.docs.map(d=>({id:d.id,...d.data()}));
    allReservas.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.time||'').localeCompare(a.time||''));
    renderReservasTable();
  }catch(e){ console.error('[loadReservas]',e); toast('Error al cargar reservas','error'); }
}

function renderReservasTable(){
  const tbody=$('reservasTbody'); if(!tbody) return;
  if(!allReservas.length){
    tbody.innerHTML='<tr class="empty-row"><td colspan="6">Todavía no hay reservas.</td></tr>';
    return;
  }
  const estadoPill={
    pendiente:'<span class="status-pill amber">Pendiente</span>',
    confirmada:'<span class="status-pill green">Confirmada</span>',
    cancelada:'<span class="status-pill red">Cancelada</span>',
  };
  tbody.innerHTML=allReservas.map(r=>`<tr>
    <td><strong>${escHtml(fmtFecha(r.date))}</strong><br><span class="muted">${escHtml(r.time||'')} hs</span></td>
    <td>${escHtml(r.nombre||'')}</td>
    <td>
      <a href="tel:${escHtml(r.telefono||'')}">${escHtml(r.telefono||'')}</a><br>
      <a href="mailto:${escHtml(r.email||'')}" class="muted">${escHtml(r.email||'')}</a>
    </td>
    <td>${escHtml(r.area||'')}</td>
    <td>${estadoPill[r.status]||estadoPill.pendiente}</td>
    <td><button class="btn-ghost-sm" data-view-reserva="${r.id}">Ver</button></td>
  </tr>`).join('');
  tbody.querySelectorAll('[data-view-reserva]').forEach(btn=>
    btn.addEventListener('click',()=>openReservaModal(btn.dataset.viewReserva)));
}

function openReservaModal(id){
  const r=allReservas.find(x=>x.id===id); if(!r) return;
  openModal('Detalle de la reserva', `
    <div class="detalle-grid">
      <div class="detalle-row"><span>Día y hora</span><strong>${escHtml(fmtFecha(r.date))} · ${escHtml(r.time||'')} hs</strong></div>
      <div class="detalle-row"><span>Cliente</span><strong>${escHtml(r.nombre||'')}</strong></div>
      <div class="detalle-row"><span>Teléfono</span><strong><a href="tel:${escHtml(r.telefono||'')}">${escHtml(r.telefono||'')}</a></strong></div>
      <div class="detalle-row"><span>Email</span><strong><a href="mailto:${escHtml(r.email||'')}">${escHtml(r.email||'')}</a></strong></div>
      <div class="detalle-row"><span>Área</span><strong>${escHtml(r.area||'')}</strong></div>
      <div class="detalle-row"><span>Reservado el</span><strong>${escHtml(fmtTs(r.createdAt))}</strong></div>
    </div>
    <div class="detalle-mensaje">
      <span>Consulta</span>
      <p>${escHtml(r.mensaje||'—')}</p>
    </div>
    <div class="form-group" style="margin-top:1rem">
      <label>Estado de la reserva</label>
      <select id="reservaEstado">
        <option value="pendiente"${r.status==='pendiente'?' selected':''}>Pendiente</option>
        <option value="confirmada"${r.status==='confirmada'?' selected':''}>Confirmada</option>
        <option value="cancelada"${r.status==='cancelada'?' selected':''}>Cancelada</option>
      </select>
    </div>
    <div class="modal-btn-row">
      <button class="btn-primary" id="saveReservaBtn">Guardar estado</button>
      <button class="btn-danger" id="delReservaBtn">Eliminar reserva</button>
    </div>
    <p class="modal-help" style="margin-top:.6rem">Al cancelar o eliminar una reserva, el turno vuelve a quedar disponible en la web.</p>
  `);

  $('saveReservaBtn')?.addEventListener('click',async()=>{
    const estado=$('reservaEstado')?.value||'pendiente';
    try{
      await updateDoc(doc(db,'reservas',id),{ status:estado });
      if(estado==='cancelada' && r.slotId) await liberarSlot(r.slotId);
      toast('Reserva actualizada','success'); closeModal();
      await loadReservas(); await loadSlots();
    }catch(e){ console.error(e); toast('Error al guardar','error'); }
  });

  $('delReservaBtn')?.addEventListener('click',async()=>{
    if(!confirm('¿Eliminar esta reserva? El turno volverá a estar disponible.')) return;
    try{
      await deleteDoc(doc(db,'reservas',id));
      if(r.slotId) await liberarSlot(r.slotId);
      toast('Reserva eliminada','success'); closeModal();
      await loadReservas(); await loadSlots();
    }catch(e){ console.error(e); toast('Error al eliminar','error'); }
  });
}

async function liberarSlot(slotId){
  try{ await updateDoc(doc(db,'slots',slotId),{ status:'disponible' }); }
  catch(e){ console.warn('No se pudo liberar el turno:',e); }
}

// ── CONFIGURACIÓN ───────────────────────────────────────────────────────
async function loadConfig(){
  try{
    const snap=await getDoc(doc(db,'config','emailjs'));
    if(snap.exists()){
      const c=snap.data();
      if($('cfgEmailServiceId'))      $('cfgEmailServiceId').value=c.serviceId||'';
      if($('cfgEmailPublicKey'))      $('cfgEmailPublicKey').value=c.publicKey||'';
      if($('cfgEmailTemplateClient')) $('cfgEmailTemplateClient').value=c.templateClient||'';
      if($('cfgEmailTemplateAdmin'))  $('cfgEmailTemplateAdmin').value=c.templateAdmin||'';
      if($('cfgEmailAdminEmail'))     $('cfgEmailAdminEmail').value=c.adminEmail||'';
    }
  }catch(e){ console.error('[loadConfig]',e); }
}

$('saveEmailCfg')?.addEventListener('click',async()=>{
  try{
    await setDoc(doc(db,'config','emailjs'),{
      serviceId:      $('cfgEmailServiceId')?.value.trim()||'',
      publicKey:      $('cfgEmailPublicKey')?.value.trim()||'',
      templateClient: $('cfgEmailTemplateClient')?.value.trim()||'',
      templateAdmin:  $('cfgEmailTemplateAdmin')?.value.trim()||'',
      adminEmail:     $('cfgEmailAdminEmail')?.value.trim()||'',
    },{merge:true});
    toast('Configuración guardada','success');
  }catch(e){ console.error(e); toast('Error al guardar','error'); }
});
