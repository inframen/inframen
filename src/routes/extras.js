const express = require('express');
const pool = require('../db');
const t = require('../tiempo');
const { programarGuardado } = require('../reportes');

const router = express.Router();
const mesActual = () => { const d = t.ahora(); return [d.getMonth() + 1, d.getFullYear()]; };
const M = 'MONTH(i.fecha_hora) = ? AND YEAR(i.fecha_hora) = ?';

// Vista previa del estudiante + retardos del mes + racha de puntualidad
router.get('/estudiante/:nie', async (req, res) => {
  const nie = req.params.nie;
  if (!/^\d{8}$/.test(nie)) return res.status(400).json({ error: 'NIE inválido.' });
  const [[e]] = await pool.execute(
    'SELECT nombres, apellidos, grado, seccion, foto_url, estado FROM estudiante WHERE nie = ?', [nie]);
  if (!e) return res.status(404).json({ error: 'No existe ningún estudiante con ese NIE.' });
  const [[m]] = await pool.execute(
    `SELECT COUNT(*) n FROM ingreso i WHERE i.nie = ? AND i.estado = 'TARDE' AND ${M}`, [nie, ...mesActual()]);
  const [ult] = await pool.execute(
    'SELECT estado FROM ingreso WHERE nie = ? ORDER BY fecha_hora DESC LIMIT 60', [nie]);
  let racha = 0;
  for (const r of ult) { if (r.estado !== 'PUNTUAL') break; racha++; }
  res.json({
    nombre: `${e.nombres} ${e.apellidos}`.trim(),
    grado: t.gradoCorto(e.grado, e.seccion),
    fotoUrl: e.foto_url || null,
    activo: e.estado === 'ACTIVO',
    retardosMes: Number(m.n),
    racha,
  });
});

// Datos del panel de estadísticas (mes actual)
router.get('/estadisticas', async (req, res) => {
  const [mes, anio] = mesActual();
  const p = [mes, anio];
  const [[tot]] = await pool.execute(
    `SELECT COUNT(*) total, COALESCE(SUM(i.estado = 'TARDE'), 0) tardes FROM ingreso i WHERE ${M}`, p);
  const [dias] = await pool.execute(
    `SELECT DAYOFWEEK(i.fecha_hora) d, COUNT(*) n FROM ingreso i WHERE i.estado = 'TARDE' AND ${M} GROUP BY d`, p);
  const [grados] = await pool.execute(
    `SELECT e.grado, COUNT(*) n FROM ingreso i JOIN estudiante e ON e.nie = i.nie
      WHERE i.estado = 'TARDE' AND ${M} GROUP BY e.grado ORDER BY n DESC LIMIT 6`, p);
  const [top] = await pool.execute(
    `SELECT e.nie, e.nombres, e.apellidos, e.grado, e.seccion, COUNT(*) n, SUM(f.minutos_retardo) mins
       FROM ingreso i JOIN estudiante e ON e.nie = i.nie JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso
      WHERE ${M} GROUP BY e.nie ORDER BY n DESC, mins DESC LIMIT 5`, p);
  const [cal] = await pool.execute(
    `SELECT DAY(i.fecha_hora) dia, SUM(i.estado = 'TARDE') tardes FROM ingreso i WHERE ${M} GROUP BY dia`, p);
  const [liga] = await pool.execute(
    `SELECT e.grado, e.seccion, COUNT(*) total, SUM(i.estado = 'PUNTUAL') pun
       FROM ingreso i JOIN estudiante e ON e.nie = i.nie WHERE ${M}
      GROUP BY e.grado, e.seccion ORDER BY (SUM(i.estado = 'PUNTUAL') / COUNT(*)) DESC, total DESC LIMIT 6`, p);
  const [lista] = await pool.execute(
    `SELECT i.fecha_hora, i.estado, e.nombres, e.apellidos, e.grado, e.seccion
       FROM ingreso i JOIN estudiante e ON e.nie = i.nie
      WHERE DATE(i.fecha_hora) = ? ORDER BY i.fecha_hora DESC LIMIT 10`,
    [t.aSql(t.ahora()).slice(0, 10)]);

  const porDia = [0, 0, 0, 0, 0]; // lunes a viernes
  dias.forEach(({ d, n }) => { const k = (Number(d) + 5) % 7; if (k < 5) porDia[k] = Number(n); });

  res.json({
    mes, anio, total: Number(tot.total), tardes: Number(tot.tardes), porDia,
    grados: grados.map((g) => ({ grado: g.grado, n: Number(g.n) })),
    top: top.map((r) => ({
      nie: r.nie, nombre: `${r.nombres} ${r.apellidos}`.trim(),
      grado: t.gradoCorto(r.grado, r.seccion), n: Number(r.n), mins: Number(r.mins),
    })),
    liga: liga.map((l) => ({
      nombre: t.gradoCorto(l.grado, l.seccion), total: Number(l.total),
      pct: Math.round((Number(l.pun) / Number(l.total)) * 100),
    })),
    calendario: Object.fromEntries(cal.map((c) => [c.dia, Number(c.tardes)])),
    hoy: lista.map((r) => ({
      hora: t.hora12DesdeTexto(r.fecha_hora.slice(11, 16)), estado: r.estado,
      nombre: `${r.nombres} ${r.apellidos}`.trim(), grado: t.gradoCorto(r.grado, r.seccion),
    })),
  });
});

// Detalle de un ingreso (motivo del retardo y foto)
router.get('/ingreso/:id', async (req, res) => {
  const [[r]] = await pool.execute(
    `SELECT f.observacion, e.foto_url FROM ingreso i JOIN estudiante e ON e.nie = i.nie
       LEFT JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso WHERE i.id_ingreso = ?`, [req.params.id]);
  if (!r) return res.status(404).json({ error: 'No existe ese ingreso.' });
  res.json({ observacion: r.observacion || '', fotoUrl: r.foto_url || null });
});

// Anular un ingreso (solo administrador); la ficha de retardo se borra en cascada
router.delete('/ingreso/:id', async (req, res) => {
  if (req.session.usuario.rol !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Solo el administrador puede anular ingresos.' });
  }
  const [[x]] = await pool.execute('SELECT nie FROM ingreso WHERE id_ingreso = ?', [req.params.id]);
  await pool.execute('DELETE FROM ingreso WHERE id_ingreso = ?', [req.params.id]);
  if (x) programarGuardado(x.nie);
  res.json({ ok: true });
});

// Editar el motivo de un retardo (solo administrador)
router.put('/ingreso/:id', async (req, res) => {
  if (req.session.usuario.rol !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Solo el administrador puede editar ingresos.' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Ingreso inválido.' });
  const observacion = String((req.body || {}).observacion || '').replace(/\s+/g, ' ').trim().slice(0, 255);

  const [[x]] = await pool.execute('SELECT nie, estado FROM ingreso WHERE id_ingreso = ?', [id]);
  if (!x) return res.status(404).json({ error: 'No existe ese ingreso.' });
  if (x.estado !== 'TARDE') return res.status(400).json({ error: 'Solo los retardos tienen motivo.' });

  await pool.execute('UPDATE ficha_retardo SET observacion = ? WHERE id_ingreso = ?', [observacion || null, id]);
  programarGuardado(x.nie);
  res.json({ ok: true, observacion });
});

// Búsqueda rápida (Ctrl+K)
router.get('/buscar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const [f] = await pool.execute(
    "SELECT nie, nombres, apellidos, grado, seccion FROM estudiante WHERE nie LIKE ? OR CONCAT(nombres, ' ', apellidos) LIKE ? ORDER BY nombres LIMIT 6",
    [`%${q}%`, `%${q}%`]);
  res.json(f.map((e) => ({ nie: e.nie, nombre: `${e.nombres} ${e.apellidos}`.trim(), grado: t.gradoCorto(e.grado, e.seccion) })));
});

// ======================= NOTAS DEL PERSONAL (ej.: "llega tarde todos los días") =======================
// Las escriben docentes y administradores; aparecen en el perfil y en "Mi ficha" del estudiante.
let notasListas = false;
async function asegurarNotas() {
  if (notasListas) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS nota_estudiante (
       id_nota        INT AUTO_INCREMENT PRIMARY KEY,
       nie            CHAR(8)       NOT NULL,
       id_usuario     INT           NULL,
       autor_nombre   VARCHAR(100)  NOT NULL,
       autor_rol      VARCHAR(20)   NOT NULL,
       texto          VARCHAR(1000) NOT NULL,
       fecha_registro DATETIME      NOT NULL,
       CONSTRAINT fk_nota_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie) ON UPDATE CASCADE ON DELETE CASCADE,
       CONSTRAINT fk_nota_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON DELETE SET NULL,
       INDEX idx_nota_nie (nie, fecha_registro)
     ) ENGINE=InnoDB`);
  notasListas = true;
}
const ROL_TXT = { ADMINISTRADOR: 'Administrador', DOCENTE: 'Docente', CONTROL: 'Control' };
const PUEDE_ESCRIBIR = ['ADMINISTRADOR', 'DOCENTE'];

async function listarNotas(sesion, nie) {
  const [filas] = await pool.execute(
    `SELECT id_nota, id_usuario, autor_nombre, autor_rol, texto, fecha_registro FROM nota_estudiante
      WHERE nie = ? ORDER BY fecha_registro DESC, id_nota DESC LIMIT 50`, [nie]);
  return filas.map((n) => ({
    id: n.id_nota, texto: n.texto, autor: n.autor_nombre, rol: ROL_TXT[n.autor_rol] || '',
    fecha: `${n.fecha_registro.slice(8, 10)}/${n.fecha_registro.slice(5, 7)}/${n.fecha_registro.slice(0, 4)}`,
    hora: t.hora12DesdeTexto(n.fecha_registro.slice(11, 16)),
    puedeBorrar: sesion.rol === 'ADMINISTRADOR' || (sesion.rol === 'DOCENTE' && n.id_usuario === sesion.id),
  }));
}

router.post('/estudiantes/:nie/notas', async (req, res) => {
  const u = req.session.usuario;
  if (!PUEDE_ESCRIBIR.includes(u.rol)) return res.status(403).json({ error: 'Solo docentes y administradores pueden escribir notas.' });
  const nie = req.params.nie;
  if (!/^\d{8}$/.test(nie)) return res.status(400).json({ error: 'NIE inválido.' });
  const texto = String((req.body || {}).texto || '').replace(/\r/g, '').trim().slice(0, 1000);
  if (texto.length < 3) return res.status(400).json({ error: 'Escriba la nota (mínimo 3 caracteres).' });
  const [[e]] = await pool.execute('SELECT nie FROM estudiante WHERE nie = ?', [nie]);
  if (!e) return res.status(404).json({ error: 'No existe ese estudiante.' });

  await asegurarNotas();
  await pool.execute(
    'INSERT INTO nota_estudiante (nie, id_usuario, autor_nombre, autor_rol, texto, fecha_registro) VALUES (?, ?, ?, ?, ?, ?)',
    [nie, u.id, u.nombreCompleto, u.rol, texto, t.aSql(t.ahora())]);
  res.status(201).json({ ok: true, notas: await listarNotas(u, nie) });
});

router.delete('/notas/:id', async (req, res) => {
  const u = req.session.usuario;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Nota inválida.' });
  await asegurarNotas();
  const [[n]] = await pool.execute('SELECT nie, id_usuario FROM nota_estudiante WHERE id_nota = ?', [id]);
  if (!n) return res.status(404).json({ error: 'No existe esa nota.' });
  const permitido = u.rol === 'ADMINISTRADOR' || (u.rol === 'DOCENTE' && n.id_usuario === u.id);
  if (!permitido) return res.status(403).json({ error: 'Solo puede eliminar sus propias notas.' });
  await pool.execute('DELETE FROM nota_estudiante WHERE id_nota = ?', [id]);
  res.json({ ok: true, notas: await listarNotas(u, n.nie) });
});

// Perfil del estudiante: totales, racha, insignias, motivos, notas y línea de tiempo
const verPerfil = async (req, res, nie) => {
  if (!/^\d{8}$/.test(nie)) return res.status(400).json({ error: 'NIE inválido.' });
  const [[e]] = await pool.execute('SELECT nombres, apellidos, grado, seccion, foto_url FROM estudiante WHERE nie = ?', [nie]);
  if (!e) return res.status(404).json({ error: 'No existe ningún estudiante con ese NIE.' });
  await asegurarNotas();
  const sesion = req.session.usuario;
  const [[g]] = await pool.execute("SELECT COUNT(*) total, COALESCE(SUM(estado = 'TARDE'), 0) tarde FROM ingreso WHERE nie = ?", [nie]);
  const [[m]] = await pool.execute(`SELECT COUNT(*) total, COALESCE(SUM(i.estado = 'TARDE'), 0) tarde FROM ingreso i WHERE i.nie = ? AND ${M}`, [nie, ...mesActual()]);
  const [ult] = await pool.execute(
    `SELECT i.fecha_hora, i.estado, f.minutos_retardo, f.observacion FROM ingreso i
       LEFT JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso WHERE i.nie = ? ORDER BY i.fecha_hora DESC LIMIT 60`, [nie]);
  const [motivos] = await pool.execute(
    `SELECT f.observacion o, COUNT(*) n FROM ingreso i JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso
      WHERE i.nie = ? AND f.observacion IS NOT NULL AND f.observacion <> '' GROUP BY f.observacion ORDER BY n DESC LIMIT 4`, [nie]);
  let racha = 0;
  for (const r of ult) { if (r.estado !== 'PUNTUAL') break; racha++; }
  let tardeSeguidos = 0;
  for (const r of ult) { if (r.estado !== 'TARDE') break; tardeSeguidos++; }
  const total = Number(g.total), tardes = Number(g.tarde), tardesMes = Number(m.tarde);
  const insignias = [];
  if (racha >= 10) insignias.push({ n: 'Puntual de hierro', d: '10 ingresos puntuales seguidos' });
  else if (racha >= 5) insignias.push({ n: 'Racha de 5', d: '5 ingresos puntuales seguidos' });
  if (Number(m.total) >= 3 && tardesMes === 0) insignias.push({ n: 'Mes perfecto', d: 'Sin retardos este mes' });
  if (total >= 1 && tardes === 0) insignias.push({ n: 'Historial limpio', d: 'Nunca ha llegado tarde' });
  if (tardesMes >= 3) insignias.push({ n: 'En observación', d: '3 o más retardos este mes', mal: true });
  res.json({
    nie, nombre: `${e.nombres} ${e.apellidos}`.trim(), grado: t.gradoCorto(e.grado, e.seccion), fotoUrl: e.foto_url || null,
    total, retardosMes: tardesMes, racha, tardeSeguidos, insignias,
    notas: await listarNotas(sesion, nie), puedeEscribir: PUEDE_ESCRIBIR.includes(sesion.rol),
    pct: total ? Math.round(((total - tardes) / total) * 100) : 0,
    motivos: motivos.map((x) => ({ motivo: x.o, n: Number(x.n) })),
    linea: ult.slice(0, 15).map((r) => ({
      fecha: `${r.fecha_hora.slice(8, 10)}/${r.fecha_hora.slice(5, 7)}/${r.fecha_hora.slice(0, 4)}`,
      hora: t.hora12DesdeTexto(r.fecha_hora.slice(11, 16)), estado: r.estado,
      minutos: r.minutos_retardo === null ? 0 : Number(r.minutos_retardo), observacion: r.observacion || '',
    })),
  });
};
router.get('/perfil/:nie', (req, res) => verPerfil(req, res, req.params.nie));
router.verPerfil = verPerfil;

module.exports = router;