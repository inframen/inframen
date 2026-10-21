const $ = (id) => document.getElementById(id);
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLS = ['id', 'nie', 'estudiante', 'grado', 'llegada', 'retardo'];
let datos = [], orden = { k: 'id', d: 1 }, admin = false, tm;

const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };
const opcion = (valor, texto) => { const o = document.createElement('option'); o.value = valor; o.textContent = texto; return o; };

function consulta() {
  const p = new URLSearchParams();
  if ($('buscar').value.trim()) p.set('buscar', $('buscar').value.trim());
  if ($('grado').value) p.set('grado', $('grado').value);
  if ($('mes').value) p.set('mes', $('mes').value);
  return p.toString();
}

function fila(r, i) {
  const tr = nodo('tr', 'fila');
  tr.style.setProperty('--i', Math.min(i, 20));
  ['Fecha', 'NIE', 'Estudiante', 'Grado', 'Llegada'].forEach((l, k) => {
    const c = nodo('td', null, [r.fecha, r.nie, r.estudiante, r.grado, r.llegada][k]);
    c.dataset.l = l;
    tr.appendChild(c);
  });
  const td = nodo('td');
  td.dataset.l = 'Retardo';
  td.appendChild(nodo('span', 'pildora ' + (r.retardo >= 30 ? 'pildora--grave' : r.retardo >= 15 ? 'pildora--medio' : 'pildora--leve'), r.retardo + ' min'));
  tr.appendChild(td);

  // Clic en la fila: se despliega el motivo (y "Anular" si es administrador)
  tr.addEventListener('click', async () => {
    const sig = tr.nextElementSibling;
    if (sig && sig.classList.contains('detalle')) return sig.remove();
    const dt = nodo('tr', 'detalle'), c = nodo('td');
    c.colSpan = 6; dt.append(c); tr.after(dt);
    try {
      const x = await api('/api/ingreso/' + r.id);
      const caja = nodo('div', 'det'), foto = nodo('div', 'det__foto');
      if (x.fotoUrl) foto.style.backgroundImage = `url("${encodeURI(x.fotoUrl)}")`;
      caja.append(foto, nodo('p', null, x.observacion ? 'Motivo: ' + x.observacion : 'Sin motivo registrado.'));
      const pv = nodo('a', 'boton boton--secundario boton--mini', 'Ver perfil');
      pv.href = '/perfil?nie=' + r.nie;
      pv.addEventListener('click', (ev) => ev.stopPropagation());
      caja.append(pv);
      if (admin) {
        const be = nodo('button', 'boton boton--secundario boton--mini', 'Editar motivo');
        be.type = 'button';
        be.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const nuevo = prompt(`Motivo del retardo de ${r.estudiante} (${r.fecha}):`, x.observacion || '');
          if (nuevo === null) return;
          try { await api('/api/ingreso/' + r.id, { method: 'PUT', body: JSON.stringify({ observacion: nuevo }) }); cargar(); } catch (err) { mensaje(err.message); }
        });
        caja.append(be);
        const b = nodo('button', 'boton boton--secundario boton--mini', 'Anular ingreso');
        b.type = 'button';
        b.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!confirm(`¿Anular el retardo de ${r.estudiante} del ${r.fecha}? No se puede deshacer.`)) return;
          try { await api('/api/ingreso/' + r.id, { method: 'DELETE' }); cargar(); } catch (err) { mensaje(err.message); }
        });
        caja.append(b);
      }
      c.replaceChildren(caja);
    } catch (err) { c.textContent = err.message; }
  });
  return tr;
}

function pintar() {
  document.querySelectorAll('thead th').forEach((th) => th.classList.remove('asc', 'desc'));
  const th = document.querySelector(`thead th[data-k="${orden.k}"]`);
  if (th) th.classList.add(orden.d > 0 ? 'asc' : 'desc');
  const v = [...datos].sort((a, b) =>
    (typeof a[orden.k] === 'number' ? a[orden.k] - b[orden.k] : String(a[orden.k]).localeCompare(String(b[orden.k]))) * orden.d);
  const cuerpo = $('cuerpo');
  cuerpo.replaceChildren();
  if (!v.length) {
    const tr = nodo('tr'), td = nodo('td', 'vacio', 'No hay retardos con esos filtros.');
    td.colSpan = 6; tr.append(td); cuerpo.append(tr);
    $('resumen').textContent = '';
    return;
  }
  v.forEach((r, i) => cuerpo.appendChild(fila(r, i)));
  const total = v.reduce((s, r) => s + r.retardo, 0);
  $('resumen').replaceChildren(nodo('b', null, v.length), ' retardos · ', nodo('b', null, total), ' minutos acumulados · toque una fila para ver el motivo');
}

async function cargar() {
  mensaje('');
  try {
    datos = (await api('/api/historial?' + consulta())).registros;
    pintar();
  } catch (err) { mensaje(err.message); }
}

(async () => {
  const p = new URLSearchParams(location.search);
  const u = await usuarioActual;
  admin = !!u && u.rol === 'ADMINISTRADOR';
  $('mes').appendChild(opcion('', 'Mes: Todos'));
  MESES.forEach((m, i) => $('mes').appendChild(opcion(i + 1, m)));
  $('mes').value = p.get('mes') || new Date().getMonth() + 1;
  try { (await api('/api/grados')).forEach((g) => $('grado').appendChild(opcion(g, g))); } catch (e) { /* queda en Todos */ }
  if (p.get('grado')) $('grado').value = p.get('grado');
  document.querySelectorAll('thead th').forEach((th, i) => {
    th.dataset.k = COLS[i];
    th.addEventListener('click', () => { orden = { k: COLS[i], d: orden.k === COLS[i] ? -orden.d : 1 }; pintar(); });
  });
  cargar();
})();

// Filtros en vivo
$('filtros').addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
$('buscar').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(cargar, 250); });
$('grado').addEventListener('change', cargar);
$('mes').addEventListener('change', cargar);
$('btn-exportar').addEventListener('click', () => { location.href = '/api/historial/exportar?' + consulta(); });

// Registro general en PDF (con los filtros actuales; para ver todo, elija "Mes: Todos")
const bPdf = nodo('button', 'boton boton--secundario', 'Exportar PDF');
bPdf.type = 'button';
bPdf.addEventListener('click', () => { location.href = '/api/reportes/general?' + consulta(); });
$('btn-exportar').after(bPdf);