require('dotenv').config();
const mysql = require('mysql2/promise');

// Conexión a MySQL. Los datos salen del archivo .env
// En un servidor remoto (como TiDB Cloud) se activa la conexión segura (SSL)
const remoto = process.env.DB_HOST && !['localhost', '127.0.0.1'].includes(process.env.DB_HOST);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inframen',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  // Fechas y horas llegan como texto ("2026-10-09 07:42:00"), sin cambios de zona horaria
  dateStrings: true,
  ssl: remoto ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
});

module.exports = pool;
