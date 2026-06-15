import { callApi } from './api.js';
import { getCredenciales, esAdmin } from './auth.js';
import { mostrarVista, toast, esc, fecha, confirmar, recortar } from './ui.js';

let manuales = [];        // caché de la última lista cargada
let filtro = '';          // texto de búsqueda actual
let editandoId = null;    // id del manual en edición (null = creando)

/** Carga la lista de manuales desde el backend y la muestra. */
export async function cargarManuales() {
  const cargando = document.getElementById('lista-cargando');
  cargando.hidden = false;
  document.getElementById('lista-vacia').hidden = true;
  try {
    const data = await callApi('listManuales', getCredenciales());
    manuales = data.manuales || [];
    actualizarAreas();
    renderLista();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    cargando.hidden = true;
  }
}

/** Pinta las tarjetas según el filtro de búsqueda. */
function renderLista() {
  const cont = document.getElementById('lista-manuales');
  const q = filtro.trim().toLowerCase();

  const visibles = manuales.filter((m) => {
    if (!q) return true;
    return [m.codigo, m.titulo, m.area, m.descripcion]
      .map((v) => String(v ?? '').toLowerCase())
      .some((v) => v.includes(q));
  });

  document.getElementById('lista-vacia').hidden = visibles.length > 0;

  if (!visibles.length) { cont.innerHTML = ''; return; }

  const filas = visibles.map((m) => {
    const creado = `${esc(fecha(m.fechaCreacion))}${m.usuarioCreador ? `<br><span class="t-por">por ${esc(m.usuarioCreador.toUpperCase())}</span>` : ''}`;
    const modificado = m.fechaModificacion
      ? `${esc(fecha(m.fechaModificacion))}${m.usuarioModificacion ? `<br><span class="t-por">por ${esc(m.usuarioModificacion.toUpperCase())}</span>` : ''}`
      : '<span class="t-vacio">—</span>';
    return `
      <tr data-id="${esc(m.id)}" tabindex="0">
        <td class="t-codigo">#${esc(m.codigo)}</td>
        <td>
          <div class="t-titulo" title="${esc(m.titulo)}">${esc(recortar(m.titulo, 20))}</div>
          ${m.descripcion ? `<div class="t-desc" title="${esc(m.descripcion)}">${esc(recortar(m.descripcion, 90))}</div>` : ''}
        </td>
        <td title="${esc(m.area || '')}">${esc(recortar(m.area, 20))}</td>
        <td class="t-fecha">${creado}</td>
        <td class="t-fecha">${modificado}</td>
      </tr>`;
  }).join('');

  cont.innerHTML = `
    <table class="tabla">
      <thead>
        <tr>
          <th>Código</th><th>Título</th><th>Área</th>
          <th>Creado</th><th>Modificado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

/** Rellena el datalist de áreas con los valores existentes. */
function actualizarAreas() {
  const areas = [...new Set(manuales.map((m) => m.area).filter(Boolean))].sort();
  document.getElementById('areas-list').innerHTML =
    areas.map((a) => `<option value="${esc(a)}">`).join('');
}

function buscarManual(id) {
  return manuales.find((m) => String(m.id) === String(id));
}

// ---------- Ver ----------

function verManual(id) {
  const m = buscarManual(id);
  if (!m) return;

  document.getElementById('ver-meta').innerHTML = `
    <span class="card-codigo">#${esc(m.codigo)}</span>
    <h2>${esc(m.titulo)}</h2>
    ${m.descripcion ? `<p class="card-desc">${esc(m.descripcion)}</p>` : ''}
    <dl>
      ${m.area ? `<dt>Área</dt><dd>${esc(m.area)}</dd>` : ''}
      <dt>Creado</dt><dd>${esc(fecha(m.fechaCreacion))}${m.usuarioCreador ? ' por ' + esc(m.usuarioCreador.toUpperCase()) : ''}</dd>
      ${m.fechaModificacion ? `<dt>Modificado</dt><dd>${esc(fecha(m.fechaModificacion))}${m.usuarioModificacion ? ' por ' + esc(m.usuarioModificacion.toUpperCase()) : ''}</dd>` : ''}
    </dl>
  `;

  const iframe = document.getElementById('ver-doc');
  iframe.src = m.docId ? `https://docs.google.com/document/d/${encodeURIComponent(m.docId)}/preview` : 'about:blank';

  const btnImprimir = document.getElementById('btn-imprimir');
  btnImprimir.onclick = () => {
    if (m.docId) window.open(`https://docs.google.com/document/d/${encodeURIComponent(m.docId)}/export?format=pdf`, '_blank');
  };

  const admin = esAdmin();

  const btnEditarContenido = document.getElementById('btn-editar-contenido');
  btnEditarContenido.hidden = !admin;
  btnEditarContenido.onclick = () => {
    const url = m.docUrl || (m.docId ? `https://docs.google.com/document/d/${encodeURIComponent(m.docId)}/edit` : null);
    if (!url) return;
    window.open(url, '_blank'); // abrir primero, dentro del gesto del usuario
    // Registrar quién edita el contenido (sin bloquear la apertura del Doc).
    callApi('marcarEdicion', { ...getCredenciales(), id: m.id }).catch(() => {});
  };

  const btnEditarDatos = document.getElementById('btn-ver-editar');
  btnEditarDatos.hidden = !admin;
  btnEditarDatos.onclick = () => abrirFormulario(m.id);

  const btnBorrar = document.getElementById('btn-ver-borrar');
  btnBorrar.hidden = !admin;
  btnBorrar.onclick = () => borrarManual(m.id);

  mostrarVista('vista-ver');
}

// ---------- Crear / Editar ----------

function abrirFormulario(id = null) {
  editandoId = id;
  const m = id ? buscarManual(id) : null;
  document.getElementById('form-titulo').textContent = m ? 'Editar manual' : 'Nuevo manual';
  document.getElementById('form-nota').hidden = !!m;
  document.getElementById('form-error').hidden = true;
  document.getElementById('m-titulo').value = m ? m.titulo : '';
  document.getElementById('m-area').value = m ? (m.area || '') : '';
  document.getElementById('m-descripcion').value = m ? (m.descripcion || '') : '';
  mostrarVista('vista-form');
  document.getElementById('m-titulo').focus();
}

async function guardarManual(e) {
  e.preventDefault();
  const error = document.getElementById('form-error');
  const btn = document.getElementById('btn-guardar');
  error.hidden = true;

  const payload = {
    ...getCredenciales(),
    titulo: document.getElementById('m-titulo').value.trim(),
    area: document.getElementById('m-area').value.trim(),
    descripcion: document.getElementById('m-descripcion').value.trim(),
  };

  if (!payload.titulo) {
    error.textContent = 'El título es obligatorio.';
    error.hidden = false;
    return;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = editandoId ? 'Guardando…' : 'Creando documento…';
  try {
    if (editandoId) {
      await callApi('updateManual', { ...payload, id: editandoId });
      toast('Manual actualizado.');
    } else {
      await callApi('createManual', payload);
      toast('Manual creado con su documento.');
    }
    await cargarManuales();
    mostrarVista('vista-lista');
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function borrarManual(id) {
  const m = buscarManual(id);
  if (!m) return;
  const ok = await confirmar({
    titulo: 'Borrar manual',
    mensaje: `¿Borrar "${m.titulo}" (#${m.codigo})? El documento de Google Docs se moverá a la papelera de tu Drive.`,
    etiquetaSi: 'Borrar',
  });
  if (!ok) return;
  try {
    await callApi('deleteManual', { ...getCredenciales(), id });
    toast('Manual borrado.');
    mostrarVista('vista-lista');
    await cargarManuales();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- Conexión de eventos ----------

export function initManuales() {
  document.getElementById('busqueda').addEventListener('input', (e) => {
    filtro = e.target.value;
    renderLista();
  });

  document.getElementById('btn-nuevo').addEventListener('click', () => abrirFormulario(null));
  document.getElementById('form-manual').addEventListener('submit', guardarManual);
  document.getElementById('btn-form-cancelar').addEventListener('click', () => mostrarVista('vista-lista'));
  document.getElementById('btn-volver').addEventListener('click', () => mostrarVista('vista-lista'));

  // Al hacer clic (o Enter) en una fila se abre el manual.
  const lista = document.getElementById('lista-manuales');
  lista.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) verManual(tr.dataset.id);
  });
  lista.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) { e.preventDefault(); verManual(tr.dataset.id); }
  });
}
