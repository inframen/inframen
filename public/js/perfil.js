const $ = (id) => document.getElementById(id);
const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };

function contar(el, fin, suf = '') {
  const t0 = performance.now();
  (function paso(t) {
    const p = Math.min(1, (t - t0) / 900);
    el.textContent = Math.round(fin * (1 - Math.pow(1 - p, 3))) + suf;
    if (p < 1) requestAnimationFrame(paso);
  })(t0);
}

(async () => {
  const nie = new URLSearchParams(location.search).get('nie') || '';
  try {
    const p = await api(location.pathname === '/mi-ficha' ? '/api/mi-ficha' : '/api/perfil/' + encodeURIComponent(nie));
    $('p-nombre').textContent = p.nombre;
    $('p-nie').textContent = 'NIE: ' + p.nie;
    $('p-grado').textContent = p.grado;
    const f = $('p-foto');
    if (p.fotoUrl) f.style.backgroundImage = `url("${encodeURI(p.fotoUrl)}")`; else f.textContent = p.nombre.charAt(0);

    contar($('k-ing'), p.total); contar($('k-pct'), p.pct, '%'); contar($('k-racha'), p.racha); contar($('k-mes'), p.retardosMes);

    $('p-ins').replaceChildren(...(p.insignias.length
      ? p.insignias.map((i) => { const s = nodo('span', 'ins' + (i.mal ? ' mal' : ''), i.n); s.title = i.d; return s; })
      : [nodo('span', 'vacio', 'Aún sin insignias')]));

    const bp = nodo('a', 'boton boton--secundario boton--mini', 'Descargar PDF');
    bp.href = location.pathname === '/mi-ficha' ? '/api/mi-ficha/pdf' : '/api/reportes/estudiante/' + encodeURIComponent(p.nie);
    bp.style.marginTop = '14px';
    $('p-ins').after(bp);

    $('motivos').replaceChildren(...(p.motivos.length ? p.motivos.map((m) => {
      const li = nodo('li'), x = nodo('div', null, m.motivo);
      li.append(x, nodo('b', null, m.n + (m.n === 1 ? ' vez' : ' veces')));
      return li;
    }) : [nodo('p', 'vacio', 'Sin motivos registrados.')]));

    // Notas del personal (el formulario solo aparece para docentes y administradores)
    const pintarNotas = (lista) => $('notas').replaceChildren(...(lista.length ? lista.map((n) => {
      const it = nodo('div', 'nota'), cab = nodo('div', 'nota__cab');
      cab.append(nodo('b', null, n.autor + (n.rol ? ' · ' + n.rol : '')), nodo('small', null, `${n.fecha} · ${n.hora}`));
      it.append(cab, nodo('p', null, n.texto));
      if (n.puedeBorrar) {
        const b = nodo('button', 'enlace-btn', 'Eliminar');
        b.type = 'button';
        b.addEventListener('click', async () => {
          if (!confirm('¿Eliminar esta nota?')) return;
          try { pintarNotas((await api('/api/notas/' + n.id, { method: 'DELETE' })).notas); } catch (err) { mensaje(err.message); }
        });
        it.append(b);
      }
      return it;
    }) : [nodo('p', 'vacio', 'Sin notas registradas.')]));
    pintarNotas(p.notas || []);

    const fn = $('form-nota');
    if (fn && p.puedeEscribir) {
      fn.hidden = false;
      if (p.tardeSeguidos >= 3) {
        const av = $('aviso-nota');
        av.textContent = `Lleva ${p.tardeSeguidos} ingresos seguidos con retardo. Puede dejar una nota informándolo.`;
        av.hidden = false;
      }
      $('nota-plantilla').addEventListener('click', () => {
        const t = $('nota-texto');
        t.value = (t.value ? t.value.trimEnd() + ' ' : '') + 'El estudiante llega tarde todos los días.';
        t.focus();
      });
      fn.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const m = $('msg-nota'), t = $('nota-texto');
        const mostrar = (x, tipo) => { m.textContent = x; m.className = 'mensaje mensaje--' + tipo; m.hidden = false; };
        try {
          const r = await post('/api/estudiantes/' + encodeURIComponent(p.nie) + '/notas', { texto: t.value });
          t.value = '';
          pintarNotas(r.notas);
          mostrar('Nota guardada.', 'ok');
        } catch (err) { mostrar(err.message, 'error'); }
      });
    }

    $('tl').replaceChildren(...(p.linea.length ? p.linea.map((r, i) => {
      const it = nodo('div', 'tl__i' + (r.estado === 'TARDE' ? ' tarde' : ''));
      it.style.animationDelay = i * 40 + 'ms';
      const detalle = r.estado === 'TARDE'
        ? `Tarde · ${r.minutos} min${r.observacion ? ' · ' + r.observacion : ''}`
        : 'Puntual';
      it.append(nodo('b', null, `${r.fecha} · ${r.hora}`), nodo('small', null, detalle));
      return it;
    }) : [nodo('p', 'vacio', 'Todavía no tiene ingresos.')]));
  } catch (err) {
    $('p-nombre').textContent = 'Sin datos';
    mensaje(err.message);
  }
})();

// Cambiar contraseña (solo existe en la pantalla "Mi ficha")
const formClave = document.getElementById('form-clave');
if (formClave) {
  formClave.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const m = $('msg-clave');
    const mostrar = (t, tipo) => { m.textContent = t; m.className = 'mensaje mensaje--' + tipo; m.hidden = false; };
    if ($('c-nueva').value !== $('c-nueva2').value) return mostrar('Las contraseñas nuevas no coinciden.', 'error');
    try {
      await post('/api/cambiar-clave', { actual: $('c-actual').value, nueva: $('c-nueva').value });
      formClave.reset();
      mostrar('Contraseña actualizada correctamente.', 'ok');
    } catch (err) { mostrar(err.message, 'error'); }
  });
}