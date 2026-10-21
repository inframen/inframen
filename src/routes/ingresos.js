const express = require('express');
const pool = require('../db');
const t = require('../tiempo');
const { programarGuardado } = require('../reportes');

const router = express.Router();

const VIGENCIA_MS = 10 * 60 * 1000; // la validación pendiente dura 10 minutos

// Comprueba que "2026-10-19" sea una fecha real
function fechaValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const y = +f.slice(0, 4), m = +f.slice(5, 7), d = +f.slice(8, 10);
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
}

// Hora y fecha que se muestran en la pantalla de validación
router.get('/hora', (req, res) => {
  const d = new Date(); // reloj real (la hora de llegada de la ficha sigue usando HORA_FIJA)
  res.json({ hora: t.hora12(d), fecha: t.fechaCorta(d), mes: d.getMonth() + 1 });
});

// Paso 1: el docente escribe el NIE y el sistema calcula si llegó puntual o tarde.
// Todavía no guarda nada: espera la confirmación de la persona.
router.post('/validar', async (req, res) => {
  const nie = String((req.body || {}).nie || '').trim();

  if (!/^\d{8}$/.test(nie)) {
    return res.status(400).json({ error: 'El NIE debe tener exactamente 8 números.' });
  }

  const [estudiantes] = await pool.execute(
    'SELECT nie, nombres, apellidos, grado, seccion, foto_url, estado FROM estudiante WHERE nie = ?',
    [nie]
  );
  const est = estudiantes[0];
  if (!est) {
    return res.status(404).json({ error: 'No se encontró ningún estudiante con ese NIE.' });
  }
  if (est.estado !== 'ACTIVO') {
    return res.status(403).json({ error: 'El estudiante está inactivo.' });
  }

  const fecha = t.ahora();
  const diaSemana = fecha.getDay(); // 1 = lunes ... 5 = viernes

  // Horario de hoy; si hoy no tiene (sábado/domingo), se usa el de otro día; si no tiene ninguno, entrada a las 7:00.
  let [horarios] = await pool.execute(
    'SELECT hora_entrada, hora_salida, tolerancia_min FROM horario WHERE nie = ? AND dia_semana = ?',
    [nie, diaSemana]
  );
  if (!horarios[0]) {
    [horarios] = await pool.execute(
      'SELECT hora_entrada, hora_salida, tolerancia_min FROM horario WHERE nie = ? ORDER BY dia_semana LIMIT 1',
      [nie]
    );
  }
  const horario = horarios[0] || { hora_entrada: '07:00:00', hora_salida: '12:00:00', tolerancia_min: 0 };

  // HORA_FIJA=entrada -> para demostraciones: la llegada es la hora de entrada del propio estudiante (puntual)
  if ((process.env.HORA_FIJA || '').trim().toLowerCase() === 'entrada') {
    const [hf, mf] = horario.hora_entrada.split(':').map(Number);
    fecha.setHours(hf, mf, 0, 0);
  }

  const evaluacion = t.evaluarIngreso(fecha, horario);

  const permitirRepetidos = String(process.env.PERMITIR_INGRESOS_REPETIDOS).toLowerCase() === 'true';
  if (!permitirRepetidos) {
    const dia = t.aSql(fecha).slice(0, 10);
    const [previos] = await pool.execute(
      'SELECT fecha_hora FROM ingreso WHERE nie = ? AND DATE(fecha_hora) = ? LIMIT 1',
      [nie, dia]
    );
    if (previos[0]) {
      const cuando = t.hora12DesdeTexto(previos[0].fecha_hora.slice(11, 16));
      return res.status(409).json({ error: `Este estudiante ya registró su ingreso hoy a las ${cuando}.` });
    }
  }

  const tolerancia = Number(horario.tolerancia_min) || 0;
  const [he, me] = horario.hora_entrada.split(':').map(Number);

  const datos = {
    estudiante: {
      nie: est.nie,
      nombreCompleto: `${est.nombres} ${est.apellidos}`.trim(),
      grado: est.grado,
      seccion: est.seccion,
      fotoUrl: est.foto_url || null,
    },
    horaEntrada: t.hora12DesdeTexto(horario.hora_entrada.slice(0, 5)),
    horaLlegada: t.hora12(fecha),
    estado: evaluacion.estado,
    minutos: evaluacion.minutos,
    tolerancia,
  };

  req.session.validacion = {
    ...datos,
    fechaHora: t.aSql(fecha),
    entradaMin: he * 60 + me,
    creada: Date.now(),
  };
  res.json(datos);
});

function validacionVigente(req) {
  const v = req.session.validacion;
  if (!v) return null;
  if (Date.now() - v.creada > VIGENCIA_MS) {
    delete req.session.validacion;
    return null;
  }
  return v;
}

// Datos de la validación pendiente (los usa la pantalla de resultado)
router.get('/validacion', (req, res) => {
  const v = validacionVigente(req);
  if (!v) return res.status(404).json({ error: 'No hay una validación pendiente.' });
  const { estudiante, horaEntrada, horaLlegada, estado, minutos, tolerancia } = v;
  res.json({ estudiante, horaEntrada, horaLlegada, estado, minutos, tolerancia });
});

// Paso 2: la persona confirma que es el estudiante correcto -> se guarda el ingreso
// y, si fue tarde, también la ficha de retardo.
// Opcionalmente puede corregir la fecha, la hora de llegada o el estado (puntual/tarde).
router.post('/validacion/confirmar', async (req, res) => {
  const v = validacionVigente(req);
  if (!v) {
    return res.status(410).json({ error: 'La validación expiró. Vuelva a ingresar el NIE.' });
  }

  const cuerpo = req.body || {};
  let observacion = String(cuerpo.observacion || '').trim().slice(0, 255);

  const fecha = String(cuerpo.fecha || '').trim();
  const hora = String(cuerpo.hora || '').trim();

  let fechaHora = v.fechaHora;
  if (fecha || hora) {
    const f = fecha || v.fechaHora.slice(0, 10);
    const h = hora || v.fechaHora.slice(11, 16);
    if (!fechaValida(f) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) {
      return res.status(400).json({ error: 'La fecha o la hora no es válida.' });
    }
    fechaHora = `${f} ${h}:00`;
  }

  const llegadaMin = Number(fechaHora.slice(11, 13)) * 60 + Number(fechaHora.slice(14, 16));
  const estado = ['PUNTUAL', 'TARDE'].includes(cuerpo.estado)
    ? cuerpo.estado
    : llegadaMin <= v.entradaMin + v.tolerancia ? 'PUNTUAL' : 'TARDE';
  const minutos = estado === 'TARDE' ? Math.max(1, llegadaMin - v.entradaMin) : 0;

  if (!observacion) observacion = null;

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [resultado] = await conexion.execute(
      'INSERT INTO ingreso (nie, id_usuario, fecha_hora, estado, identidad_confirmada) VALUES (?, ?, ?, ?, 1)',
      [v.estudiante.nie, req.session.usuario.id, fechaHora, estado]
    );

    if (estado === 'TARDE') {
      await conexion.execute(
        'INSERT INTO ficha_retardo (id_ingreso, minutos_retardo, observacion) VALUES (?, ?, ?)',
        [resultado.insertId, minutos, observacion]
      );
    }

    await conexion.commit();
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }

  delete req.session.validacion;
  programarGuardado(v.estudiante.nie); // guarda el PDF del estudiante y el registro general
  res.json({
    ok: true,
    mensaje:
      estado === 'TARDE'
        ? `Retardo de ${minutos} minutos registrado.`
        : 'Ingreso puntual registrado.',
  });
});

router.post('/validacion/cancelar', (req, res) => {
  delete req.session.validacion;
  res.json({ ok: true });
});

module.exports = router;