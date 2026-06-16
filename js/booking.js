// Flujo de reserva de turnos para Estudio Pastore.
// Paso 1: datos del cliente → Paso 2: elegir día y horario → Paso 3: confirmación.
import { db } from "../firebase-config.js";
import {
  collection, getDocs, doc, addDoc, runTransaction, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);

// ── Estado ──────────────────────────────────────────────────────────────
let clienteData    = null;          // datos cargados en el paso 1
let availableByDate = {};           // { 'YYYY-MM-DD': [{id, time}, ...] }
let calCursor      = null;          // mes mostrado (primer día del mes)
let selectedDate   = null;          // 'YYYY-MM-DD' seleccionado

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const escMail = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function fmtFechaLarga(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return `${DIAS[dt.getDay()]} ${d} de ${MESES[m-1]} de ${y}`;
}

// ── Navegación entre pasos ──────────────────────────────────────────────
function goToStep(n){
  [1,2,3].forEach(i=>{
    const panel = document.querySelector(`[data-step="${i}"]`);
    if (panel) panel.hidden = (i !== n);
    const ind = document.querySelector(`[data-step-ind="${i}"]`);
    if (ind) ind.classList.toggle('is-active', i === n);
    if (ind) ind.classList.toggle('is-done', i < n);
  });
}

// ── Paso 1: formulario ──────────────────────────────────────────────────
$('reservaForm')?.addEventListener('submit', async e=>{
  e.preventDefault();
  clienteData = {
    nombre:   $('nombre')?.value.trim() || '',
    telefono: $('telefono')?.value.trim() || '',
    email:    $('email')?.value.trim() || '',
    area:     $('area')?.value || '',
    mensaje:  $('mensaje')?.value.trim() || '',
  };
  if (!clienteData.nombre || !clienteData.telefono || !clienteData.email) return;
  goToStep(2);
  await loadSlots();
});

$('reservaBack')?.addEventListener('click', ()=> goToStep(1));

// ── Paso 2: cargar turnos disponibles ───────────────────────────────────
async function loadSlots(){
  const help = $('reservaHelp');
  availableByDate = {};
  selectedDate = null;
  if ($('calTimes')) $('calTimes').hidden = true;
  if (help){ help.hidden = false; help.textContent = 'Cargando turnos disponibles…'; }

  try {
    const snap = await getDocs(collection(db, 'slots'));
    const today = new Date(); today.setHours(0,0,0,0);
    snap.docs.forEach(d=>{
      const s = d.data();
      if (s.status !== 'disponible' || !s.date || !s.time) return;
      const [y,m,day] = s.date.split('-').map(Number);
      const slotDate = new Date(y, m-1, day);
      if (slotDate < today) return; // no mostrar turnos pasados
      (availableByDate[s.date] = availableByDate[s.date] || []).push({ id: d.id, time: s.time });
    });
    Object.values(availableByDate).forEach(arr => arr.sort((a,b)=> a.time.localeCompare(b.time)));
  } catch(err){
    console.error('[booking] Error cargando turnos:', err);
    if (help){ help.hidden = false; help.textContent = 'No pudimos cargar los turnos en este momento. Escribinos y coordinamos por otro medio.'; }
    return;
  }

  const fechas = Object.keys(availableByDate).sort();
  if (!fechas.length){
    if (help){ help.hidden = false; help.textContent = 'Por el momento no hay turnos disponibles. Escribinos por WhatsApp y coordinamos una fecha a la brevedad.'; }
    $('calNav')?.setAttribute('hidden','');
    $('calWeekdays')?.setAttribute('hidden','');
    if ($('calDays')) $('calDays').innerHTML = '';
    return;
  }

  if (help) help.hidden = true;
  // Posicionar el calendario en el primer mes con turnos disponibles
  const [fy, fm] = fechas[0].split('-').map(Number);
  calCursor = new Date(fy, fm-1, 1);
  $('calNav')?.removeAttribute('hidden');
  $('calWeekdays')?.removeAttribute('hidden');
  renderWeekdays();
  renderCalendar();
}

function renderWeekdays(){
  const wd = $('calWeekdays');
  if (!wd) return;
  wd.innerHTML = DIAS.map(d=>`<span class="cal-weekday">${d}</span>`).join('');
}

function renderCalendar(){
  const grid = $('calDays');
  if (!grid || !calCursor) return;
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  $('calTitle').textContent = `${MESES[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  let cells = '';
  for (let i=0;i<firstDay;i++) cells += `<span class="cal-day empty"></span>`;
  for (let d=1; d<=daysInMonth; d++){
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const has = !!availableByDate[iso];
    const isSel = iso === selectedDate;
    const classes = ['cal-day'];
    if (has) classes.push('has-slots');
    if (isSel) classes.push('selected');
    if (!has) classes.push('disabled');
    cells += has
      ? `<button type="button" class="${classes.join(' ')}" data-date="${iso}">${d}<span class="cal-dot"></span></button>`
      : `<span class="${classes.join(' ')}">${d}</span>`;
  }
  grid.innerHTML = cells;

  grid.querySelectorAll('.cal-day[data-date]').forEach(btn=>{
    btn.addEventListener('click', ()=> selectDate(btn.dataset.date));
  });

  // Limitar navegación: deshabilitar "prev" si el mes mostrado es anterior al actual
  const prevBtn = $('calPrev');
  if (prevBtn){
    const firstOfMonth = new Date(year, month, 1);
    const curMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    prevBtn.disabled = firstOfMonth <= curMonth;
  }
}

$('calPrev')?.addEventListener('click', ()=>{
  if (!calCursor) return;
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()-1, 1);
  renderCalendar();
});
$('calNext')?.addEventListener('click', ()=>{
  if (!calCursor) return;
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()+1, 1);
  renderCalendar();
});

function selectDate(iso){
  selectedDate = iso;
  renderCalendar();
  const box = $('calTimes');
  const label = $('calTimesLabel');
  const list = $('calTimesList');
  if (!box || !list) return;
  box.hidden = false;
  if (label) label.textContent = `Horarios para el ${fmtFechaLarga(iso)}`;
  const slots = availableByDate[iso] || [];
  list.innerHTML = slots.map(s=>`<button type="button" class="cal-time-btn" data-slot="${s.id}" data-time="${s.time}">${s.time}</button>`).join('');
  list.querySelectorAll('.cal-time-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> confirmarReserva(btn.dataset.slot, iso, btn.dataset.time, btn));
  });
}

// ── Confirmar reserva (transacción) ─────────────────────────────────────
async function confirmarReserva(slotId, date, time, btn){
  if (!clienteData) { goToStep(1); return; }
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Reservando…';
  // deshabilitar el resto de los botones de horario
  $('calTimesList')?.querySelectorAll('.cal-time-btn').forEach(b=>{ if (b!==btn) b.disabled = true; });

  try {
    await runTransaction(db, async tx=>{
      const slotRef = doc(db, 'slots', slotId);
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists() || slotSnap.data().status !== 'disponible'){
        throw new Error('TURNO_NO_DISPONIBLE');
      }
      tx.update(slotRef, { status: 'reservado' });
    });

    // Crear la reserva con los datos del cliente
    await addDoc(collection(db, 'reservas'), {
      ...clienteData,
      slotId, date, time,
      status: 'pendiente',
      createdAt: serverTimestamp(),
    });

    await enviarEmails({ ...clienteData, date, time });

    mostrarConfirmacion(date, time);
  } catch(err){
    console.error('[booking] Error al reservar:', err);
    btn.disabled = false; btn.textContent = original;
    $('calTimesList')?.querySelectorAll('.cal-time-btn').forEach(b=> b.disabled = false);
    if (err.message === 'TURNO_NO_DISPONIBLE'){
      alert('Ese horario acaba de ser reservado por otra persona. Elegí otro, por favor.');
      await loadSlots();
    } else {
      alert('No pudimos completar la reserva. Intentá de nuevo en unos minutos.');
    }
  }
}

function mostrarConfirmacion(date, time){
  goToStep(3);
  const detail = $('reservaDoneDetail');
  if (detail){
    detail.innerHTML = `
      <div class="reserva-done-row"><span>Consulta con</span><strong>Dra. Ana Laura Pastore</strong></div>
      <div class="reserva-done-row"><span>Día</span><strong>${escMail(fmtFechaLarga(date))}</strong></div>
      <div class="reserva-done-row"><span>Hora</span><strong>${escMail(time)} hs</strong></div>`;
  }
}

// ── EmailJS: confirmación al cliente y aviso a Ana Laura ─────────────────
async function enviarEmails(data){
  try {
    const cfgSnap = await getDoc(doc(db, 'config', 'emailjs'));
    if (!cfgSnap.exists()) return;
    const cfg = cfgSnap.data();
    if (!cfg.serviceId || !cfg.publicKey || !window.emailjs) return;
    window.emailjs.init(cfg.publicKey);

    const params = {
      nombre:   escMail(data.nombre),
      telefono: escMail(data.telefono),
      email:    escMail(data.email),
      area:     escMail(data.area),
      mensaje:  escMail(data.mensaje),
      fecha:    escMail(fmtFechaLarga(data.date)),
      hora:     escMail(data.time),
    };

    // Mail al cliente
    if (cfg.templateClient){
      await window.emailjs.send(cfg.serviceId, cfg.templateClient, {
        ...params,
        to_email: data.email,
        to_name:  params.nombre,
      });
    }
    // Mail a la Dra. Ana Laura
    if (cfg.templateAdmin && cfg.adminEmail){
      await window.emailjs.send(cfg.serviceId, cfg.templateAdmin, {
        ...params,
        to_email: cfg.adminEmail,
      });
    }
  } catch(err){
    console.warn('[booking] EmailJS error:', err);
  }
}
