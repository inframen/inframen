// override: true -> el .env manda sobre cualquier variable que haya quedado en la terminal
require('dotenv').config({ override: true });
const path = require('path');
const express = require('express');
const session = require('express-session');

const pool = require('./src/db');
const {
  requiereSesionApi, requiereSesionPagina, soloPersonalApi, soloPersonalPagina, soloEstudianteApi, soloEstudiantePagina,
  soloAdminApi, soloAdminPagina,
} = require('./src/middleware');
const authRoutes = require('./src/routes/auth');
const ingresosRoutes = require('./src/routes/ingresos');
const historialRoutes = require('./src/routes/historial');
const extrasRoutes = require('./src/routes/extras');
const reportesRoutes = require('./src/routes/reportes');
const adminRoutes = require('./src/routes/admin');

const app = express();

// Aviso si se olvidó cambiar el secreto de las sesiones
const secreto = process.env.SESSION_SECRET || '';
if (secreto.length < 32 || /cambie-este-texto|inframen-desarrollo/.test(secreto)) {
  console.warn('>>> AVISO: SESSION_SECRET es débil o de ejemplo. Genere uno nuevo (vea .env.example).');
}
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '300kb' })); // 300 KB: la foto de un estudiante viaja como texto
app.use(
  session({
    name: 'inframen.sid',
    secret: process.env.SESSION_SECRET || 'inframen-desarrollo',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  })
);

// La hora siempre se pide fresca al servidor (nada de caché)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Las fotos de los estudiantes son datos personales: solo se ven con sesión iniciada
app.use(['/fotos', '/img/alumnos'], requiereSesionApi);

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Páginas ----------
const vista = (archivo) => (req, res) =>
  res.sendFile(path.join(__dirname, 'views', archivo));

app.get('/', (req, res) => {
  if (req.session.usuario) return res.redirect(req.session.usuario.rol === 'ESTUDIANTE' ? '/mi-ficha' : '/validar');
  return vista('login.html')(req, res);
});
app.get('/validar', requiereSesionPagina, soloPersonalPagina, vista('validar.html'));
app.get('/resultado', requiereSesionPagina, soloPersonalPagina, vista('resultado.html'));
app.get('/historial', requiereSesionPagina, soloPersonalPagina, vista('historial.html'));
app.get('/estadisticas', requiereSesionPagina, soloPersonalPagina, vista('estadisticas.html'));
app.get('/perfil', requiereSesionPagina, soloPersonalPagina, vista('perfil.html'));
app.get('/mi-ficha', requiereSesionPagina, soloEstudiantePagina, vista('mi-ficha.html'));
app.get('/administracion', requiereSesionPagina, soloPersonalPagina, soloAdminPagina, vista('admin.html'));

// ---------- API ----------
app.use('/api', authRoutes);
// Los estudiantes solo pueden consultar su propia ficha
app.get('/api/mi-ficha', requiereSesionApi, soloEstudianteApi, (req, res, next) =>
  extrasRoutes.verPerfil(req, res, req.session.usuario.nie).catch(next));

app.get('/api/mi-ficha/pdf', requiereSesionApi, soloEstudianteApi, (req, res, next) =>
  reportesRoutes.miFicha(req, res).catch(next));

app.use('/api', requiereSesionApi, soloPersonalApi, ingresosRoutes);
app.use('/api', requiereSesionApi, soloPersonalApi, historialRoutes);
app.use('/api', requiereSesionApi, soloPersonalApi, extrasRoutes);
app.use('/api', requiereSesionApi, soloPersonalApi, reportesRoutes);
app.use('/api/admin', requiereSesionApi, soloPersonalApi, soloAdminApi, adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// ---------- Errores ----------
app.use((err, req, res, next) => {
  console.error(err);
  const sinBase = ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE'];
  const mensaje = sinBase.includes(err.code)
    ? 'No se pudo usar la base de datos. Revise que MySQL esté encendido, el archivo .env y que haya ejecutado "npm run db:init".'
    : 'Ocurrió un error en el servidor.';
  if (res.headersSent) return next(err);
  res.status(500).json({ error: mensaje });
});

app.listen(PORT, async () => {
  console.log(`INFRAMEN funcionando en http://localhost:${PORT}`);
  const sim = (process.env.SIMULAR_FECHA_HORA || '').trim();
  if (sim) console.log(`>>> FECHA SIMULADA ACTIVA: ${sim}  (ponga # a SIMULAR_FECHA_HORA en .env para usar la real)`);
  else console.log(`>>> Usando la fecha real del equipo: ${new Date().toLocaleString('es')}`);
  const hf = (process.env.HORA_FIJA || '').trim();
  console.log(hf ? `>>> HORA_FIJA activa: ${hf} (hora de llegada de la ficha)` : '>>> HORA_FIJA NO está activa: la ficha usará la hora real.');
  try {
    await pool.query('SELECT 1');
    console.log('Conexión a MySQL correcta.');
  } catch (err) {
    console.error(`No se pudo conectar a MySQL (${err.code || err.message}).`);
    console.error('Revise que MySQL esté encendido y los datos del archivo .env.');
  }
});