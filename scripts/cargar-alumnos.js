// Carga 20 estudiantes de ejemplo (con horario y foto) y, si se pide, borra el registro de prueba.
// Uso:  node scripts/cargar-alumnos.js --borrar   (la primera vez: borra el registro y agrega los 20)
//       node scripts/cargar-alumnos.js            (agrega los que falten y actualiza fotos)
//       node scripts/cargar-alumnos.js --solo-fotos   (solo crea las imágenes, sin tocar la base de datos)
// Fotos: si pone una imagen con el NIE como nombre (por ejemplo 19734028.jpg) en public/img/alumnos,
// el sistema la usa en lugar del avatar. Después ejecute este script otra vez para actualizarla.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const BORRAR = ['19800492']; // registros que se eliminan con --borrar (con su cuenta e ingresos)

// [NIE, nombres, apellidos, grado, sección, mujer]  (personas ficticias)
const ALUMNOS = [
  ['19734028', 'Ana María', 'Hernández Flores', 'Primer año', 'A', true],
  ['20481563', 'Carlos Eduardo', 'Martínez Rivas', 'Primer año', 'B', false],
  ['21957304', 'Daniela Alejandra', 'Cruz Portillo', 'Primer año', 'A', true],
  ['18362049', 'José Luis', 'Ramírez Chávez', 'Primer año', 'B', false],
  ['20715836', 'Camila Sofía', 'Mejía Orellana', 'Primer año', 'A', true],
  ['19248670', 'Kevin Alexander', 'Pérez Guzmán', 'Primer año', 'B', false],
  ['21083495', 'Valeria Nicole', 'Argueta Campos', 'Primer año', 'A', true],
  ['18570916', 'Diego Armando', 'Rosales Vásquez', 'Segundo año', 'B', false],
  ['20396172', 'María Fernanda', 'López Menjívar', 'Segundo año', 'A', true],
  ['19861254', 'Óscar Daniel', 'Alvarado Cañas', 'Segundo año', 'B', false],
  ['21429780', 'Gabriela Estefany', 'Molina Rivera', 'Segundo año', 'A', true],
  ['18904367', 'Brandon Josué', 'Serrano Peña', 'Segundo año', 'B', false],
  ['20158743', 'Andrea Lizeth', 'Castillo Henríquez', 'Segundo año', 'A', true],
  ['19527081', 'Mauricio Antonio', 'Beltrán Solís', 'Segundo año', 'B', false],
  ['21670392', 'Paola Jazmín', 'Escobar Quintanilla', 'Tercer año', 'A', true],
  ['18213945', 'Fernando José', 'Aguilar Reyes', 'Tercer año', 'B', false],
  ['20842617', 'Karla Michelle', 'Ortiz Barrera', 'Tercer año', 'A', true],
  ['19076328', 'Roberto Enrique', 'Navarrete Díaz', 'Tercer año', 'B', false],
  ['21315806', 'Stephanie Abigail', 'Ventura Lara', 'Tercer año', 'A', true],
  ['18789450', 'Luis Gerardo', 'Cortez Amaya', 'Tercer año', 'B', false],
];

const CARPETA = path.join(__dirname, '..', 'public', 'img', 'alumnos');
const EXT = ['jpg', 'jpeg', 'png', 'webp', 'svg'];
const fotoDe = (nie) => {
  const e = EXT.find((x) => fs.existsSync(path.join(CARPETA, `${nie}.${x}`)));
  return e ? `/img/alumnos/${nie}.${e}` : null;
};

// Avatar ilustrado (se usa cuando todavía no hay una foto real)
const FONDOS = [['#5a0b16', '#1a0307'], ['#7a1020', '#220409'], ['#3b0a12', '#12030a'], ['#6b1a24', '#1f0a0d'], ['#4a0f1a', '#160509']];
const PIELES = ['#f1c9a5', '#e0a97d', '#c68b5e', '#a86c42', '#8a5532'];
const PELOS = ['#1c1410', '#2b1b12', '#3d2616', '#0f0f12', '#5a3a1e'];
function avatar(i, nombres, apellidos, mujer) {
  const [a, b] = FONDOS[i % 5], piel = PIELES[(i * 3) % 5], pelo = PELOS[(i * 2) % 5];
  const ini = (nombres[0] + apellidos[0]).toUpperCase();
  const atras = mujer ? `<path d="M88 150C84 80 120 62 150 62C180 62 216 80 212 150C212 200 226 250 238 290L62 290C74 250 88 200 88 150Z" fill="${pelo}"/>` : '';
  const tope = mujer
    ? `<path d="M94 150C96 96 124 84 150 84C176 84 204 96 206 150C190 120 110 120 94 150Z" fill="${pelo}"/>`
    : `<path d="M92 146C90 84 118 68 150 68C182 68 210 84 208 146C196 112 104 112 92 146Z" fill="${pelo}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="300" height="400" fill="url(#g)"/>${atras}` +
    `<path d="M30 400C30 308 88 270 150 270C212 270 270 308 270 400Z" fill="#1f2a44"/><path d="M118 272L150 318L182 272Z" fill="#f4f4f4"/>` +
    `<rect x="133" y="205" width="34" height="70" rx="14" fill="${piel}"/><ellipse cx="150" cy="158" rx="56" ry="66" fill="${piel}"/>${tope}` +
    `<circle cx="150" cy="357" r="24" fill="rgba(0,0,0,.35)"/><text x="150" y="366" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fff">${ini}</text></svg>`;
}
function crearImagenes() {
  fs.mkdirSync(CARPETA, { recursive: true });
  let n = 0;
  ALUMNOS.forEach(([nie, nombres, apellidos, , , mujer], i) => {
    if (fotoDe(nie)) return;
    fs.writeFileSync(path.join(CARPETA, `${nie}.svg`), avatar(i, nombres, apellidos, mujer));
    n++;
  });
  return n;
}

async function main() {
  const imagenes = crearImagenes();
  console.log(`Imágenes creadas en public/img/alumnos: ${imagenes}`);
  if (process.argv.includes('--solo-fotos')) return;

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inframen',
    charset: 'utf8mb4',
  });
  try {
    if (process.argv.includes('--borrar')) {
      for (const nie of BORRAR) {
        await db.query('DELETE FROM usuario WHERE nombre_usuario = ?', [nie]);
        await db.query('DELETE FROM ingreso WHERE nie = ?', [nie]); // sus fichas de retardo se borran solas
        const [r] = await db.query('DELETE FROM estudiante WHERE nie = ?', [nie]); // su horario se borra solo
        console.log(r.affectedRows ? `Registro ${nie} eliminado.` : `El registro ${nie} ya no existía.`);
      }
    }

    let nuevos = 0;
    for (const [nie, nombres, apellidos, grado, seccion] of ALUMNOS) {
      const [r] = await db.query(
        "INSERT IGNORE INTO estudiante (nie, nombres, apellidos, grado, seccion, foto_url, estado) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVO')",
        [nie, nombres, apellidos, grado, seccion, fotoDe(nie)]
      );
      nuevos += r.affectedRows;
      const horas = seccion === 'A' ? ['07:00:00', '12:00:00'] : ['13:00:00', '18:00:00']; // A = mañana, B = tarde
      for (let d = 1; d <= 5; d++) {
        await db.query(
          'INSERT IGNORE INTO horario (nie, dia_semana, hora_entrada, hora_salida, tolerancia_min) VALUES (?, ?, ?, ?, 0)',
          [nie, d, ...horas]
        );
      }
    }

    // Fotos: cualquier estudiante con un archivo llamado como su NIE usa esa imagen
    const [todos] = await db.query('SELECT nie FROM estudiante');
    let fotos = 0;
    for (const { nie } of todos) {
      const f = fotoDe(nie);
      if (f) { await db.query('UPDATE estudiante SET foto_url = ? WHERE nie = ?', [f, nie]); fotos++; }
    }
    console.log(`Estudiantes nuevos: ${nuevos}. Fotos asignadas: ${fotos}.`);
    console.log('Siguiente paso (opcional): node scripts/crear-alumnos.js  para crear sus cuentas de acceso.');
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('No se pudo cargar los estudiantes:');
  console.error(err.code ? `${err.code}: ${err.message}` : err);
  process.exit(1);
});