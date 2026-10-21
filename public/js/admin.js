// Pantalla de Administración: estudiantes y usuarios del personal (crear, consultar, actualizar, eliminar).
const $ = (id) => document.getElementById(id);
const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };
const opcion = (valor, texto) => { const o = document.createElement('option'); o.value = valor; o.textContent = texto; return o; };
const enviar = (metodo, url, cuerpo) => api(url, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

const GRADOS = ['Primer año', 'Segundo año', 'Tercer año'];
const ORDINAL = { 'Primer año': '1.º', 'Segundo año': '2.º', 'Tercer año': '3.º' };
const ROLES = { ADMINISTRADOR: 'Administrador', DOCENTE: 'Docente', CONTROL: 'Control' };
const gradoCorto = (e) => `${ORDINAL[e.grado] || e.grado} ${e.seccion}`;

let yo = null;        // usuario con sesión
let editandoNie = null;   // NIE del estudiante que se edita (null = nuevo)
let editandoId = null;    // id del usuario que se edita (null = nuevo)
let ultimaClave = '';

function aviso(texto, tipo) {
  mensaje(texto, tipo || 'error');
  if (texto) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Pestañas ----------
function pestana(cual) {
  const est = cual === 'est';
  $('sec-est').hidden = !est;
  $('sec-usu').hidden = est;
  $('tab-est').setAttribute('aria-selected', String(est));
  $('tab-usu').setAttribute('aria-selected', String(!est));
  mensaje('');
  if (est) cargarEstudiantes(); else cargarUsuarios();
}
$('tab-est').addEventListener('click', () => pestana('est'));
$('tab-usu').addEventListener('click', () => pestana('usu'));

// ---------- Contraseña generada (se muestra una sola vez) ----------
function mostrarClave(titulo, texto, clave) {
  ultimaClave = clave;
  $('clave-titulo').textContent = titulo;
  $('clave-texto').textContent = texto;
  $('clave-valor').textContent = clave;
  $('clave-ov').hidden = false;
}
$('clave-cerrar').addEventListener('click', () => { $('clave-ov').hidden = true; ultimaClave = ''; $('clave-valor').textContent = ''; });
$('clave-copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ultimaClave); $('clave-copiar').textContent = 'Copiada'; }
  catch (e) { $('clave-copiar').textContent = 'Selecciónela y copie'; }
  setTimeout(() => { $('clave-copiar').textContent = 'Copiar'; }, 2000);
});

// ====================== ESTUDIANTES ======================
function consultaEst() {
  const p = new URLSearchParams();
  if ($('e-buscar').value.trim()) p.set('buscar', $('e-buscar').value.trim());
  if ($('e-grado').value) p.set('grado', $('e-grado').value);
  if ($('e-estado').value) p.set('estado', $('e-estado').value);
  return p.toString();
}

function filaEst(e) {
  const tr = nodo('tr', 'fila');
  const c0 = nodo('td', null, e.nie); c0.dataset.l = 'NIE';
  const c1 = nodo('td'); c1.dataset.l = 'Estudiante';
  const caja = nodo('div', 'celda-est'), av = nodo('div', 'avatar-mini');
  if (e.fotoUrl) av.style.backgroundImage = `url("${encodeURI(e.fotoUrl)}")`;
  caja.append(av, nodo('span', null, `${e.nombres} ${e.apellidos}`));
  c1.append(caja);
  const c2 = nodo('td', null, gradoCorto(e)); c2.dataset.l = 'Grado';
  const c3 = nodo('td', null, `${e.entrada} – ${e.salida}${e.tolerancia ? ` (+${e.tolerancia} min)` : ''}`); c3.dataset.l = 'Horario';
  const c4 = nodo('td', null, e.ingresos); c4.dataset.l = 'Ingresos';
  const c5 = nodo('td'); c5.dataset.l = 'Estado';
  c5.append(nodo('span', 'pildora ' + (e.estado === 'ACTIVO' ? 'pildora--leve' : 'pildora--grave'), e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'));
  const c6 = nodo('td'); c6.dataset.l = 'Acciones';
  const acc = nodo('div', 'acciones');

  const bEd = nodo('button', 'boton boton--secundario boton--mini', 'Editar');
  bEd.type = 'button';
  bEd.addEventListener('click', () => abrirEditorEst(e));
  const bFoto = nodo('button', 'boton boton--secundario boton--mini', 'Foto');
  bFoto.type = 'button';
  bFoto.addEventListener('click', () => elegirFoto(e));
  const bClave = nodo('button', 'boton boton--secundario boton--mini', e.tieneCuenta ? 'Nueva clave' : 'Crear acceso');
  bClave.type = 'button';
  bClave.addEventListener('click', () => accesoEst(e));
  const bDel = nodo('button', 'boton boton--secundario boton--mini boton--peligro', 'Eliminar');
  bDel.type = 'button';
  bDel.addEventListener('click', () => eliminarEst(e));
  acc.append(bEd, bFoto, bClave, bDel);
  c6.append(acc);
  tr.append(c0, c1, c2, c3, c4, c5, c6);
  return tr;
}

async function cargarEstudiantes() {
  try {
    const { estudiantes } = await api('/api/admin/estudiantes?' + consultaEst());
    const cuerpo = $('e-cuerpo');
    cuerpo.replaceChildren();
    if (!estudiantes.length) {
      const tr = nodo('tr'), td = nodo('td', 'vacio', 'No hay estudiantes con esos filtros.');
      td.colSpan = 7; tr.append(td); cuerpo.append(tr);
      $('e-resumen').textContent = '';
      return;
    }
    estudiantes.forEach((e, i) => { const tr = filaEst(e); tr.style.setProperty('--i', Math.min(i, 20)); cuerpo.append(tr); });
    const activos = estudiantes.filter((e) => e.estado === 'ACTIVO').length;
    $('e-resumen').replaceChildren(nodo('b', null, estudiantes.length), ' estudiantes · ', nodo('b', null, activos), ' activos');
  } catch (err) { aviso(err.message); }
}

function abrirEditorEst(e) {
  editandoNie = e ? e.nie : null;
  $('e-titulo').textContent = e ? `Editar a ${e.nombres} ${e.apellidos}` : 'Nuevo estudiante';
  $('f-nie').value = e ? e.nie : '';
  $('f-nie').disabled = !!e;
  $('f-nombres').value = e ? e.nombres : '';
  $('f-apellidos').value = e ? e.apellidos : '';
  $('f-grado').value = e ? e.grado : GRADOS[0];
  $('f-seccion').value = e ? e.seccion : 'A';
  $('f-entrada').value = e ? e.entrada : '07:00';
  $('f-salida').value = e ? e.salida : '12:00';
  $('f-tol').value = e ? e.tolerancia : 0;
  $('f-estado').value = e ? e.estado : 'ACTIVO';
  $('f-estado-caja').hidden = !e;
  $('f-cuenta-caja').hidden = !!e;
  $('f-cuenta').checked = true;
  $('e-editor').hidden = false;
  mensaje('');
  $('e-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  (e ? $('f-nombres') : $('f-nie')).focus();
}
function cerrarEditorEst() { $('e-editor').hidden = true; editandoNie = null; }

// Al cambiar la sección se propone el horario habitual (A = mañana, las demás = tarde); se puede cambiar a mano
$('f-seccion').addEventListener('change', () => {
  if (editandoNie) return;
  const manana = $('f-seccion').value.trim().toUpperCase() === 'A';
  $('f-entrada').value = manana ? '07:00' : '13:00';
  $('f-salida').value = manana ? '12:00' : '18:00';
});

$('e-nuevo').addEventListener('click', () => abrirEditorEst(null));
$('e-cancelar').addEventListener('click', cerrarEditorEst);

$('e-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const cuerpo = {
    nie: $('f-nie').value.trim(), nombres: $('f-nombres').value, apellidos: $('f-apellidos').value,
    grado: $('f-grado').value, seccion: $('f-seccion').value, entrada: $('f-entrada').value, salida: $('f-salida').value,
    tolerancia: $('f-tol').value, estado: $('f-estado').value, crearCuenta: $('f-cuenta').checked,
  };
  try {
    if (editandoNie) {
      await enviar('PUT', '/api/admin/estudiantes/' + encodeURIComponent(editandoNie), cuerpo);
      aviso('Estudiante actualizado.', 'ok');
    } else {
      const r = await enviar('POST', '/api/admin/estudiantes', cuerpo);
      aviso('Estudiante registrado.', 'ok');
      if (r.claveInicial) mostrarClave('Cuenta creada', `Usuario: ${r.nie}. Contraseña inicial:`, r.claveInicial);
    }
    cerrarEditorEst();
    cargarEstudiantes();
  } catch (err) { aviso(err.message); }
});

async function eliminarEst(e) {
  if (!confirm(`¿Eliminar a ${e.nombres} ${e.apellidos}? No se puede deshacer.`)) return;
  try {
    await enviar('DELETE', '/api/admin/estudiantes/' + encodeURIComponent(e.nie));
    aviso('Estudiante eliminado.', 'ok');
    cargarEstudiantes();
  } catch (err) { aviso(err.message); }
}

async function accesoEst(e) {
  const pregunta = e.tieneCuenta
    ? `¿Generar una contraseña nueva para ${e.nombres}? La anterior dejará de funcionar.`
    : `¿Crear la cuenta de acceso de ${e.nombres}?`;
  if (!confirm(pregunta)) return;
  try {
    const r = await enviar('POST', `/api/admin/estudiantes/${encodeURIComponent(e.nie)}/clave`);
    mostrarClave(r.creada ? 'Cuenta creada' : 'Contraseña nueva', `Usuario: ${e.nie}. Contraseña:`, r.clave);
    cargarEstudiantes();
  } catch (err) { aviso(err.message); }
}

// Foto: se reduce a 300 × 400 px (JPG) en el navegador antes de enviarla
let estudianteFoto = null;
function elegirFoto(e) { estudianteFoto = e; $('foto-archivo').value = ''; $('foto-archivo').click(); }

function reducirFoto(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const W = 300, H = 400, lienzo = document.createElement('canvas');
      lienzo.width = W; lienzo.height = H;
      const cx = lienzo.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
      const esc = Math.max(W / img.width, H / img.height); // recorta al centro para llenar el cuadro
      const w = img.width * esc, h = img.height * esc;
      cx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(lienzo.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

$('foto-archivo').addEventListener('change', async () => {
  const f = $('foto-archivo').files[0];
  if (!f || !estudianteFoto) return;
  try {
    const imagen = await reducirFoto(f);
    await enviar('PUT', `/api/admin/estudiantes/${encodeURIComponent(estudianteFoto.nie)}/foto`, { imagen });
    aviso('Foto actualizada.', 'ok');
    cargarEstudiantes();
  } catch (err) { aviso(err.message); }
});

$('f-est').addEventListener('submit', (ev) => { ev.preventDefault(); cargarEstudiantes(); });
let tmBuscar;
$('e-buscar').addEventListener('input', () => { clearTimeout(tmBuscar); tmBuscar = setTimeout(cargarEstudiantes, 250); });
$('e-grado').addEventListener('change', cargarEstudiantes);
$('e-estado').addEventListener('change', cargarEstudiantes);

// ====================== USUARIOS ======================
function filaUsu(u) {
  const tr = nodo('tr', 'fila');
  const c0 = nodo('td', null, u.usuario); c0.dataset.l = 'Usuario';
  const c1 = nodo('td', null, u.nombre); c1.dataset.l = 'Nombre';
  const c2 = nodo('td', null, ROLES[u.rol] || u.rol); c2.dataset.l = 'Rol';
  const c3 = nodo('td'); c3.dataset.l = 'Estado';
  c3.append(nodo('span', 'pildora ' + (u.activo ? 'pildora--leve' : 'pildora--grave'), u.activo ? 'Activo' : 'Inactivo'));
  const c4 = nodo('td'); c4.dataset.l = 'Acciones';
  const acc = nodo('div', 'acciones');
  const bEd = nodo('button', 'boton boton--secundario boton--mini', 'Editar');
  bEd.type = 'button';
  bEd.addEventListener('click', () => abrirEditorUsu(u));
  const bDel = nodo('button', 'boton boton--secundario boton--mini boton--peligro', 'Eliminar');
  bDel.type = 'button';
  bDel.disabled = !!(yo && yo.id === u.id);
  bDel.title = bDel.disabled ? 'No puede eliminar su propia cuenta' : '';
  bDel.addEventListener('click', () => eliminarUsu(u));
  acc.append(bEd, bDel);
  c4.append(acc);
  tr.append(c0, c1, c2, c3, c4);
  return tr;
}

async function cargarUsuarios() {
  try {
    const { usuarios } = await api('/api/admin/usuarios');
    const cuerpo = $('u-cuerpo');
    cuerpo.replaceChildren();
    usuarios.forEach((u, i) => { const tr = filaUsu(u); tr.style.setProperty('--i', Math.min(i, 20)); cuerpo.append(tr); });
  } catch (err) { aviso(err.message); }
}

function abrirEditorUsu(u) {
  editandoId = u ? u.id : null;
  const propio = !!(u && yo && yo.id === u.id);
  $('u-titulo').textContent = u ? `Editar a ${u.usuario}` : 'Nuevo usuario';
  $('g-usuario').value = u ? u.usuario : '';
  $('g-usuario').disabled = !!u;
  $('g-nombre').value = u ? u.nombre : '';
  $('g-rol').value = u ? u.rol : 'DOCENTE';
  $('g-rol').disabled = propio;      // nadie puede quitarse su propio rol
  $('g-clave').value = '';
  $('g-clave').placeholder = u ? 'Déjela vacía para no cambiarla' : 'Mínimo 8, con letras y números';
  $('g-activo').checked = u ? u.activo : true;
  $('g-activo').disabled = propio;
  $('g-activo-caja').hidden = !u;
  $('u-editor').hidden = false;
  mensaje('');
  $('u-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  (u ? $('g-nombre') : $('g-usuario')).focus();
}
function cerrarEditorUsu() { $('u-editor').hidden = true; editandoId = null; }

$('u-nuevo').addEventListener('click', () => abrirEditorUsu(null));
$('u-cancelar').addEventListener('click', cerrarEditorUsu);

$('u-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const cuerpo = { usuario: $('g-usuario').value.trim(), nombre: $('g-nombre').value, rol: $('g-rol').value, clave: $('g-clave').value, activo: $('g-activo').checked };
  try {
    if (editandoId) {
      await enviar('PUT', '/api/admin/usuarios/' + editandoId, cuerpo);
      aviso('Usuario actualizado.', 'ok');
    } else {
      await enviar('POST', '/api/admin/usuarios', cuerpo);
      aviso('Usuario registrado.', 'ok');
    }
    cerrarEditorUsu();
    cargarUsuarios();
  } catch (err) { aviso(err.message); }
});

async function eliminarUsu(u) {
  if (!confirm(`¿Eliminar al usuario ${u.usuario}? No se puede deshacer.`)) return;
  try {
    await enviar('DELETE', '/api/admin/usuarios/' + u.id);
    aviso('Usuario eliminado.', 'ok');
    cargarUsuarios();
  } catch (err) { aviso(err.message); }
}

// ---------- Inicio ----------
(async () => {
  yo = await usuarioActual;
  if (!yo || yo.rol !== 'ADMINISTRADOR') { location.href = '/validar'; return; }
  GRADOS.forEach((g) => { $('f-grado').appendChild(opcion(g, g)); $('e-grado').appendChild(opcion(g, g)); });
  cargarEstudiantes();
})();