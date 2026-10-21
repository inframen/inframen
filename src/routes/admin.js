// Administración (solo rol ADMINISTRADOR): CRUD de estudiantes y de usuarios del personal.
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const V = require('../validaciones');
const t = require('../tiempo');
const { programarGuardado, quitarEstudiante } = require('../reportes');

const router = express.Router();

const RAIZ = path.join(__dirname, '..', '..');
const FOTOS = process.env.FOTOS_DIR || path.join(RAIZ, 'public', 'fotos');
const AVATARES = path.join(RAIZ, 'public', 'img', 'alumnos');
const hora = (t) => String(t || '').slice(0, 5);

// Bases creadas antes de existir las cuentas de estudiantes: agrega el rol y la columna "nie" una sola vez
let esquemaListo = false;
async function asegurarEsquema() {
  if (esquemaListo) return;
  try {
    await pool.query('SELECT nie FROM usuario LIMIT 1');
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    await pool.query("ALTER TABLE usuario MODIFY rol ENUM('ADMINISTRADOR','DOCENTE','CONTROL','ESTUDIANTE') NOT NULL");
    await pool.query(
      'ALTER TABLE usuario ADD COLUMN nie CHAR(8) NULL, ' +
        'ADD CONSTRAINT fk_usuario_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie) ON UPDATE CASCADE ON DELETE SET NULL'
    );
  }
  esquemaListo = true;
}

// Foto que ya exista para ese NIE (la subida desde la pantalla o un archivo puesto a mano)
function fotoExistente(nie) {
  if (fs.existsSync(path.join(FOTOS, `${nie}.jpg`))) return `/fotos/${nie}.jpg`;
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'svg'].find((x) => fs.existsSync(path.join(AVATARES, `${nie}.${x}`)));
  return ext ? `/img/alumnos/${nie}.${ext}` : null;
}

const aEstudiante = (r) => ({
  nie: r.nie, nombres: r.nombres, apellidos: r.apellidos, grado: r.grado, seccion: r.seccion, estado: r.estado,
  fotoUrl: r.foto_url || null, ingresos: Number(r.ingresos), tieneCuenta: Number(r.cuenta) > 0,
  entrada: hora(r.entrada), salida: hora(r.salida), tolerancia: Number(r.tolerancia || 0),
  entradaTxt: r.entrada ? t.hora12DesdeTexto(r.entrada) : '', salidaTxt: r.salida ? t.hora12DesdeTexto(r.salida) : '', // para mostrar en 12 h
});

async function guardarHorario(cx, nie, d) {
  for (let dia = 1; dia <= 5; dia++) {
    const [r] = await cx.execute(
      'UPDATE horario SET hora_entrada = ?, hora_salida = ?, tolerancia_min = ? WHERE nie = ? AND dia_semana = ?',
      [`${d.entrada}:00`, `${d.salida}:00`, d.tolerancia, nie, dia]);
    if (!r.affectedRows) {
      await cx.execute(
        'INSERT INTO horario (nie, dia_semana, hora_entrada, hora_salida, tolerancia_min) VALUES (?, ?, ?, ?, ?)',
        [nie, dia, `${d.entrada}:00`, `${d.salida}:00`, d.tolerancia]);
    }
  }
}

async function crearCuentaEstudiante(cx, nie, nombre) {
  const clave = V.claveAleatoria();
  await cx.execute(
    "INSERT INTO usuario (nombre_usuario, nombre_completo, contrasena_hash, rol, activo, nie) VALUES (?, ?, ?, 'ESTUDIANTE', 1, ?)",
    [nie, nombre, await bcrypt.hash(clave, 10), nie]);
  return clave;
}

// ======================= ESTUDIANTES =======================

router.get('/estudiantes', async (req, res) => {
  const donde = ['1 = 1'], params = [];
  const buscar = V.limpiar(req.query.buscar);
  if (buscar) {
    donde.push("(e.nie LIKE ? OR CONCAT(e.nombres, ' ', e.apellidos) LIKE ?)");
    params.push(`%${buscar}%`, `%${buscar}%`);
  }
  const grado = V.limpiar(req.query.grado);
  if (grado) { donde.push('e.grado = ?'); params.push(grado); }
  const estado = V.limpiar(req.query.estado);
  if (['ACTIVO', 'INACTIVO'].includes(estado)) { donde.push('e.estado = ?'); params.push(estado); }

  const [filas] = await pool.execute(
    `SELECT e.nie, e.nombres, e.apellidos, e.grado, e.seccion, e.estado, e.foto_url,
            (SELECT COUNT(*) FROM ingreso i WHERE i.nie = e.nie) AS ingresos,
            (SELECT COUNT(*) FROM usuario u WHERE u.nombre_usuario = e.nie) AS cuenta,
            (SELECT MIN(h.hora_entrada) FROM horario h WHERE h.nie = e.nie) AS entrada,
            (SELECT MAX(h.hora_salida) FROM horario h WHERE h.nie = e.nie) AS salida,
            (SELECT MAX(h.tolerancia_min) FROM horario h WHERE h.nie = e.nie) AS tolerancia
       FROM estudiante e WHERE ${donde.join(' AND ')} ORDER BY e.apellidos, e.nombres LIMIT 500`, params);
  res.json({ estudiantes: filas.map(aEstudiante) });
});

router.post('/estudiantes', async (req, res) => {
  await asegurarEsquema();
  const v = V.estudiante(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const d = v.datos;
  const crearCuenta = (req.body || {}).crearCuenta !== false;

  const [[ya]] = await pool.execute('SELECT nie FROM estudiante WHERE nie = ?', [d.nie]);
  if (ya) return res.status(409).json({ error: 'Ya existe un estudiante con ese NIE.' });
  if (crearCuenta) {
    const [[u]] = await pool.execute('SELECT id_usuario FROM usuario WHERE nombre_usuario = ?', [d.nie]);
    if (u) return res.status(409).json({ error: 'Ya existe un usuario con ese NIE.' });
  }

  const cx = await pool.getConnection();
  let claveInicial = null;
  try {
    await cx.beginTransaction();
    await cx.execute(
      "INSERT INTO estudiante (nie, nombres, apellidos, grado, seccion, foto_url, estado) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVO')",
      [d.nie, d.nombres, d.apellidos, d.grado, d.seccion, fotoExistente(d.nie)]);
    await guardarHorario(cx, d.nie, d);
    if (crearCuenta) claveInicial = await crearCuentaEstudiante(cx, d.nie, `${d.nombres} ${d.apellidos}`);
    await cx.commit();
  } catch (err) {
    await cx.rollback();
    throw err;
  } finally {
    cx.release();
  }
  programarGuardado(d.nie);
  res.status(201).json({ ok: true, nie: d.nie, claveInicial });
});

router.put('/estudiantes/:nie', async (req, res) => {
  await asegurarEsquema();
  const n = V.nie(req.params.nie);
  if (n.error) return res.status(400).json({ error: n.error });
  const v = V.estudiante(req.body, { editar: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const d = v.datos;

  const [[e]] = await pool.execute('SELECT nie FROM estudiante WHERE nie = ?', [n.valor]);
  if (!e) return res.status(404).json({ error: 'No existe ese estudiante.' });

  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    await cx.execute(
      'UPDATE estudiante SET nombres = ?, apellidos = ?, grado = ?, seccion = ?, estado = ? WHERE nie = ?',
      [d.nombres, d.apellidos, d.grado, d.seccion, d.estado, n.valor]);
    await guardarHorario(cx, n.valor, d);
    // Si tiene cuenta de acceso: el nombre se mantiene igual y, si se desactiva el estudiante, no puede entrar
    await cx.execute(
      "UPDATE usuario SET nombre_completo = ?, activo = ? WHERE nombre_usuario = ? AND rol = 'ESTUDIANTE'",
      [`${d.nombres} ${d.apellidos}`, d.estado === 'ACTIVO' ? 1 : 0, n.valor]);
    await cx.commit();
  } catch (err) {
    await cx.rollback();
    throw err;
  } finally {
    cx.release();
  }
  programarGuardado(n.valor);
  res.json({ ok: true });
});

router.delete('/estudiantes/:nie', async (req, res) => {
  const n = V.nie(req.params.nie);
  if (n.error) return res.status(400).json({ error: n.error });
  const [[e]] = await pool.execute('SELECT nie FROM estudiante WHERE nie = ?', [n.valor]);
  if (!e) return res.status(404).json({ error: 'No existe ese estudiante.' });

  const [[c]] = await pool.execute('SELECT COUNT(*) AS n FROM ingreso WHERE nie = ?', [n.valor]);
  if (Number(c.n) > 0) {
    return res.status(409).json({
      error: `Este estudiante tiene ${Number(c.n)} ingreso(s) registrado(s) y no se puede eliminar sin perder el historial. Cámbielo a INACTIVO.`,
    });
  }
  await asegurarEsquema();
  await pool.execute("DELETE FROM usuario WHERE nombre_usuario = ? AND rol = 'ESTUDIANTE'", [n.valor]);
  await pool.execute('DELETE FROM estudiante WHERE nie = ?', [n.valor]); // su horario se borra en cascada
  try { fs.unlinkSync(path.join(FOTOS, `${n.valor}.jpg`)); } catch (err) { /* no tenía foto subida */ }
  quitarEstudiante(n.valor);
  res.json({ ok: true });
});

// Crea la cuenta de acceso del estudiante, o le restablece la contraseña. La contraseña solo se muestra esta vez.
router.post('/estudiantes/:nie/clave', async (req, res) => {
  await asegurarEsquema();
  const n = V.nie(req.params.nie);
  if (n.error) return res.status(400).json({ error: n.error });
  const [[e]] = await pool.execute('SELECT nombres, apellidos, estado FROM estudiante WHERE nie = ?', [n.valor]);
  if (!e) return res.status(404).json({ error: 'No existe ese estudiante.' });
  if (e.estado !== 'ACTIVO') return res.status(409).json({ error: 'El estudiante está inactivo.' });

  const [[u]] = await pool.execute("SELECT id_usuario FROM usuario WHERE nombre_usuario = ? AND rol = 'ESTUDIANTE'", [n.valor]);
  if (u) {
    const clave = V.claveAleatoria();
    await pool.execute('UPDATE usuario SET contrasena_hash = ?, activo = 1 WHERE id_usuario = ?', [await bcrypt.hash(clave, 10), u.id_usuario]);
    return res.json({ ok: true, clave, creada: false });
  }
  const [[otro]] = await pool.execute('SELECT id_usuario FROM usuario WHERE nombre_usuario = ?', [n.valor]);
  if (otro) return res.status(409).json({ error: 'Ya existe un usuario del personal con ese nombre.' });
  const clave = await crearCuentaEstudiante(pool, n.valor, `${e.nombres} ${e.apellidos}`);
  res.status(201).json({ ok: true, clave, creada: true });
});

// Foto del estudiante: la pantalla la reduce a JPG y la envía como texto (data URL)
router.put('/estudiantes/:nie/foto', async (req, res) => {
  const n = V.nie(req.params.nie);
  if (n.error) return res.status(400).json({ error: n.error });
  const [[e]] = await pool.execute('SELECT nie FROM estudiante WHERE nie = ?', [n.valor]);
  if (!e) return res.status(404).json({ error: 'No existe ese estudiante.' });

  const m = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).imagen || ''));
  if (!m) return res.status(400).json({ error: 'La foto debe ser una imagen JPG.' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ error: 'La imagen no es un JPG válido.' });
  if (buf.length > 200 * 1024) return res.status(413).json({ error: 'La foto es muy pesada (máximo 200 KB).' });

  fs.mkdirSync(FOTOS, { recursive: true });
  fs.writeFileSync(path.join(FOTOS, `${n.valor}.jpg`), buf);
  const url = `/fotos/${n.valor}.jpg`;
  await pool.execute('UPDATE estudiante SET foto_url = ? WHERE nie = ?', [url, n.valor]);
  programarGuardado(n.valor);
  res.json({ ok: true, fotoUrl: url });
});

// ======================= USUARIOS DEL PERSONAL =======================

const aUsuario = (r) => ({
  id: r.id_usuario, usuario: r.nombre_usuario, nombre: r.nombre_completo, rol: r.rol, activo: Number(r.activo) === 1,
});

// ¿Quedaría algún administrador activo además de este usuario?
async function hayOtroAdmin(id) {
  const [[c]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM usuario WHERE rol = 'ADMINISTRADOR' AND activo = 1 AND id_usuario <> ?", [id]);
  return Number(c.n) > 0;
}

router.get('/usuarios', async (req, res) => {
  const [filas] = await pool.execute(
    "SELECT id_usuario, nombre_usuario, nombre_completo, rol, activo FROM usuario WHERE rol <> 'ESTUDIANTE' ORDER BY nombre_usuario");
  res.json({ usuarios: filas.map(aUsuario) });
});

router.post('/usuarios', async (req, res) => {
  const b = req.body || {};
  const u = V.usuario(b.usuario);
  if (u.error) return res.status(400).json({ error: u.error });
  const nom = V.nombre(b.nombre, 'El nombre completo');
  if (nom.error) return res.status(400).json({ error: nom.error });
  const r = V.rol(b.rol);
  if (r.error) return res.status(400).json({ error: r.error });
  const c = V.clave(b.clave);
  if (c.error) return res.status(400).json({ error: c.error });

  const [[ya]] = await pool.execute('SELECT id_usuario FROM usuario WHERE nombre_usuario = ?', [u.valor]);
  if (ya) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });

  const [ins] = await pool.execute(
    'INSERT INTO usuario (nombre_usuario, nombre_completo, contrasena_hash, rol, activo) VALUES (?, ?, ?, ?, 1)',
    [u.valor, nom.valor, await bcrypt.hash(c.valor, 10), r.valor]);
  res.status(201).json({ ok: true, id: ins.insertId });
});

router.put('/usuarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Usuario inválido.' });
  const b = req.body || {};
  const [[x]] = await pool.execute("SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario = ? AND rol <> 'ESTUDIANTE'", [id]);
  if (!x) return res.status(404).json({ error: 'No existe ese usuario.' });

  const nom = V.nombre(b.nombre, 'El nombre completo');
  if (nom.error) return res.status(400).json({ error: nom.error });
  const r = V.rol(b.rol);
  if (r.error) return res.status(400).json({ error: r.error });
  const activo = b.activo === false || b.activo === 0 ? 0 : 1;

  const propio = id === req.session.usuario.id;
  if (propio && (r.valor !== x.rol || activo !== Number(x.activo))) {
    return res.status(400).json({ error: 'No puede cambiar su propio rol ni desactivar su propia cuenta.' });
  }
  if (x.rol === 'ADMINISTRADOR' && Number(x.activo) === 1 && (r.valor !== 'ADMINISTRADOR' || !activo) && !(await hayOtroAdmin(id))) {
    return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
  }

  let hash = null;
  if (b.clave !== undefined && b.clave !== '') {
    const c = V.clave(b.clave);
    if (c.error) return res.status(400).json({ error: c.error });
    hash = await bcrypt.hash(c.valor, 10);
  }
  await pool.execute('UPDATE usuario SET nombre_completo = ?, rol = ?, activo = ? WHERE id_usuario = ?', [nom.valor, r.valor, activo, id]);
  if (hash) await pool.execute('UPDATE usuario SET contrasena_hash = ? WHERE id_usuario = ?', [hash, id]);
  res.json({ ok: true });
});

router.delete('/usuarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Usuario inválido.' });
  if (id === req.session.usuario.id) return res.status(400).json({ error: 'No puede eliminar su propia cuenta.' });
  const [[x]] = await pool.execute("SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario = ? AND rol <> 'ESTUDIANTE'", [id]);
  if (!x) return res.status(404).json({ error: 'No existe ese usuario.' });
  if (x.rol === 'ADMINISTRADOR' && Number(x.activo) === 1 && !(await hayOtroAdmin(id))) {
    return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
  }
  const [[c]] = await pool.execute('SELECT COUNT(*) AS n FROM ingreso WHERE id_usuario = ?', [id]);
  if (Number(c.n) > 0) {
    return res.status(409).json({ error: `Este usuario registró ${Number(c.n)} ingreso(s) y no se puede eliminar sin perder el historial. Desactívelo.` });
  }
  await pool.execute('DELETE FROM usuario WHERE id_usuario = ?', [id]);
  res.json({ ok: true });
});

module.exports = router;