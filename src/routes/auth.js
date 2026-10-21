const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const limite = require('../limite');
const V = require('../validaciones');

const router = express.Router();

const regenerar = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const guardar = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

router.post('/login', async (req, res) => {
  const cuerpo = req.body || {};
  const usuario = String(cuerpo.usuario || '').trim();
  const clave = String(cuerpo.clave || '');

  if (!usuario || !clave) {
    return res.status(400).json({ error: 'Escriba su usuario y su contraseña.' });
  }

  // Protección contra adivinar contraseñas: 5 fallos seguidos bloquean 10 minutos
  const llave = `${req.ip}|${usuario.toLowerCase()}`;
  const bloqueo = limite.estado(llave);
  if (bloqueo.bloqueado) {
    return res.status(429).json({ error: `Demasiados intentos fallidos. Espere ${bloqueo.minutos} minuto(s) e intente de nuevo.` });
  }

  // Si la columna "nie" todavía no existe (falta ejecutar scripts/crear-alumnos.js), el inicio de sesión sigue funcionando
  const SQL = 'SELECT id_usuario, nombre_usuario, nombre_completo, contrasena_hash, rol, activo, nie FROM usuario WHERE nombre_usuario = ?';
  let filas;
  try {
    [filas] = await pool.execute(SQL, [usuario]);
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    [filas] = await pool.execute(SQL.replace(', nie FROM', ', NULL AS nie FROM'), [usuario]);
  }
  const u = filas[0];
  const correcto = u && Number(u.activo) === 1 && (await bcrypt.compare(clave, u.contrasena_hash));

  if (!correcto) {
    limite.fallo(llave);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  limite.exito(llave);

  await regenerar(req);
  req.session.usuario = {
    id: u.id_usuario,
    nombreUsuario: u.nombre_usuario,
    nombreCompleto: u.nombre_completo,
    rol: u.rol,
    nie: u.nie || null,
  };
  await guardar(req);
  res.json({ ok: true, usuario: req.session.usuario });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('inframen.sid');
    res.json({ ok: true });
  });
});

router.get('/yo', (req, res) => {
  if (req.session && req.session.usuario) return res.json({ usuario: req.session.usuario });
  return res.status(401).json({ error: 'Sin sesión.' });
});

// Cambiar la contraseña propia (la usa la pantalla "Mi ficha"; sirve para cualquier rol)
router.post('/cambiar-clave', async (req, res) => {
  const sesion = req.session && req.session.usuario;
  if (!sesion) return res.status(401).json({ error: 'Su sesión terminó. Inicie sesión de nuevo.' });

  const cuerpo = req.body || {};
  const actual = String(cuerpo.actual || '');
  const nueva = String(cuerpo.nueva || '');
  if (!actual) return res.status(400).json({ error: 'Escriba su contraseña actual.' });

  const llave = `clave|${sesion.id}`;
  const bloqueo = limite.estado(llave);
  if (bloqueo.bloqueado) {
    return res.status(429).json({ error: `Demasiados intentos fallidos. Espere ${bloqueo.minutos} minuto(s).` });
  }

  const v = V.clave(nueva);
  if (v.error) return res.status(400).json({ error: v.error });
  if (nueva === actual) return res.status(400).json({ error: 'La contraseña nueva debe ser distinta de la actual.' });

  const [filas] = await pool.execute('SELECT contrasena_hash FROM usuario WHERE id_usuario = ? AND activo = 1', [sesion.id]);
  if (!filas[0] || !(await bcrypt.compare(actual, filas[0].contrasena_hash))) {
    limite.fallo(llave);
    return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  }
  limite.exito(llave);

  await pool.execute('UPDATE usuario SET contrasena_hash = ? WHERE id_usuario = ?', [await bcrypt.hash(nueva, 10), sesion.id]);
  res.json({ ok: true });
});

module.exports = router;