const esEstudiante = (req) => !!(req.session && req.session.usuario && req.session.usuario.rol === 'ESTUDIANTE');

// Para las rutas de la API: responde 401 si no hay sesión iniciada
function requiereSesionApi(req, res, next) {
  if (req.session && req.session.usuario) return next();
  return res.status(401).json({ error: 'Su sesión terminó. Inicie sesión de nuevo.' });
}

// Para las páginas: manda al inicio de sesión si no hay sesión iniciada
function requiereSesionPagina(req, res, next) {
  if (req.session && req.session.usuario) return next();
  return res.redirect('/');
}

// Los estudiantes no pueden usar las pantallas ni la API del personal
function soloPersonalApi(req, res, next) {
  if (!esEstudiante(req)) return next();
  return res.status(403).json({ error: 'Esta sección es solo para el personal.' });
}
function soloPersonalPagina(req, res, next) {
  if (!esEstudiante(req)) return next();
  return res.redirect('/mi-ficha');
}

// Pantalla y API exclusivas de los estudiantes
function soloEstudianteApi(req, res, next) {
  const u = req.session && req.session.usuario;
  if (u && u.rol === 'ESTUDIANTE' && u.nie) return next();
  return res.status(403).json({ error: 'Esta sección es solo para estudiantes.' });
}
function soloEstudiantePagina(req, res, next) {
  if (esEstudiante(req)) return next();
  return res.redirect('/validar');
}

// Administración (usuarios y estudiantes): solo el rol ADMINISTRADOR
const esAdmin = (req) => !!(req.session && req.session.usuario && req.session.usuario.rol === 'ADMINISTRADOR');
function soloAdminApi(req, res, next) {
  if (esAdmin(req)) return next();
  return res.status(403).json({ error: 'Solo el administrador puede hacer esto.' });
}
function soloAdminPagina(req, res, next) {
  if (esAdmin(req)) return next();
  return res.redirect('/validar');
}

module.exports = {
  requiereSesionApi, requiereSesionPagina,
  soloPersonalApi, soloPersonalPagina, soloEstudianteApi, soloEstudiantePagina,
  soloAdminApi, soloAdminPagina,
};