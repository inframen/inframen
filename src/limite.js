// Límite de intentos fallidos de inicio de sesión (protege contra adivinar contraseñas).
// Se guarda en memoria: al reiniciar el servidor se vacía, y es suficiente para este proyecto.
const MAX_INTENTOS = 5;
const VENTANA_MS = 10 * 60 * 1000; // 5 fallos en 10 minutos bloquean 10 minutos

const intentos = new Map(); // clave -> { n, desde, hasta }

function estado(clave, ahora = Date.now()) {
  const x = intentos.get(clave);
  if (!x) return { bloqueado: false };
  if (x.hasta && x.hasta > ahora) return { bloqueado: true, minutos: Math.ceil((x.hasta - ahora) / 60000) };
  if (ahora - x.desde > VENTANA_MS) intentos.delete(clave);
  return { bloqueado: false };
}

function fallo(clave, ahora = Date.now()) {
  let x = intentos.get(clave);
  if (!x || ahora - x.desde > VENTANA_MS) x = { n: 0, desde: ahora, hasta: 0 };
  x.n += 1;
  if (x.n >= MAX_INTENTOS) x.hasta = ahora + VENTANA_MS;
  intentos.set(clave, x);
}

function exito(clave) {
  intentos.delete(clave);
}

// Limpieza ocasional para que el mapa no crezca sin fin
setInterval(() => {
  const ahora = Date.now();
  for (const [k, x] of intentos) if (ahora - x.desde > VENTANA_MS && (!x.hasta || x.hasta < ahora)) intentos.delete(k);
}, 15 * 60 * 1000).unref();

module.exports = { estado, fallo, exito, MAX_INTENTOS };