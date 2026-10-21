// Reportes en PDF: ficha de cada estudiante y registro general de ingresos.
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const t = require('./tiempo');
const Pdf = require('./pdf');

const RAIZ = path.join(__dirname, '..');
const CARPETA = path.join(RAIZ, 'reportes'); // aquí se guardan los PDF
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ROJO = [0.78, 0.05, 0.14], OSCURO = [0.12, 0.06, 0.08], GRIS = [0.45, 0.42, 0.44], CLARO = [0.97, 0.95, 0.95], BLANCO = [1, 1, 1];
const PIE = 'INFRAMEN · Instituto Nacional General Francisco Menéndez';

const fecha = (fh) => `${fh.slice(8, 10)}/${fh.slice(5, 7)}/${fh.slice(0, 4)}`;
const hora = (fh) => t.hora12DesdeTexto(fh.slice(11, 16));
const generado = () => { const d = new Date(); return `${t.fechaCorta(d)} ${t.hora12(d)}`; };
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const reg = (r) => ({
  fecha: fecha(r.fecha_hora), llegada: hora(r.fecha_hora), estado: r.estado,
  minutos: r.minutos_retardo === null ? 0 : Number(r.minutos_retardo), motivo: r.observacion || '',
});
const totales = (rs) => {
  const tardes = rs.filter((r) => r.estado === 'TARDE');
  return {
    total: rs.length, puntuales: rs.length - tardes.length, tardes: tardes.length,
    pct: rs.length ? Math.round(((rs.length - tardes.length) / rs.length) * 100) : 0,
    minutos: tardes.reduce((s, r) => s + r.minutos, 0),
  };
};

// ---------- Datos ----------
async function datosEstudiante(nie) {
  const [[e]] = await pool.execute('SELECT nombres, apellidos, grado, seccion, foto_url FROM estudiante WHERE nie = ?', [nie]);
  if (!e) return null;
  const [filas] = await pool.execute(
    `SELECT i.fecha_hora, i.estado, f.minutos_retardo, f.observacion FROM ingreso i
       LEFT JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso WHERE i.nie = ? ORDER BY i.fecha_hora DESC`, [nie]);
  const registros = filas.map(reg);
  return {
    nie, nombre: `${e.nombres} ${e.apellidos}`.trim(), apellido: e.apellidos, iniciales: (e.nombres[0] + e.apellidos[0]).toUpperCase(),
    grado: `${t.gradoCorto(e.grado, e.seccion)}`, foto: e.foto_url, registros, totales: totales(registros),
  };
}

async function datosGeneral(q = {}) {
  const donde = ['1 = 1'], params = [], filtros = [];
  const buscar = String(q.buscar || '').trim();
  if (buscar) {
    donde.push("(e.nie LIKE ? OR CONCAT(e.nombres, ' ', e.apellidos) LIKE ?)");
    params.push(`%${buscar}%`, `%${buscar}%`); filtros.push(`Búsqueda: ${buscar}`);
  }
  const grado = String(q.grado || '').trim();
  if (grado) { donde.push('e.grado = ?'); params.push(grado); filtros.push(`Grado: ${grado}`); }
  const mes = Number(q.mes), anio = t.ahora().getFullYear();
  if (Number.isInteger(mes) && mes >= 1 && mes <= 12) {
    donde.push('MONTH(i.fecha_hora) = ?', 'YEAR(i.fecha_hora) = ?'); params.push(mes, anio);
    filtros.push(`Mes: ${MESES[mes - 1]} de ${anio}`);
  }
  const [filas] = await pool.execute(
    `SELECT i.fecha_hora, i.estado, e.nie, e.nombres, e.apellidos, e.grado, e.seccion, f.minutos_retardo, f.observacion
       FROM ingreso i JOIN estudiante e ON e.nie = i.nie LEFT JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso
      WHERE ${donde.join(' AND ')} ORDER BY i.fecha_hora DESC, e.apellidos`, params);
  const registros = filas.map((r) => ({ ...reg(r), nie: r.nie, estudiante: `${r.nombres} ${r.apellidos}`.trim(), grado: t.gradoCorto(r.grado, r.seccion) }));
  return { filtros, registros, totales: { ...totales(registros), estudiantes: new Set(filas.map((r) => r.nie)).size } };
}

// ---------- Dibujo ----------
function cabecera(pdf, titulo, sub) {
  pdf.rect(0, 0, pdf.ancho, 66, { relleno: ROJO });
  pdf.texto(40, 32, titulo, { t: 18, b: true, c: BLANCO });
  pdf.texto(40, 50, sub, { t: 9, c: [1, 0.86, 0.88], max: pdf.ancho - 80 });
}
function kpi(pdf, x, y, w, etq, valor) {
  pdf.rect(x, y, w, 52, { relleno: CLARO, borde: [0.88, 0.84, 0.85] });
  pdf.texto(x + 10, y + 18, etq, { t: 8, c: GRIS });
  pdf.texto(x + 10, y + 40, String(valor), { t: 18, b: true, c: OSCURO });
}
function foto(pdf, d, x, y, w, h) {
  let img = null;
  if (d.foto && /\.jpe?g$/i.test(d.foto)) {
    try {
      const ruta = path.join(RAIZ, 'public', d.foto);
      if (ruta.startsWith(path.join(RAIZ, 'public'))) img = pdf.imagenJpeg(fs.readFileSync(ruta));
    } catch (e) { img = null; }
  }
  if (img) { pdf.dibujar(img, x, y, w, h); pdf.rect(x, y, w, h, { borde: ROJO, grosor: 1.5 }); return; }
  pdf.rect(x, y, w, h, { relleno: [0.2, 0.05, 0.08] });
  pdf.circulo(x + w / 2, y + h / 2, 28, { relleno: ROJO });
  pdf.texto(x + w / 2, y + h / 2 + 8, d.iniciales, { t: 22, b: true, c: BLANCO, a: 'c' });
}
function tabla(pdf, cols, filas, y, titulo) {
  const alto = 18, limite = pdf.alto - 50, ancho = cols.reduce((s, c) => s + c.w, 0);
  const encabezado = (yy) => {
    pdf.rect(40, yy, ancho, 20, { relleno: OSCURO });
    let x = 40;
    for (const c of cols) { pdf.texto(c.a === 'd' ? x + c.w - 5 : x + 5, yy + 14, c.t, { t: 8, b: true, c: BLANCO, a: c.a }); x += c.w; }
    return yy + 20;
  };
  y = encabezado(y);
  filas.forEach((f, i) => {
    if (y + alto > limite) {
      pdf.pagina();
      pdf.rect(0, 0, pdf.ancho, 32, { relleno: ROJO });
      pdf.texto(40, 21, titulo, { t: 11, b: true, c: BLANCO });
      y = encabezado(48);
    }
    if (i % 2) pdf.rect(40, y, ancho, alto, { relleno: CLARO });
    let x = 40;
    for (const c of cols) {
      const tarde = c.k === 'estado' && f.estado === 'TARDE';
      const v = c.k === 'estado' ? (tarde ? 'Tarde' : 'Puntual') : c.k === 'retardo' ? (f.estado === 'TARDE' ? `${f.minutos} min` : '-') : f[c.k];
      pdf.texto(c.a === 'd' ? x + c.w - 5 : x + 5, y + 12, v, { t: 8.5, b: tarde, c: tarde ? ROJO : OSCURO, a: c.a, max: c.w - 10 });
      x += c.w;
    }
    y += alto;
  });
  return y;
}
function pies(pdf) {
  const total = pdf.paginas.length;
  pdf.paginas.forEach((p, i) => {
    pdf.p = p;
    pdf.linea(40, pdf.alto - 34, pdf.ancho - 40, pdf.alto - 34, { c: [0.85, 0.82, 0.83], g: 0.5 });
    pdf.texto(40, pdf.alto - 20, PIE, { t: 8, c: GRIS });
    pdf.texto(pdf.ancho - 40, pdf.alto - 20, `Página ${i + 1} de ${total}`, { t: 8, c: GRIS, a: 'd' });
  });
}

function pdfEstudiante(d) {
  const pdf = new Pdf(595, 842), T = d.totales;
  cabecera(pdf, 'FICHA DE PUNTUALIDAD', PIE);
  foto(pdf, d, 40, 88, 90, 120);
  pdf.texto(150, 112, d.nombre, { t: 17, b: true, c: OSCURO, max: 405 });
  pdf.texto(150, 134, `NIE: ${d.nie}`, { t: 11, c: GRIS });
  pdf.texto(150, 152, `Grado y sección: ${d.grado}`, { t: 11, c: GRIS });
  pdf.texto(150, 170, `Generado el ${generado()}`, { t: 9, c: GRIS });
  [['INGRESOS', T.total], ['PUNTUALIDAD', `${T.pct}%`], ['RETARDOS', T.tardes], ['MINUTOS DE RETARDO', T.minutos]]
    .forEach(([e, v], i) => kpi(pdf, 40 + i * 130, 232, 122, e, v));
  pdf.texto(40, 322, 'Registro de ingresos', { t: 12, b: true, c: OSCURO });
  if (!d.registros.length) pdf.texto(40, 350, 'Este estudiante todavía no tiene ingresos registrados.', { t: 10, c: GRIS });
  else {
    tabla(pdf, [{ t: 'FECHA', k: 'fecha', w: 75 }, { t: 'LLEGADA', k: 'llegada', w: 80 }, { t: 'ESTADO', k: 'estado', w: 70 },
      { t: 'RETARDO', k: 'retardo', w: 70, a: 'd' }, { t: 'MOTIVO', k: 'motivo', w: 220 }], d.registros, 332, `Ficha de ${d.nombre}`);
  }
  pies(pdf);
  return pdf.construir();
}

function pdfGeneral(d) {
  const pdf = new Pdf(842, 595), T = d.totales;
  cabecera(pdf, 'REGISTRO GENERAL DE INGRESOS', d.filtros.length ? d.filtros.join('  ·  ') : 'Todos los registros');
  pdf.texto(pdf.ancho - 40, 32, `Generado el ${generado()}`, { t: 9, c: BLANCO, a: 'd' });
  [['REGISTROS', T.total], ['PUNTUALES', T.puntuales], ['RETARDOS', T.tardes], ['PUNTUALIDAD', `${T.pct}%`]]
    .forEach(([e, v], i) => kpi(pdf, 40 + i * 193, 86, 183, e, v));
  pdf.texto(40, 168, `Registros de ${T.estudiantes} estudiante${T.estudiantes === 1 ? '' : 's'}`, { t: 12, b: true, c: OSCURO });
  if (!d.registros.length) pdf.texto(40, 196, 'No hay registros con esos filtros.', { t: 10, c: GRIS });
  else {
    tabla(pdf, [{ t: 'FECHA', k: 'fecha', w: 62 }, { t: 'NIE', k: 'nie', w: 62 }, { t: 'ESTUDIANTE', k: 'estudiante', w: 170 }, { t: 'GRADO', k: 'grado', w: 50 },
      { t: 'LLEGADA', k: 'llegada', w: 62 }, { t: 'ESTADO', k: 'estado', w: 52 }, { t: 'RETARDO', k: 'retardo', w: 52, a: 'd' }, { t: 'MOTIVO', k: 'motivo', w: 252 }],
    d.registros, 178, 'Registro general de ingresos');
  }
  pies(pdf);
  return pdf.construir();
}

// ---------- Guardado en la carpeta "reportes" ----------
async function guardarEstudiante(nie) {
  const d = await datosEstudiante(nie);
  if (!d) return null;
  const dir = path.join(CARPETA, 'fichas');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `${nie}-${slug(d.apellido)}.pdf`);
  fs.writeFileSync(archivo, pdfEstudiante(d));
  // Si cambió el apellido, el PDF anterior tenía otro nombre: se borra para no dejar duplicados
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`${nie}-`) && f.endsWith('.pdf') && path.join(dir, f) !== archivo) fs.unlinkSync(path.join(dir, f));
  }
  return archivo;
}

// Cuando se elimina un estudiante: borra su ficha y actualiza el registro general
function quitarEstudiante(nie) {
  const dir = path.join(CARPETA, 'fichas');
  try {
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`${nie}-`) && f.endsWith('.pdf')) fs.unlinkSync(path.join(dir, f));
  } catch (e) { /* la carpeta todavía no existe */ }
  clearTimeout(temporizador);
  temporizador = setTimeout(() => guardarGeneral().catch((err) => console.error('No se pudo guardar el PDF general:', err.message)), 1000);
}
async function guardarGeneral() {
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.writeFileSync(path.join(CARPETA, 'registro-general.pdf'), pdfGeneral(await datosGeneral()));
}
async function guardarTodos() {
  const [alumnos] = await pool.query('SELECT nie FROM estudiante');
  for (const { nie } of alumnos) await guardarEstudiante(nie);
  await guardarGeneral();
  return alumnos.length;
}

// Se llama cada vez que cambia un ingreso: guarda de inmediato la ficha del estudiante
// y actualiza el registro general unos segundos después (para no repetirlo en cada ingreso seguido).
let temporizador;
function programarGuardado(nie) {
  guardarEstudiante(nie).catch((e) => console.error('No se pudo guardar el PDF del estudiante:', e.message));
  clearTimeout(temporizador);
  temporizador = setTimeout(() => guardarGeneral().catch((e) => console.error('No se pudo guardar el PDF general:', e.message)), 4000);
}

module.exports = { CARPETA, datosEstudiante, datosGeneral, pdfEstudiante, pdfGeneral, guardarEstudiante, guardarGeneral, guardarTodos, programarGuardado, quitarEstudiante };