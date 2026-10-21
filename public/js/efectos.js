// Efectos visuales de INFRAMEN: pantalla de carga, brasas, reflejo del cursor, pie de página y tipografía.
// Para quitarlos todos: borre este archivo y la línea que lo carga en comun.js.
(() => {
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const movil = matchMedia('(max-width: 760px)').matches;
  const e = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x) n.textContent = x; return n; };

  // Tipografía profesional (sin internet se usa Segoe UI)
  const fuente = document.createElement('link');
  fuente.rel = 'stylesheet';
  fuente.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.append(fuente);

  // Pantalla de carga con el alacrán (solo la primera vez de cada sesión)
  if (!reducir && !sessionStorage.getItem('splash')) {
    sessionStorage.setItem('splash', '1');
    const s = e('div', 'splash'), img = document.createElement('img');
    img.src = '/img/alacran.png'; img.alt = '';
    s.append(img, e('b', null, 'INFRAMEN'), e('i'));
    document.body.append(s);
    setTimeout(() => s.classList.add('fuera'), 1100);
    setTimeout(() => s.remove(), 1800);
  }

  // Brasas que suben flotando por el fondo
  if (!reducir) {
    const c = e('canvas', 'brasas'), g = c.getContext('2d'), ps = [];
    let w, h, col = '255,45,61', n = 0;
    document.body.prepend(c);
    const ajustar = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    const nueva = (ini) => ({ x: Math.random() * w, y: ini ? Math.random() * h : h + 10, r: Math.random() * 2.2 + 0.6, v: Math.random() * 0.6 + 0.2, d: (Math.random() - 0.5) * 0.4, a: Math.random() * 0.6 + 0.2 });
    ajustar();
    addEventListener('resize', ajustar);
    for (let i = 0; i < (movil ? 22 : 48); i++) ps.push(nueva(true));
    (function dibujar() {
      if (n++ % 90 === 0) col = getComputedStyle(document.documentElement).getPropertyValue('--rgb').trim() || col;
      g.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.v; p.x += p.d + Math.sin(p.y / 40) * 0.2; p.a -= 0.0008;
        if (p.y < -10 || p.a <= 0) Object.assign(p, nueva(false));
        g.beginPath();
        g.fillStyle = `rgba(${col},${p.a})`;
        g.shadowColor = `rgb(${col})`;
        g.shadowBlur = 8;
        g.arc(p.x, p.y, p.r, 0, 6.283);
        g.fill();
      }
      requestAnimationFrame(dibujar);
    })();
  }

  // Reflejo de luz que sigue al cursor sobre las tarjetas
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target.closest && ev.target.closest('.panel,.kpi,.ficha,.dato,.tabla-caja,.filtros');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ev.clientX - r.left + 'px');
    el.style.setProperty('--my', ev.clientY - r.top + 'px');
  });

  // Encabezado que se compacta al bajar
  const enc = document.querySelector('.encabezado');
  if (enc) addEventListener('scroll', () => enc.classList.toggle('compacto', scrollY > 24), { passive: true });

  // Pie de página institucional
  if (!document.querySelector('.login')) {
    const pie = e('footer', 'pie');
    pie.append(e('i', 'pie__punto'), document.createTextNode(`INFRAMEN · Instituto Nacional General Francisco Menéndez · ${new Date().getFullYear()}`));
    document.body.append(pie);
  }
})();