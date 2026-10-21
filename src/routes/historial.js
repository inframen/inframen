// Historial de retardos: lista con filtros, exportación a CSV y lista de grados.
const express = require('express');
const pool = require('../db');
const t = require('../tiempo');

const router = express.Router();

// Filtros: buscar (nombre o NIE), grado y mes (del año actual)
function filtrar(q) {
  const donde = ["i.estado = 'TARDE'"], params = [];
  const buscar = String(q.buscar || '').trim();
  if (buscar) {
    donde.push("(e.nie LIKE ? OR CONCAT(e.nombres, ' ', e.apellidos) LIKE ?)");
    params.push(`%${buscar}%`, `%${buscar}%`);
  }
  const grado = String(q.grado || '').trim();
  if (grado) { donde.push('e.grado = ?'); params.push(grado); }
  const mes = Number(q.mes);
  if (Number.isInteger(mes) && mes >= 1 && mes <= 12) {
    donde.push('MONTH(i.fecha_hora) = ?', 'YEAR(i.fecha_hora) = ?');
    params.push(mes, t.ahora().getFullYear());
  }
  return { donde: donde.join(' AND '), params };
}

async function consultar(q) {
  const { donde, params } = filtrar(q);
  const [filas] = await pool.execute(
    `SELECT i.id_ingreso, i.fecha_hora, e.nie, e.nombres, e.apellidos, e.grado, e.seccion, f.minutos_retardo
       FROM ingreso i JOIN estudiante e ON e.nie = i.nie
       LEFT JOIN ficha_retardo f ON f.id_ingreso = i.id_ingreso
      WHERE ${donde} ORDER BY i.fecha_hora DESC, i.id_ingreso DESC`, params);
  return filas.map((r) => ({
    id: r.id_ingreso,
    fecha: `${r.fecha_hora.slice(8, 10)}/${r.fecha_hora.slice(5, 7)}/${r.fecha_hora.slice(0, 4)}`,
    nie: r.nie,
    estudiante: `${r.nombres} ${r.apellidos}`.trim(),
    grado: t.gradoCorto(r.grado, r.seccion),
    llegada: t.hora12DesdeTexto(r.fecha_hora.slice(11, 16)),
    retardo: r.minutos_retardo === null ? 0 : Number(r.minutos_retardo),
  }));
}

router.get('/historial', async (req, res) => {
  res.json({ registros: await consultar(req.query) });
});

// CSV que abre bien en Excel (con BOM para las tildes y la ñ)
router.get('/historial/exportar', async (req, res) => {
  const registros = await consultar(req.query);
  const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lineas = [['Fecha', 'NIE', 'Estudiante', 'Grado', 'Llegada', 'Minutos de retardo'].map(celda).join(',')];
  registros.forEach((r) => lineas.push([r.fecha, r.nie, r.estudiante, r.grado, r.llegada, r.retardo].map(celda).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="historial-retardos.csv"');
  res.send('﻿' + lineas.join('\r\n'));
});

// Grados para el filtro
router.get('/grados', async (req, res) => {
  const [filas] = await pool.query('SELECT DISTINCT grado FROM estudiante ORDER BY grado');
  res.json(filas.map((f) => f.grado));
});

module.exports = router;