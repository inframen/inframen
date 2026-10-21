// Genera (o regenera) todos los PDF y los guarda en la carpeta "reportes":
//   reportes/registro-general.pdf   y   reportes/fichas/<NIE>-<apellido>.pdf
// Uso:  node scripts/generar-pdfs.js
require('dotenv').config({ override: true });
const pool = require('../src/db');
const R = require('../src/reportes');

R.guardarTodos()
  .then((n) => console.log(`Listo: ${n} fichas y el registro general guardados en ${R.CARPETA}`))
  .catch((err) => { console.error('No se pudieron generar los PDF:', err.code ? `${err.code}: ${err.message}` : err); process.exitCode = 1; })
  .finally(() => pool.end());