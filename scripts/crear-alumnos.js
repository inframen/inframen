// Prepara la base de datos para el acceso de estudiantes y crea una cuenta por cada estudiante activo.
// Uso:  node scripts/crear-alumnos.js            (todos los que aún no tienen cuenta)
//       node scripts/crear-alumnos.js 19800492   (solo ese NIE; se pueden poner varios)
// Usuario del estudiante = su NIE. Las contraseñas se guardan en claves-alumnos.csv: entréguelas y borre el archivo.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (O/0, I/1)
const clave = () => Array.from(crypto.randomBytes(8), (b) => ALFABETO[b % ALFABETO.length]).join('');
const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function main() {
  const filtro = process.argv.slice(2).filter((n) => /^\d{8}$/.test(n));
  const base = process.env.DB_NAME || 'inframen';
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: base,
    charset: 'utf8mb4',
  });

  try {
    const [col] = await db.query(
      "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuario' AND COLUMN_NAME = 'nie'",
      [base]
    );
    if (!col[0].n) {
      await db.query("ALTER TABLE usuario MODIFY rol ENUM('ADMINISTRADOR','DOCENTE','CONTROL','ESTUDIANTE') NOT NULL");
      await db.query(
        'ALTER TABLE usuario ADD COLUMN nie CHAR(8) NULL, ' +
          'ADD CONSTRAINT fk_usuario_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie) ON UPDATE CASCADE ON DELETE SET NULL'
      );
      console.log('Tabla "usuario" actualizada (rol ESTUDIANTE y columna nie).');
    }

    let sql =
      "SELECT e.nie, e.nombres, e.apellidos, e.grado, e.seccion FROM estudiante e WHERE e.estado = 'ACTIVO' " +
      'AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.nombre_usuario = e.nie)';
    const params = [];
    if (filtro.length) {
      sql += ` AND e.nie IN (${filtro.map(() => '?').join(',')})`;
      params.push(...filtro);
    }
    const [alumnos] = await db.query(sql, params);

    const lineas = ['NIE,Estudiante,Grado,Contraseña'].map((l) => l);
    for (const a of alumnos) {
      const c = clave();
      const nombre = `${a.nombres} ${a.apellidos}`.trim();
      await db.query(
        "INSERT INTO usuario (nombre_usuario, nombre_completo, contrasena_hash, rol, activo, nie) VALUES (?, ?, ?, 'ESTUDIANTE', 1, ?)",
        [a.nie, nombre, await bcrypt.hash(c, 10), a.nie]
      );
      lineas.push([a.nie, nombre, `${a.grado} ${a.seccion}`, c].map(celda).join(','));
    }

    if (!alumnos.length) return console.log('No hay estudiantes nuevos: todos ya tienen cuenta.');
    const archivo = path.join(__dirname, '..', 'claves-alumnos.csv');
    fs.writeFileSync(archivo, '\uFEFF' + lineas.join('\r\n'));
    console.log(`Cuentas creadas: ${alumnos.length}. Contraseñas en: ${archivo}`);
    console.log('Entregue las contraseñas a cada estudiante y luego borre ese archivo.');
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('No se pudieron crear las cuentas:');
  console.error(err.code ? `${err.code}: ${err.message}` : err);
  process.exit(1);
});