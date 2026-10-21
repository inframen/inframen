// Validaciones compartidas por las rutas de administración y de cambio de contraseña.
// Cada función devuelve { error } si algo está mal, o { valor } / { datos } si todo está bien.
const crypto = require('crypto');

const GRADOS = ['Primer año', 'Segundo año', 'Tercer año'];
const ROLES_PERSONAL = ['ADMINISTRADOR', 'DOCENTE', 'CONTROL'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const limpiar = (v) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();

function nie(v) {
  const s = limpiar(v);
  return /^\d{8}$/.test(s) ? { valor: s } : { error: 'El NIE debe tener exactamente 8 números.' };
}

function nombre(v, etiqueta) {
  const s = limpiar(v);
  if (s.length < 2 || s.length > 80) return { error: `${etiqueta} debe tener entre 2 y 80 letras.` };
  if (!/^\p{L}[\p{L}\s'.-]*$/u.test(s)) return { error: `${etiqueta} solo puede llevar letras y espacios.` };
  return { valor: s };
}

function horaTexto(v, etiqueta) {
  const s = limpiar(v).slice(0, 5);
  return HORA.test(s) ? { valor: s } : { error: `${etiqueta} no es una hora válida (use el formato 07:00).` };
}

// Contraseña: 8 a 72 caracteres, con al menos una letra y un número (72 es el límite de bcrypt)
function clave(v) {
  const s = String(v === undefined || v === null ? '' : v);
  if (s.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (s.length > 72) return { error: 'La contraseña no puede pasar de 72 caracteres.' };
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return { error: 'La contraseña debe llevar al menos una letra y un número.' };
  return { valor: s };
}

function usuario(v) {
  const s = limpiar(v);
  return /^[A-Za-z0-9._-]{3,50}$/.test(s)
    ? { valor: s }
    : { error: 'El usuario debe tener de 3 a 50 caracteres: letras, números, punto, guion o guion bajo.' };
}

function rol(v) {
  return ROLES_PERSONAL.includes(v) ? { valor: v } : { error: 'Elija un rol válido.' };
}

// Mañana (sección A) 07:00 a 12:00; tarde (resto) 13:00 a 18:00, igual que los datos de ejemplo
function horarioPorDefecto(seccion) {
  return String(seccion).toUpperCase() === 'A' ? { entrada: '07:00', salida: '12:00' } : { entrada: '13:00', salida: '18:00' };
}

// Valida los datos de un estudiante. Con { editar: true } el NIE no se vuelve a pedir.
function estudiante(b, { editar = false } = {}) {
  b = b || {};
  const datos = {};
  let r;
  if (!editar) {
    r = nie(b.nie);
    if (r.error) return r;
    datos.nie = r.valor;
  }
  r = nombre(b.nombres, 'Los nombres');
  if (r.error) return r;
  datos.nombres = r.valor;
  r = nombre(b.apellidos, 'Los apellidos');
  if (r.error) return r;
  datos.apellidos = r.valor;

  const grado = limpiar(b.grado);
  if (!GRADOS.includes(grado)) return { error: 'Elija un grado válido.' };
  datos.grado = grado;

  const seccion = limpiar(b.seccion).toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(seccion)) return { error: 'La sección debe ser una o dos letras (por ejemplo A).' };
  datos.seccion = seccion;

  const porDefecto = horarioPorDefecto(seccion);
  r = horaTexto(b.entrada === undefined || b.entrada === '' ? porDefecto.entrada : b.entrada, 'La hora de entrada');
  if (r.error) return r;
  datos.entrada = r.valor;
  r = horaTexto(b.salida === undefined || b.salida === '' ? porDefecto.salida : b.salida, 'La hora de salida');
  if (r.error) return r;
  datos.salida = r.valor;
  if (datos.entrada >= datos.salida) return { error: 'La hora de entrada debe ser menor que la de salida.' };

  const tol = b.tolerancia === undefined || b.tolerancia === '' ? 0 : Number(b.tolerancia);
  if (!Number.isInteger(tol) || tol < 0 || tol > 60) return { error: 'La tolerancia debe ser un número entero de 0 a 60 minutos.' };
  datos.tolerancia = tol;

  if (editar) {
    const estado = limpiar(b.estado || 'ACTIVO');
    if (!['ACTIVO', 'INACTIVO'].includes(estado)) return { error: 'El estado debe ser ACTIVO o INACTIVO.' };
    datos.estado = estado;
  }
  return { datos };
}

// Contraseña aleatoria legible (sin letras que se confunden) con letras y números
const ALFABETO_L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ALFABETO_N = '23456789';
function claveAleatoria(largo = 8) {
  const todos = ALFABETO_L + ALFABETO_N;
  for (;;) {
    const c = Array.from(crypto.randomBytes(largo), (b) => todos[b % todos.length]).join('');
    if (/[A-Z]/.test(c) && /\d/.test(c)) return c;
  }
}

module.exports = { GRADOS, ROLES_PERSONAL, limpiar, nie, nombre, clave, usuario, rol, estudiante, horarioPorDefecto, claveAleatoria };