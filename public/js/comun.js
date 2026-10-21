document.documentElement.dataset.tema = localStorage.getItem('tema') || 'rojo';

// Color de la barra del navegador en el teléfono
function barra() {
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m); }
  m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0a0508';
}
barra();

// Efectos visuales (para quitarlos, borre este bloque y efectos.js)
{ const fx = document.createElement('script'); fx.src = '/js/efectos.js'; document.head.append(fx); }

async function api(url, opciones = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  let d = {};
  try { d = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (r.status === 401 && !url.endsWith('/login') && !url.endsWith('/yo')) location.href = '/';
  if (!r.ok) { const err = new Error(d.error || 'Ocurrió un error.'); err.status = r.status; throw err; }
  return d;
}

function mensaje(texto, tipo = 'error') {
  const m = document.getElementById('mensaje');
  if (!m) return;
  if (!texto) { m.hidden = true; return; }
  m.textContent = texto;
  m.className = 'mensaje mensaje--' + tipo;
  m.hidden = false;
}

const post = (url, cuerpo = {}) => api(url, { method: 'POST', body: JSON.stringify(cuerpo) });

// Usuario con sesión (null si no hay)
const usuarioActual = api('/api/yo').then((d) => d.usuario).catch(() => null);

// Sonido corto: agudo si fue puntual, grave si fue tarde
function sonar(ok) {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    (ok ? [660, 880] : [220, 165]).forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.14;
      o.type = ok ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.26);
    });
  } catch (e) { /* sin audio */ }
}

// Enlace "Estadísticas" en el menú de todas las pantallas
(() => {
  const menu = document.querySelector('.encabezado__menu');
  if (!menu || location.pathname === '/mi-ficha') return;
  const a = document.createElement('a');
  a.href = '/estadisticas';
  a.textContent = 'Estadísticas';
  if (location.pathname === '/estadisticas') a.setAttribute('aria-current', 'page');
  menu.insertBefore(a, document.getElementById('btn-salir'));
})();

// Enlace "Administración": solo lo ve el administrador
(async () => {
  const menu = document.querySelector('.encabezado__menu');
  if (!menu || location.pathname === '/mi-ficha') return;
  const u = await usuarioActual;
  if (!u || u.rol !== 'ADMINISTRADOR') return;
  const a = document.createElement('a');
  a.href = '/administracion';
  a.textContent = 'Administración';
  if (location.pathname === '/administracion') a.setAttribute('aria-current', 'page');
  const est = menu.querySelector('a[href="/estadisticas"]');
  if (est) est.after(a); else menu.insertBefore(a, document.getElementById('btn-salir'));
})();

// Voz de bienvenida al confirmar un ingreso
// Devuelve una promesa que se cumple cuando termina de hablar (o a los 8 segundos, por seguridad)
function hablar(texto) {
  return new Promise((resolve) => {
    if (localStorage.getItem('voz') === 'no') return resolve();
    try {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-ES';
      u.onend = u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(resolve, 8000);
    } catch (e) { resolve(); }
  });
}

// Botón de tema + paleta de búsqueda (Ctrl+K)
(() => {
  const menu = document.querySelector('.encabezado__menu');
  if (!menu || location.pathname === '/mi-ficha') return;
  const e = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x) n.textContent = x; return n; };
  const salir = document.getElementById('btn-salir');

  const TEMAS = ['rojo', 'azul', 'dorado'];
  const bt = e('button', 'mini');
  bt.type = 'button';
  bt.append(e('span', 'punto'), 'Tema');
  bt.addEventListener('click', () => {
    const t = TEMAS[(TEMAS.indexOf(document.documentElement.dataset.tema) + 1) % TEMAS.length];
    document.documentElement.dataset.tema = t;
    localStorage.setItem('tema', t);
    barra();
  });
  menu.insertBefore(bt, salir);

  const ov = e('div', 'paleta'), caja = e('div', 'paleta__caja'), inp = e('input'), lista = e('div');
  ov.hidden = true;
  inp.placeholder = 'Buscar estudiante por nombre o NIE, o ir a...';
  caja.append(inp, lista); ov.append(caja); document.body.append(ov);
  const ir = [['Validar ingreso', '/validar'], ['Historial de retardos', '/historial'], ['Estadísticas', '/estadisticas']];
  usuarioActual.then((u) => { if (u && u.rol === 'ADMINISTRADOR') ir.push(['Administración', '/administracion']); });
  const pintar = (items) => lista.replaceChildren(...items.map(([t, s, h]) => {
    const a = e('a', 'paleta__it'); a.href = h; a.append(e('b', null, t), e('small', null, s)); return a;
  }));
  const inicio = () => pintar(ir.map(([t, h]) => [t, 'Ir a la pantalla', h]));
  const abrir = () => { ov.hidden = false; inp.value = ''; inicio(); inp.focus(); };
  let tm;
  inp.addEventListener('input', () => {
    clearTimeout(tm);
    tm = setTimeout(async () => {
      const q = inp.value.trim();
      if (q.length < 2) return inicio();
      try {
        const r = await api('/api/buscar?q=' + encodeURIComponent(q));
        pintar(r.length ? r.map((x) => [x.nombre, `NIE ${x.nie} · ${x.grado}`, '/perfil?nie=' + x.nie]) : [['Sin resultados', 'Pruebe con otro nombre o NIE', '#']]);
      } catch (err) { /* se ignora */ }
    }, 200);
  });
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const a = lista.querySelector('a'); if (a) a.click(); } });
  ov.addEventListener('click', (ev) => { if (ev.target === ov) ov.hidden = true; });
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); ov.hidden ? abrir() : (ov.hidden = true); }
    if (ev.key === 'Escape' && !ov.hidden) { ov.hidden = true; ev.stopImmediatePropagation(); }
  }, true);
})();

const btnSalir = document.getElementById('btn-salir');
if (btnSalir) {
  btnSalir.addEventListener('click', async () => {
    try { await post('/api/logout'); } finally { location.href = '/'; }
  });
}