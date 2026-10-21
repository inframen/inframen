// Funciones de fecha, hora y cálculo de retardo.

const dos = (n) => String(n).padStart(2, '0');

// Fecha y hora actual. Si SIMULAR_FECHA_HORA está activa en .env, se usa esa (para pruebas);
// si tiene # al inicio, se usa la fecha y hora reales del equipo.
function ahora() {
  const simulada = (process.env.SIMULAR_FECHA_HORA || '').trim();
  if (simulada) {
    const d = new Date(simulada.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d;
  }
  // HORA_FIJA=13:00 -> usa el DÍA real de la computadora, pero con esa hora de llegada (para pruebas)
  const fija = /^(\d{1,2}):(\d{2})$/.exec((process.env.HORA_FIJA || '').trim());
  if (fija) {
    const d = new Date();
    d.setHours(Number(fija[1]), Number(fija[2]), 0, 0);
    return d;
  }
  return new Date();
}

// "2026-10-09 07:42:00" (formato de MySQL, hora local)
function aSql(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ` +
    `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

// "09/10/2026"
function fechaCorta(d) {
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// De "07:42:00" a "07:42 a. m."
function hora12DesdeTexto(texto) {
  const [h, m] = String(texto).split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dos(h12)}:${dos(m)} ${sufijo}`;
}

function hora12(d) {
  return hora12DesdeTexto(`${d.getHours()}:${d.getMinutes()}`);
}

function minutosDesdeTexto(texto) {
  const [h, m] = String(texto).split(':').map(Number);
  return h * 60 + m;
}

// Decide si el estudiante llegó puntual o tarde.
// horario: { hora_entrada: "07:00:00", hora_salida: "12:00:00", tolerancia_min: 0 }
function evaluarIngreso(fecha, horario) {
  const llegada = fecha.getHours() * 60 + fecha.getMinutes();
  const entrada = minutosDesdeTexto(horario.hora_entrada);
  const tolerancia = Number(horario.tolerancia_min) || 0;

  if (llegada <= entrada + tolerancia) return { estado: 'PUNTUAL', minutos: 0 };
  return { estado: 'TARDE', minutos: llegada - entrada };
}

// "Segundo año" + "B"  ->  "2.º B"
const ORDINALES = {
  primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4,
  quinto: 5, sexto: 6, septimo: 7, séptimo: 7, octavo: 8, noveno: 9,
};
function gradoCorto(grado, seccion) {
  const primera = String(grado).trim().split(/\s+/)[0].toLowerCase();
  const n = ORDINALES[primera];
  return n ? `${n}.º ${seccion}` : `${grado} ${seccion}`;
}

module.exports = {
  ahora, aSql, fechaCorta, hora12, hora12DesdeTexto, evaluarIngreso, gradoCorto,
};