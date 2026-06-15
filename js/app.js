import { getSession, login, logout, esAdmin } from './auth.js';
import { mostrarVista, toast } from './ui.js';
import { pintarLogos } from './logo.js';
import { initManuales, cargarManuales } from './manuales.js';
import { initUsuarios, cargarUsuarios } from './usuarios.js';

/** Entra a la aplicación con una sesión válida. */
function entrarApp(sesion) {
  document.getElementById('app-header').hidden = false;
  document.getElementById('header-usuario').textContent =
    `${sesion.usuario} (${sesion.rol === 'admin' ? 'Admin' : 'User'})`;

  const admin = esAdmin();
  document.getElementById('nav-usuarios').hidden = !admin;
  document.getElementById('btn-nuevo').hidden = !admin;

  mostrarVista('vista-lista');
  cargarManuales();
}

/** Sale de la aplicación y vuelve al login. */
function salirApp() {
  logout();
  document.getElementById('app-header').hidden = true;
  document.getElementById('form-login').reset();
  document.getElementById('login-error').hidden = true;
  mostrarVista('vista-login');
}

async function manejarLogin(e) {
  e.preventDefault();
  const error = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  error.hidden = true;

  const usuario = document.getElementById('login-usuario').value.trim();
  const password = document.getElementById('login-password').value;
  if (!usuario || !password) {
    error.textContent = 'Escribe usuario y contraseña.';
    error.hidden = false;
    return;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Entrando…';
  try {
    const sesion = await login(usuario, password);
    entrarApp(sesion);
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function navegar(vista) {
  if (vista === 'vista-usuarios') {
    if (!esAdmin()) return;
    mostrarVista('vista-usuarios');
    cargarUsuarios();
  } else {
    mostrarVista('vista-lista');
    cargarManuales();
  }
}

function init() {
  pintarLogos();
  initManuales();
  initUsuarios();

  document.getElementById('form-login').addEventListener('submit', manejarLogin);
  document.getElementById('btn-logout').addEventListener('click', salirApp);

  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => navegar(btn.dataset.vista));
  }

  const sesion = getSession();
  if (sesion) {
    entrarApp(sesion);
  } else {
    mostrarVista('vista-login');
  }
}

init();
