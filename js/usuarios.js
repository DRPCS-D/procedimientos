import { callApi } from './api.js';
import { getCredenciales, getSession } from './auth.js';
import { toast, esc, confirmar } from './ui.js';

let usuarios = [];
let editando = null; // nombre de usuario en edición (null = creando)

/** Carga y muestra la lista de usuarios (solo Admin). */
export async function cargarUsuarios() {
  const cargando = document.getElementById('usuarios-cargando');
  cargando.hidden = false;
  try {
    const data = await callApi('listUsuarios', getCredenciales());
    usuarios = data.usuarios || [];
    renderUsuarios();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    cargando.hidden = true;
  }
}

function renderUsuarios() {
  const cont = document.getElementById('lista-usuarios');
  const yo = (getSession()?.usuario || '').toUpperCase();

  cont.innerHTML = usuarios.map((u) => {
    const rolBadge = u.rol === 'admin'
      ? '<span class="badge-rol badge-admin">Admin</span>'
      : '<span class="badge-rol badge-user">User</span>';
    const estado = u.activo ? '' : '<span class="badge-rol badge-inactivo">Inactivo</span>';
    const esYo = String(u.usuario).toUpperCase() === yo;
    return `
      <article class="card" data-usuario="${esc(u.usuario)}">
        <div class="card-titulo">👤 ${esc(String(u.usuario).toUpperCase())}${esYo ? ' <small class="nota">(tú)</small>' : ''}</div>
        <div>${rolBadge} ${estado}</div>
        <div class="card-acciones">
          <button type="button" class="btn-secundario" data-accion="editar">Editar</button>
          ${esYo ? '' : `<button type="button" class="btn-peligro" data-accion="borrar">Borrar</button>`}
        </div>
      </article>
    `;
  }).join('');
}

function abrirDialogo(usuario = null) {
  editando = usuario ? usuario.usuario : null;
  document.getElementById('usuario-dialog-titulo').textContent = usuario ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('usuario-error').hidden = true;
  document.getElementById('u-usuario').value = usuario ? usuario.usuario : '';
  document.getElementById('u-usuario').disabled = !!usuario; // el nombre es la clave: no se renombra
  document.getElementById('u-password').value = '';
  document.getElementById('u-rol').value = usuario ? usuario.rol : 'user';
  document.getElementById('u-activo').checked = usuario ? !!usuario.activo : true;
  document.getElementById('u-password-ayuda').textContent = usuario
    ? 'Déjalo en blanco para mantener la contraseña actual.'
    : 'Contraseña inicial del usuario.';
  document.getElementById('dialog-usuario').showModal();
  document.getElementById(usuario ? 'u-password' : 'u-usuario').focus();
}

async function guardarUsuario(e) {
  e.preventDefault();
  const error = document.getElementById('usuario-error');
  const btn = document.getElementById('btn-usuario-guardar');
  error.hidden = true;

  const nombre = document.getElementById('u-usuario').value.trim().toUpperCase();
  const password = document.getElementById('u-password').value;
  const rol = document.getElementById('u-rol').value;
  const activo = document.getElementById('u-activo').checked;

  if (!nombre) {
    error.textContent = 'El nombre de usuario es obligatorio.';
    error.hidden = false;
    return;
  }
  if (!editando && !password) {
    error.textContent = 'La contraseña inicial es obligatoria.';
    error.hidden = false;
    return;
  }

  btn.disabled = true;
  try {
    if (editando) {
      await callApi('updateUsuario', {
        ...getCredenciales(),
        targetUsuario: editando,
        rol, activo,
        nuevaPassword: password, // vacío = no cambiar
      });
      toast('Usuario actualizado.');
    } else {
      await callApi('createUsuario', {
        ...getCredenciales(),
        nuevoUsuario: nombre,
        nuevaPassword: password,
        rol, activo,
      });
      toast('Usuario creado.');
    }
    document.getElementById('dialog-usuario').close();
    await cargarUsuarios();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function borrarUsuario(nombre) {
  const ok = await confirmar({
    titulo: 'Borrar usuario',
    mensaje: `¿Borrar al usuario "${nombre}"? Perderá el acceso a la aplicación.`,
    etiquetaSi: 'Borrar',
  });
  if (!ok) return;
  try {
    await callApi('deleteUsuario', { ...getCredenciales(), targetUsuario: nombre });
    toast('Usuario borrado.');
    await cargarUsuarios();
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function initUsuarios() {
  // El nombre de usuario se escribe siempre en mayúsculas.
  document.getElementById('u-usuario').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => abrirDialogo(null));
  document.getElementById('form-usuario').addEventListener('submit', guardarUsuario);
  document.getElementById('btn-usuario-cancelar').addEventListener('click', () => {
    document.getElementById('dialog-usuario').close();
  });

  document.getElementById('lista-usuarios').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    const nombre = btn.closest('.card').dataset.usuario;
    if (btn.dataset.accion === 'editar') {
      abrirDialogo(usuarios.find((u) => u.usuario === nombre));
    } else if (btn.dataset.accion === 'borrar') {
      borrarUsuario(nombre);
    }
  });
}
