const $ = (id) => document.getElementById(id);
const bConfirmar = $('btn-confirmar');
const bCancelar = $('btn-cancelar');
const obs = $('observacion');
const aFecha = $('a-fecha'), aHora = $('a-hora'), aEstado = $('a-estado');
let tarde = false, nombreEst = '', minutosEst = 0, entradaMin = 0, tolerancia = 0, llegadaMin = 0;
let editado = false, primera = true, reloj = 0;
bConfirmar.textContent = 'Mantén para confirmar';

const aMin = (t) => {
  const m = /(\d+):(\d+)\s*([ap])/i.exec(t);
  return ((+m[1] % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + +m[2];
};
const dos = (n) => String(n).padStart(2, '0');
const h12 = (m) => { const h = Math.floor(m / 60); return `${dos(h % 12 || 12)}:${dos(m % 60)} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const dur = (n) => (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);
const may = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pintarFecha(y, m, d) {
  const f = new Date(y, m - 1, d);
  $('dia-sem').textContent = may(f.toLocaleDateString('es', { weekday: 'long' }));
  $('fecha-larga').textContent = f.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Dibuja el estado actual (puntual/tarde) en toda la ficha
function pintar() {
  $('ficha-tipo').textContent = tarde ? 'Ficha de retardo' : 'Ficha de ingreso puntual';
  $('h-llegada').textContent = h12(llegadaMin);
  if (tarde) {
    $('lbl-dif').textContent = 'Retardo';
    $('h-dif').textContent = dur(minutosEst);
  } else {
    const antes = entradaMin - llegadaMin;
    $('lbl-dif').textContent = antes > 0 ? 'Anticipación' : 'Resultado';
    $('h-dif').textContent = antes > 0 ? dur(antes) : 'En tolerancia';
  }
  const med = $('medidor');
  med.className = tarde ? 'mal' : 'ok';
  setTimeout(() => {
    med.style.width = tarde ? Math.max(8, Math.min(100, (minutosEst / 60) * 100)) + '%' : '100%';
  }, primera ? 200 : 0);

  const ins = $('insignia');
  ins.className = 'insignia ' + (tarde ? 'insignia--tarde' : 'insignia--puntual');
  ins.hidden = false;
  clearInterval(reloj);
  if (tarde && primera) {
    let n = 0;
    const paso = Math.max(1, Math.ceil(minutosEst / 30));
    reloj = setInterval(() => {
      n = Math.min(minutosEst, n + paso);
      ins.textContent = `Tarde · ${n} min de retardo`;
      if (n >= minutosEst) clearInterval(reloj);
    }, 30);
  } else {
    ins.textContent = tarde ? `Tarde · ${minutosEst} min de retardo` : 'Puntual';
  }
  $('bloque-motivo').hidden = !tarde;
  primera = false;
}

// Edición manual de la llegada (fecha, hora y estado)
function leerAjuste(estadoManual) {
  const [hh, mm] = aHora.value.split(':').map(Number);
  if (!Number.isNaN(hh) && !Number.isNaN(mm)) llegadaMin = hh * 60 + mm;
  if (!estadoManual) aEstado.value = llegadaMin <= entradaMin + tolerancia ? 'PUNTUAL' : 'TARDE';
  tarde = aEstado.value === 'TARDE';
  minutosEst = tarde ? Math.max(1, llegadaMin - entradaMin) : 0;
  const [y, m, d] = aFecha.value.split('-').map(Number);
  if (y) pintarFecha(y, m, d);
  editado = true;
  pintar();
}
aFecha.addEventListener('change', () => leerAjuste(true));
aHora.addEventListener('input', () => leerAjuste(false));
aEstado.addEventListener('change', () => leerAjuste(true));
$('btn-ajustar').addEventListener('click', () => {
  const f = $('form-ajuste');
  f.hidden = !f.hidden;
  $('btn-ajustar').textContent = f.hidden ? 'Editar llegada' : 'Cerrar edición';
});

(async () => {
  try {
    const [v, h] = await Promise.all([api('/api/validacion'), api('/api/hora')]);
    const e = v.estudiante;
    tarde = v.estado === 'TARDE';
    nombreEst = e.nombreCompleto.split(' ')[0];
    minutosEst = v.minutos;
    entradaMin = aMin(v.horaEntrada);
    llegadaMin = aMin(v.horaLlegada);
    tolerancia = v.tolerancia || 0;

    const [dd, mm, aa] = h.fecha.split('/').map(Number);
    pintarFecha(aa, mm, dd);
    aFecha.value = `${aa}-${dos(mm)}-${dos(dd)}`;
    aHora.value = `${dos(Math.floor(llegadaMin / 60))}:${dos(llegadaMin % 60)}`;
    aEstado.value = v.estado;

    $('nombre').textContent = e.nombreCompleto;
    $('nie').textContent = 'NIE: ' + e.nie;
    $('grado').textContent = `${e.grado} · Sección ${e.seccion}`;
    $('h-entrada').textContent = v.horaEntrada;
    if (e.fotoUrl) {
      const img = document.createElement('img');
      img.src = e.fotoUrl;
      img.alt = 'Fotografía de ' + e.nombreCompleto;
      $('foto').replaceChildren(img);
    }
    pintar();

    // Aviso de reincidencia / racha de puntualidad
    try {
      const r = await api('/api/estudiante/' + e.nie);
      const ex = document.createElement('div');
      ex.className = 'extra';
      const aviso = (txt, c) => { const a = document.createElement('div'); a.className = 'aviso aviso--' + c; a.textContent = txt; ex.append(a); };
      if (r.retardosMes >= 2) aviso(`Reincidente: con un retardo hoy sería el n.º ${r.retardosMes + 1} del mes`, 'mal');
      else if (r.racha >= 1) aviso(`Racha de puntualidad: si llega puntual suma ${r.racha + 1} seguidos`, 'ok');
      const q = document.createElement('span');
      q.className = 'etq';
      q.textContent = `Retardos este mes: ${r.retardosMes}`;
      ex.append(q);
      document.querySelector('.ficha__cuerpo').after(ex);
    } catch (x) { /* el panel es opcional */ }

    bConfirmar.disabled = false;
  } catch (err) {
    $('nombre').textContent = 'Sin validación';
    mensaje(err.message);
    setTimeout(() => (location.href = '/validar'), 2200);
  }
})();

document.querySelectorAll('.chip').forEach((c) => {
  c.addEventListener('click', () => {
    const estaba = c.classList.contains('activo');
    document.querySelectorAll('.chip').forEach((x) => x.classList.remove('activo'));
    if (estaba) { obs.value = ''; return; }
    c.classList.add('activo');
    obs.value = c.dataset.m || '';
    if (!c.dataset.m) obs.focus();
  });
});

function confeti() {
  const col = ['#ff3b4a', '#ffd166', '#ffffff', '#b3001b'];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.className = 'confeti';
    s.style.cssText = `left:${Math.random() * 100}vw;background:${col[i % 4]};--dx:${(Math.random() - 0.5) * 200}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.3}s`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2800);
  }
}

async function confirmar() {
  bConfirmar.disabled = bCancelar.disabled = true;
  const cuerpo = { observacion: obs.value };
  if (editado) Object.assign(cuerpo, { fecha: aFecha.value, hora: aHora.value, estado: tarde ? 'TARDE' : 'PUNTUAL' });
  try {
    const r = await post('/api/validacion/confirmar', cuerpo);
    const s = $('sello');
    s.textContent = tarde ? 'Retardo registrado' : 'Registrado';
    s.classList.toggle('mal', tarde);
    s.classList.add('puesto');
    const frases = tarde
      ? ['Mañana será un mejor día.', 'Lo importante es mejorar cada día.', 'La puntualidad también se entrena.']
      : ['¡Excelente inicio de día!', '¡Así se hace, sigue así!', 'La puntualidad habla bien de ti.'];
    mensaje(`${r.mensaje} ${frases[Math.floor(Math.random() * frases.length)]}`, 'ok');
    sonar(!tarde);
    const dicho = hablar(tarde ? `Retardo registrado. ${nombreEst}, ${minutosEst} minutos.` : `Ingreso puntual. ${nombreEst}, excelente inicio de día.`);
    if (tarde) $('ficha').classList.add('tiembla'); else confeti();
    // La página cambia solo cuando termina de hablar (y pasaron al menos 2.6 segundos)
    Promise.all([dicho, new Promise((fin) => setTimeout(fin, 2600))]).then(() => (location.href = '/validar'));
  } catch (err) {
    mensaje(err.message);
    if (err.status === 410) setTimeout(() => (location.href = '/validar'), 2000);
    else bConfirmar.disabled = bCancelar.disabled = false;
  }
}

// Mantener presionado para confirmar (con teclado, Enter confirma directo)
let t0 = 0, raf = 0;
function paso(ts) {
  if (!t0) t0 = ts;
  const p = Math.min(1, (ts - t0) / 700);
  bConfirmar.style.setProperty('--p', p * 100 + '%');
  if (p >= 1) { t0 = 0; confirmar(); return; }
  raf = requestAnimationFrame(paso);
}
function soltar() {
  cancelAnimationFrame(raf);
  t0 = 0;
  if (!bConfirmar.disabled) bConfirmar.style.setProperty('--p', '0%');
}
bConfirmar.addEventListener('pointerdown', () => { if (!bConfirmar.disabled) raf = requestAnimationFrame(paso); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => bConfirmar.addEventListener(ev, soltar));
bConfirmar.addEventListener('click', (e) => { if (e.detail === 0 && !bConfirmar.disabled) confirmar(); });

bCancelar.addEventListener('click', async () => {
  try { await post('/api/validacion/cancelar'); } finally { location.href = '/validar'; }
});
$('btn-imprimir').addEventListener('click', () => window.print());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bCancelar.disabled) bCancelar.click(); });