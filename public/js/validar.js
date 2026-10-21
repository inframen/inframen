const caja = document.getElementById('nie');
const btn = document.getElementById('btn-validar');
const celdas = [];
const previa = document.createElement('div');
previa.className = 'previa';
previa.hidden = true;
caja.after(previa);
let pedido = 0;

const valor = () => celdas.map((c) => c.value).join('');
const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };

// Vista previa: foto y nombre apenas se completan los 8 dígitos
async function verPrevia() {
  const nie = valor();
  const n = ++pedido;
  if (nie.length !== 8) { previa.hidden = true; return; }
  try {
    const e = await api('/api/estudiante/' + nie);
    if (n !== pedido) return;
    const foto = nodo('div', 'previa__foto', e.fotoUrl ? '' : e.nombre.charAt(0));
    if (e.fotoUrl) foto.style.backgroundImage = `url("${encodeURI(e.fotoUrl)}")`;
    const txt = nodo('div');
    txt.append(nodo('b', null, e.nombre), nodo('small', null, e.grado + (e.activo ? '' : ' · INACTIVO')));
    previa.className = 'previa';
    previa.replaceChildren(foto, txt);
  } catch (err) {
    if (n !== pedido) return;
    previa.className = 'previa previa--no';
    previa.replaceChildren(document.createTextNode(err.message));
  }
  previa.hidden = false;
}

function limpiar() {
  celdas.forEach((c) => { c.value = ''; c.classList.remove('lleno'); });
  caja.classList.remove('error');
  previa.hidden = true;
  pedido++;
  mensaje('');
  celdas[0].focus();
}

for (let i = 0; i < 8; i++) {
  const c = document.createElement('input');
  c.className = 'nie__d';
  c.type = 'text';
  c.inputMode = 'numeric';
  c.maxLength = 1;
  c.autocomplete = 'off';
  c.setAttribute('aria-label', 'Dígito ' + (i + 1));
  c.addEventListener('input', () => {
    c.value = c.value.replace(/\D/g, '');
    c.classList.toggle('lleno', !!c.value);
    caja.classList.remove('error');
    if (c.value && i < 7) celdas[i + 1].focus();
    verPrevia();
  });
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !c.value && i > 0) { celdas[i - 1].value = ''; celdas[i - 1].classList.remove('lleno'); celdas[i - 1].focus(); verPrevia(); }
    if (e.key === 'ArrowLeft' && i > 0) celdas[i - 1].focus();
    if (e.key === 'ArrowRight' && i < 7) celdas[i + 1].focus();
    if (e.key === 'Enter') validar();
  });
  c.addEventListener('paste', (e) => {
    const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 8);
    if (!t) return;
    e.preventDefault();
    [...t].forEach((d, k) => { celdas[k].value = d; celdas[k].classList.add('lleno'); });
    celdas[Math.min(t.length, 7)].focus();
    verPrevia();
  });
  caja.appendChild(c);
  celdas.push(c);
}
celdas[0].focus();

async function validar() {
  const nie = valor();
  mensaje('');
  if (nie.length !== 8) {
    caja.classList.remove('error'); void caja.offsetWidth; caja.classList.add('error');
    return mensaje('El NIE debe tener exactamente 8 números.');
  }
  btn.disabled = true;
  btn.textContent = 'Validando...';
  try {
    await post('/api/validar', { nie });
    location.href = '/resultado';
  } catch (err) {
    caja.classList.remove('error'); void caja.offsetWidth; caja.classList.add('error');
    mensaje(err.message);
    btn.disabled = false;
    btn.textContent = 'Validar';
  }
}
btn.addEventListener('click', validar);

// Atajo: Esc borra el NIE · el alacrán sigue el cursor
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') limpiar(); });
document.addEventListener('mousemove', (e) => {
  const img = document.querySelector('.escudo img');
  if (!img) return;
  const x = (e.clientX / innerWidth - 0.5) * 16, y = (e.clientY / innerHeight - 0.5) * 10;
  img.style.transform = `translate(${x}px,${y}px) rotate(${x / 3}deg)`;
});

async function reloj() {
  try {
    const h = await api('/api/hora');
    const [dd, mm, aa] = h.fecha.split('/').map(Number);
    const larga = new Date(aa, mm - 1, dd).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('pie-hora').textContent = `${larga.charAt(0).toUpperCase() + larga.slice(1)}  ·  ${h.hora}`;
  } catch (e) { /* se reintenta */ }
}
reloj();
setInterval(reloj, 20000);