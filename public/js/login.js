document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-entrar');
  mensaje('');
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  try {
    const r = await post('/api/login', {
      usuario: document.getElementById('usuario').value,
      clave: document.getElementById('clave').value,
    });
    btn.textContent = '¡Bienvenido!';
    location.href = r.usuario.rol === 'ESTUDIANTE' ? '/mi-ficha' : '/validar';
  } catch (err) {
    mensaje(err.message);
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
  }
});