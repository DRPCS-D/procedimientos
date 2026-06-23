const VISTAS = ['vista-login', 'vista-chat', 'vista-lista', 'vista-ver', 'vista-form', 'vista-usuarios'];

/** Muestra una sola vista y oculta el resto. */
export function mostrarVista(id) {
  for (const vista of VISTAS) {
    const el = document.getElementById(vista);
    if (el) el.hidden = vista !== id;
  }
  // Resalta la pestaña de navegación correspondiente.
  for (const btn of document.querySelectorAll('.nav-btn')) {
    const objetivo = btn.dataset.vista;
    btn.classList.toggle('activo', objetivo === id || (id === 'vista-ver' && objetivo === 'vista-lista') || (id === 'vista-form' && objetivo === 'vista-lista'));
  }
}

let toastTimer = null;
/** Muestra un mensaje breve. tipo: 'info' | 'error'. */
export function toast(mensaje, tipo = 'info') {
  const el = document.getElementById('toast');
  el.textContent = mensaje;
  el.classList.toggle('error', tipo === 'error');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/** Escapa texto para insertarlo de forma segura en HTML. */
export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Recorta un texto a un máximo de caracteres, añadiendo "…" si se corta. */
export function recortar(texto, max) {
  const t = String(texto ?? '');
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
}

/** Formatea una fecha ISO a algo legible en español; vacío si no hay. */
export function fecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Muestra el diálogo de confirmación. Devuelve una promesa que resuelve
 * a true (confirmado) o false (cancelado).
 */
export function confirmar({ titulo = 'Confirmar', mensaje = '', etiquetaSi = 'Eliminar' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog-confirmar');
    document.getElementById('confirmar-titulo').textContent = titulo;
    document.getElementById('confirmar-mensaje').textContent = mensaje;
    const btnSi = document.getElementById('btn-confirmar-si');
    const btnNo = document.getElementById('btn-confirmar-no');
    btnSi.textContent = etiquetaSi;

    function cerrar(valor) {
      btnSi.removeEventListener('click', alSi);
      btnNo.removeEventListener('click', alNo);
      dlg.close();
      resolve(valor);
    }
    function alSi() { cerrar(true); }
    function alNo() { cerrar(false); }

    btnSi.addEventListener('click', alSi);
    btnNo.addEventListener('click', alNo);
    dlg.showModal();
  });
}
