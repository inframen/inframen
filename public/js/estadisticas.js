const $ = (id) => document.getElementById(id);
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let primera = true;

const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };

function contar(el, fin, suf = '') {
  if (!primera) { el.textContent = fin + suf; return; }
  const t0 = performance.now();
  (function paso(t) {
    const p = Math.min(1, (t - t0) / 900);
    el.textContent = Math.round(fin * (1 - Math.pow(1 - p, 3))) + suf;
    if (p < 1) requestAnimationFrame(paso);
  })(t0);
}

async function cargar() {
  let d;
  try { d = await api('/api/estadisticas'); } catch (err) { return mensaje(err.message); }
  const crece = (el, prop, valor) => setTimeout(() => { el.style[prop] = valor; }, primera ? 150 : 0);

  $('mes-txt').textContent = `${MESES[d.mes - 1]} ${d.anio}`;
  const pun = d.total ? Math.round(((d.total - d.tardes) / d.total) * 100) : 0;
  contar($('k-total'), d.total); contar($('k-pun'), pun, '%'); contar($('k-tarde'), d.tardes);
  $('donut-txt').textContent = pun + '%';
  crece($('donut'), 'strokeDashoffset', 326.7 * (1 - pun / 100));

  const max = Math.max(1, ...d.porDia);
  $('dias').replaceChildren(...['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((n, i) => {
    const c = nodo('div', 'col'), w = nodo('div', 'col__b'), b = nodo('i');
    b.style.height = '0%'; crece(b, 'height', (d.porDia[i] / max) * 100 + '%');
    w.append(b); c.append(nodo('span', 'col__n', d.porDia[i]), w, nodo('small', null, n));
    return c;
  }));

  const mg = Math.max(1, ...d.grados.map((g) => g.n));
  $('grados').replaceChildren(...(d.grados.length ? d.grados.map((g) => {
    const a = nodo('a', 'hbar'), i = nodo('i');
    a.href = `/historial?grado=${encodeURIComponent(g.grado)}&mes=${d.mes}`;
    i.style.width = '0%'; crece(i, 'width', (g.n / mg) * 100 + '%');
    a.append(nodo('span', null, g.grado), i, nodo('b', null, g.n));
    return a;
  }) : [nodo('p', 'vacio', 'Sin retardos este mes.')]));

  // Calendario de calor (lunes a domingo)
  const cal = $('cal'), dias = new Date(d.anio, d.mes, 0).getDate();
  const desfase = (new Date(d.anio, d.mes - 1, 1).getDay() + 6) % 7;
  cal.replaceChildren(...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => nodo('span', null, x)));
  for (let k = 0; k < desfase; k++) cal.append(nodo('span'));
  for (let n = 1; n <= dias; n++) {
    const t = d.calendario[n] || 0, c = nodo('i', t ? 'c' + Math.min(4, t > 4 ? 4 : t) : '', n);
    c.title = `${n} de ${MESES[d.mes - 1]}: ${t} retardo${t === 1 ? '' : 's'}`;
    cal.append(c);
  }

  $('rank').replaceChildren(...(d.top.length ? d.top.map((r) => {
    const li = nodo('li'), x = nodo('div');
    const nom = nodo('a', 'enlace', r.nombre);
    nom.href = '/perfil?nie=' + r.nie;
    x.append(nom, nodo('small', null, `${r.grado} · ${r.mins} min acumulados`));
    li.append(x, nodo('b', null, r.n + ' ret.'));
    return li;
  }) : [nodo('p', 'vacio', 'Sin retardos este mes.')]));

  $('hoy').replaceChildren(...(d.hoy.length ? d.hoy.map((r) => {
    const f = nodo('div', 'hoy-i' + (r.estado === 'TARDE' ? ' tarde' : '')), x = nodo('div');
    x.append(nodo('b', null, r.nombre), nodo('small', null, `${r.grado} · ${r.estado === 'TARDE' ? 'Tarde' : 'Puntual'}`));
    f.append(x, nodo('span', null, r.hora));
    return f;
  }) : [nodo('p', 'vacio', 'Todavía no hay ingresos hoy.')]));
  $('liga').replaceChildren(...(d.liga.length ? d.liga.map((l, i) => {
    const li = nodo('li', i === 0 ? 'oro' : ''), x = nodo('div');
    x.append(nodo('b', null, (i === 0 ? '★ ' : '') + l.nombre), nodo('small', null, `${l.total} ingresos`));
    li.append(x, nodo('b', null, l.pct + '%'));
    return li;
  }) : [nodo('p', 'vacio', 'Sin ingresos este mes.')]));
  primera = false;
}
cargar();
setInterval(cargar, 20000);