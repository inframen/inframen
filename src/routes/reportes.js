// Descarga de reportes en PDF: ficha de un estudiante y registro general.
// (Si su proyecto ya tiene este archivo, conserve el suyo.)
const express = require('express');
const V = require('../validaciones');
const R = require('../reportes');

const router = express.Router();

function enviarPdf(res, nombre, contenido) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.send(Buffer.from(contenido));
}

// Ficha de un estudiante (la usa el personal desde el perfil)
router.get('/reportes/estudiante/:nie', async (req, res) => {
  const n = V.nie(req.params.nie);
  if (n.error) return res.status(400).json({ error: n.error });
  const datos = await R.datosEstudiante(n.valor);
  if (!datos) return res.status(404).json({ error: 'No existe ese estudiante.' });
  enviarPdf(res, `ficha-${n.valor}.pdf`, R.pdfEstudiante(datos));
});

// Registro general de ingresos, con los mismos filtros del historial (buscar, grado, mes)
router.get('/reportes/general', async (req, res) => {
  enviarPdf(res, 'registro-general.pdf', R.pdfGeneral(await R.datosGeneral(req.query)));
});

// "Mi ficha" en PDF: el estudiante solo puede descargar la suya (el NIE sale de la sesión)
router.miFicha = async (req, res) => {
  const datos = await R.datosEstudiante(req.session.usuario.nie);
  if (!datos) return res.status(404).json({ error: 'No se encontró su ficha.' });
  enviarPdf(res, `mi-ficha-${datos.nie}.pdf`, R.pdfEstudiante(datos));
};

module.exports = router;