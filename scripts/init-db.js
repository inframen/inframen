// Crea la base de datos "inframen", las 5 tablas y los datos de ejemplo.
// Uso:  npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    await conexion.query(sql);
    console.log('Base de datos "inframen" lista (tablas y datos de ejemplo creados).');
    console.log('Usuarios de prueba:  docente01 / Docente2026   y   admin / Admin2026');
  } finally {
    await conexion.end();
  }
}

main().catch((err) => {
  console.error('No se pudo preparar la base de datos:');
  console.error(err.code ? `${err.code}: ${err.message}` : err);
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Revise DB_USER y DB_PASSWORD en el archivo .env');
  }
  if (err.code === 'ECONNREFUSED') {
    console.error('MySQL no está encendido. Inicie el servicio de MySQL e intente de nuevo.');
  }
  process.exit(1);
});