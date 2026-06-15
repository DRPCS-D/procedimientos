/**
 * Procedimientos - Backend (Google Apps Script)
 *
 * Gestiona los registros de manuales (en Google Sheets) y crea
 * automáticamente un Google Doc por cada manual dentro de una carpeta
 * de tu Google Drive.
 *
 * Despliegue (ver docs/SETUP.md):
 *   Extensiones > Apps Script > pegar este archivo
 *   > poner el ID de la carpeta en FOLDER_ID
 *   > Implementar > Aplicación web
 *   > Ejecutar como: Yo | Quién tiene acceso: Cualquier usuario
 *
 * La hoja debe tener dos pestañas:
 *   "Procedimientos": id | codigo | titulo | descripcion | area |
 *                     fechaCreacion | fechaModificacion |
 *                     usuarioCreador | usuarioModificacion | docId | docUrl
 *   "Usuarios":       usuario | password | rol | activo
 */

// ID de la carpeta de Drive donde se crearán los documentos.
// Es la parte final de la URL de la carpeta:
// https://drive.google.com/drive/folders/AQUI_VA_EL_ID
var FOLDER_ID = 'PEGA_AQUI_EL_ID_DE_LA_CARPETA';

var SHEET_MANUALES = 'Procedimientos';
var SHEET_USUARIOS = 'Usuarios';

// Índices de columnas (0-based) de la pestaña Procedimientos.
var COL = {
  id: 0, codigo: 1, titulo: 2, descripcion: 3, area: 4,
  fechaCreacion: 5, fechaModificacion: 6,
  usuarioCreador: 7, usuarioModificacion: 8, docId: 9, docUrl: 10
};

function doGet() {
  return jsonOut_({ ok: true, service: 'procedimientos' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Solicitud inválida' });
  }

  try {
    switch (body.action) {
      case 'login':         return handleLogin_(body);
      case 'listManuales':  return handleListManuales_(body);
      case 'createManual':  return handleCreateManual_(body);
      case 'updateManual':  return handleUpdateManual_(body);
      case 'marcarEdicion': return handleMarcarEdicion_(body);
      case 'deleteManual':  return handleDeleteManual_(body);
      case 'listUsuarios':  return handleListUsuarios_(body);
      case 'createUsuario': return handleCreateUsuario_(body);
      case 'updateUsuario': return handleUpdateUsuario_(body);
      case 'deleteUsuario': return handleDeleteUsuario_(body);
      default:              return jsonOut_({ ok: false, error: 'Acción desconocida' });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message || ('Error del servidor: ' + err) });
  }
}

// ---------- Autenticación ----------

function handleLogin_(body) {
  var user = findUser_(body.usuario, body.password);
  if (!user) return jsonOut_({ ok: false, error: 'Usuario o contraseña incorrectos' });
  return jsonOut_({ ok: true, usuario: user.usuario, rol: user.rol });
}

/** Valida credenciales y devuelve el usuario, o lanza error. */
function requireAuth_(body) {
  var user = findUser_(body.usuario, body.password);
  if (!user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
  return user;
}

/** Valida que el usuario sea Admin, o lanza error. */
function requireAdmin_(body) {
  var user = requireAuth_(body);
  if (user.rol !== 'admin') throw new Error('No autorizado: se requiere rol Admin.');
  return user;
}

/**
 * Busca un usuario activo con usuario y contraseña coincidentes.
 * Devuelve { usuario, rol, activo } o null.
 */
function findUser_(usuario, password) {
  var nombre = String(usuario || '').trim();
  var pass = String(password || '');
  if (!nombre || !pass) return null;

  var rows = getSheet_(SHEET_USUARIOS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowUsuario = String(rows[i][0]).trim();
    var rowPass = String(rows[i][1]);
    // El usuario no distingue mayúsculas/minúsculas; la contraseña sí.
    if (rowUsuario.toUpperCase() === nombre.toUpperCase() && rowPass === pass && esActivo_(rows[i][3])) {
      return {
        usuario: rowUsuario,
        rol: normalizarRol_(rows[i][2]),
        activo: true
      };
    }
  }
  return null;
}

// ---------- Manuales ----------

function handleListManuales_(body) {
  requireAuth_(body);
  var rows = getSheet_(SHEET_MANUALES).getDataRange().getValues();
  var manuales = [];
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][COL.id]).trim()) continue;
    var m = rowToManual_(rows[i]);
    // La FECHA de "modificado" sale de la modificación real del Google Doc.
    // El "editado por" sale de la ficha: lo guarda quien pulsa "Editar contenido".
    m.fechaModificacion = fechaModDoc_(m.docId, m.fechaCreacion);
    manuales.push(m);
  }
  // Más recientes primero.
  manuales.sort(function (a, b) {
    return String(b.fechaCreacion).localeCompare(String(a.fechaCreacion));
  });
  return jsonOut_({ ok: true, manuales: manuales });
}

function handleCreateManual_(body) {
  var user = requireAdmin_(body);
  var titulo = String(body.titulo || '').trim();
  var area = String(body.area || '').trim();
  var descripcion = String(body.descripcion || '').trim();

  if (!titulo) throw new Error('El título es obligatorio.');

  var sheet = getSheet_(SHEET_MANUALES);
  var folder = obtenerCarpeta_();

  // El código se asigna automáticamente. Se calcula y se inserta dentro del
  // lock para que dos creaciones simultáneas no obtengan el mismo número.
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var id;
  try {
    var codigo = String(siguienteCodigo_(sheet));

    var doc = DocumentApp.create(codigo + ' - ' + titulo);
    var cuerpo = doc.getBody();
    cuerpo.appendParagraph(titulo).setHeading(DocumentApp.ParagraphHeading.TITLE);
    if (descripcion) cuerpo.appendParagraph(descripcion);
    cuerpo.appendParagraph('');
    doc.saveAndClose();

    var docId = doc.getId();
    var file = DriveApp.getFileById(docId);
    moverACarpeta_(file, folder);
    compartirLectura_(file);
    var docUrl = 'https://docs.google.com/document/d/' + docId + '/edit';

    id = Utilities.getUuid();
    var fila = [];
    fila[COL.id] = id;
    fila[COL.codigo] = codigo;
    fila[COL.titulo] = titulo;
    fila[COL.descripcion] = descripcion;
    fila[COL.area] = area;
    fila[COL.fechaCreacion] = new Date().toISOString();
    fila[COL.fechaModificacion] = '';
    fila[COL.usuarioCreador] = user.usuario;
    fila[COL.usuarioModificacion] = '';
    fila[COL.docId] = docId;
    fila[COL.docUrl] = docUrl;
    sheet.appendRow(fila);
  } finally {
    lock.releaseLock();
  }

  return jsonOut_({ ok: true, manual: rowToManual_(filaPorId_(sheet, id).valores) });
}

/** Devuelve el siguiente código: el mayor número existente + 1 (empieza en 1). */
function siguienteCodigo_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var max = 0;
  for (var i = 1; i < rows.length; i++) {
    var n = parseInt(String(rows[i][COL.codigo]).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function handleUpdateManual_(body) {
  requireAdmin_(body);
  var id = String(body.id || '').trim();
  if (!id) throw new Error('Falta el identificador del manual.');

  var titulo = String(body.titulo || '').trim();
  var area = String(body.area || '').trim();
  var descripcion = String(body.descripcion || '').trim();
  if (!titulo) throw new Error('El título es obligatorio.');

  var sheet = getSheet_(SHEET_MANUALES);
  var encontrada = filaPorId_(sheet, id);
  if (!encontrada) throw new Error('El manual ya no existe.');

  // El código es automático y no se modifica. Solo se actualizan los datos de
  // la ficha. NO se toca "modificado" (eso refleja cambios del Google Doc) ni
  // se renombra el Doc (renombrarlo alteraría su fecha de modificación).
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var fila = encontrada.indice; // 1-based para Sheets
    sheet.getRange(fila, COL.titulo + 1).setValue(titulo);
    sheet.getRange(fila, COL.descripcion + 1).setValue(descripcion);
    sheet.getRange(fila, COL.area + 1).setValue(area);
  } finally {
    lock.releaseLock();
  }

  return jsonOut_({ ok: true, manual: rowToManual_(filaPorId_(sheet, id).valores) });
}

/**
 * Registra quién va a editar el contenido (al pulsar "Editar contenido").
 * Solo guarda el "editado por"; la FECHA de modificación se sigue tomando
 * de la última actualización real del Google Doc al listar.
 */
function handleMarcarEdicion_(body) {
  var user = requireAdmin_(body);
  var id = String(body.id || '').trim();
  if (!id) throw new Error('Falta el identificador del manual.');

  var sheet = getSheet_(SHEET_MANUALES);
  var encontrada = filaPorId_(sheet, id);
  if (!encontrada) throw new Error('El manual ya no existe.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.getRange(encontrada.indice, COL.usuarioModificacion + 1).setValue(user.usuario);
  } finally {
    lock.releaseLock();
  }
  return jsonOut_({ ok: true });
}

function handleDeleteManual_(body) {
  requireAdmin_(body);
  var id = String(body.id || '').trim();
  if (!id) throw new Error('Falta el identificador del manual.');

  var sheet = getSheet_(SHEET_MANUALES);
  var encontrada = filaPorId_(sheet, id);
  if (!encontrada) throw new Error('El manual ya no existe.');

  var docId = encontrada.valores[COL.docId];

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.deleteRow(encontrada.indice);
  } finally {
    lock.releaseLock();
  }

  // Mover el documento a la papelera (recuperable 30 días desde Drive).
  if (docId) {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) {}
  }

  return jsonOut_({ ok: true });
}

// ---------- Usuarios ----------

function handleListUsuarios_(body) {
  requireAdmin_(body);
  var rows = getSheet_(SHEET_USUARIOS).getDataRange().getValues();
  var usuarios = [];
  for (var i = 1; i < rows.length; i++) {
    var nombre = String(rows[i][0]).trim();
    if (!nombre) continue;
    usuarios.push({
      usuario: nombre,
      rol: normalizarRol_(rows[i][2]),
      activo: esActivo_(rows[i][3])
    });
  }
  return jsonOut_({ ok: true, usuarios: usuarios });
}

function handleCreateUsuario_(body) {
  requireAdmin_(body);
  var nombre = String(body.nuevoUsuario || '').trim().toUpperCase(); // nombres siempre en mayúsculas
  var password = String(body.nuevaPassword || '');
  var rol = normalizarRol_(body.rol);
  var activo = body.activo !== false;

  if (!nombre) throw new Error('El nombre de usuario es obligatorio.');
  if (!password) throw new Error('La contraseña inicial es obligatoria.');

  var sheet = getSheet_(SHEET_USUARIOS);
  if (usuarioExiste_(sheet, nombre)) throw new Error('Ya existe un usuario con ese nombre.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.appendRow([nombre, password, rol, activo]);
  } finally {
    lock.releaseLock();
  }
  return jsonOut_({ ok: true });
}

function handleUpdateUsuario_(body) {
  requireAdmin_(body);
  var nombre = String(body.targetUsuario || '').trim();
  if (!nombre) throw new Error('Falta el usuario a editar.');
  var rol = normalizarRol_(body.rol);
  var activo = body.activo !== false;
  var nuevaPassword = String(body.nuevaPassword || '');

  var sheet = getSheet_(SHEET_USUARIOS);
  var encontrada = usuarioPorNombre_(sheet, nombre);
  if (!encontrada) throw new Error('El usuario ya no existe.');

  // Evita dejar el sistema sin ningún Admin activo.
  var eraAdminActivo = normalizarRol_(encontrada.valores[2]) === 'admin' && esActivo_(encontrada.valores[3]);
  var seguiraSiendoAdminActivo = rol === 'admin' && activo;
  if (eraAdminActivo && !seguiraSiendoAdminActivo && contarAdminsActivos_(sheet) <= 1) {
    throw new Error('No puedes quitar el último Admin activo.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var fila = encontrada.indice;
    sheet.getRange(fila, 3).setValue(rol);
    sheet.getRange(fila, 4).setValue(activo);
    if (nuevaPassword) sheet.getRange(fila, 2).setValue(nuevaPassword);
  } finally {
    lock.releaseLock();
  }
  return jsonOut_({ ok: true });
}

function handleDeleteUsuario_(body) {
  var actual = requireAdmin_(body);
  var nombre = String(body.targetUsuario || '').trim();
  if (!nombre) throw new Error('Falta el usuario a borrar.');
  if (nombre === actual.usuario) throw new Error('No puedes borrarte a ti mismo.');

  var sheet = getSheet_(SHEET_USUARIOS);
  var encontrada = usuarioPorNombre_(sheet, nombre);
  if (!encontrada) throw new Error('El usuario ya no existe.');

  var esAdminActivo = normalizarRol_(encontrada.valores[2]) === 'admin' && esActivo_(encontrada.valores[3]);
  if (esAdminActivo && contarAdminsActivos_(sheet) <= 1) {
    throw new Error('No puedes borrar el último Admin activo.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.deleteRow(encontrada.indice);
  } finally {
    lock.releaseLock();
  }
  return jsonOut_({ ok: true });
}

// ---------- Helpers de Drive ----------

function obtenerCarpeta_() {
  if (!FOLDER_ID || FOLDER_ID.indexOf('PEGA') === 0) {
    throw new Error('El backend no está configurado: falta FOLDER_ID en Code.gs.');
  }
  try {
    return DriveApp.getFolderById(FOLDER_ID);
  } catch (e) {
    throw new Error('No se pudo abrir la carpeta de Drive (FOLDER_ID). Revisa el ID y los permisos.');
  }
}

/** Mueve un archivo a la carpeta destino, quitándolo de cualquier otra. */
function moverACarpeta_(file, folder) {
  folder.addFile(file);
  var padres = file.getParents();
  while (padres.hasNext()) {
    var p = padres.next();
    if (p.getId() !== folder.getId()) p.removeFile(file);
  }
}

/**
 * Devuelve la fecha (ISO) de la última modificación real del Google Doc,
 * o '' si nunca se editó tras crearse (o si no se puede leer).
 * Se compara contra la fecha de creación con un pequeño margen para
 * ignorar la diferencia de milisegundos del propio alta.
 */
function fechaModDoc_(docId, fechaCreacion) {
  if (!docId) return '';
  try {
    var last = DriveApp.getFileById(docId).getLastUpdated();
    if (!last) return '';
    var lastMs = last.getTime();
    var creaMs = fechaCreacion ? new Date(fechaCreacion).getTime() : 0;
    if (creaMs && lastMs <= creaMs + 5000) return ''; // sin cambios tras crearse
    return last.toISOString();
  } catch (e) {
    return '';
  }
}

/** Comparte el archivo como "cualquiera con el enlace puede ver". */
function compartirLectura_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Algunos dominios de Workspace restringen este tipo de uso compartido.
    // El registro se crea igualmente; ajusta el permiso a mano si hace falta.
  }
}

// ---------- Helpers de hoja ----------

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('No existe la pestaña "' + name + '" en la hoja de cálculo.');
  return sheet;
}

function rowToManual_(row) {
  return {
    id: String(row[COL.id]),
    codigo: row[COL.codigo] === '' ? '' : String(row[COL.codigo]),
    titulo: String(row[COL.titulo]),
    descripcion: String(row[COL.descripcion]),
    area: String(row[COL.area]),
    fechaCreacion: normalizarFecha_(row[COL.fechaCreacion]),
    fechaModificacion: normalizarFecha_(row[COL.fechaModificacion]),
    usuarioCreador: String(row[COL.usuarioCreador]),
    usuarioModificacion: String(row[COL.usuarioModificacion]),
    docId: String(row[COL.docId]),
    docUrl: String(row[COL.docUrl])
  };
}

/** Devuelve { indice (1-based), valores } de la fila con ese id, o null. */
function filaPorId_(sheet, id) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.id]).trim() === String(id).trim()) {
      return { indice: i + 1, valores: rows[i] };
    }
  }
  return null;
}

function usuarioPorNombre_(sheet, nombre) {
  var buscado = String(nombre).trim().toUpperCase();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === buscado) {
      return { indice: i + 1, valores: rows[i] };
    }
  }
  return null;
}

function usuarioExiste_(sheet, nombre) {
  return !!usuarioPorNombre_(sheet, nombre);
}

function contarAdminsActivos_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var total = 0;
  for (var i = 1; i < rows.length; i++) {
    if (normalizarRol_(rows[i][2]) === 'admin' && esActivo_(rows[i][3])) total++;
  }
  return total;
}

function normalizarRol_(valor) {
  return String(valor || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

/** Acepta TRUE, SI, SÍ o X (casilla de verificación) como "activo". */
function esActivo_(valor) {
  if (valor === true) return true;
  if (valor === false) return false;
  var texto = String(valor).trim().toUpperCase().replace('Í', 'I');
  return texto === 'TRUE' || texto === 'SI' || texto === 'X' || texto === '1';
}

/** Normaliza una fecha a texto ISO; Sheets puede convertir la celda a Date. */
function normalizarFecha_(valor) {
  if (valor instanceof Date) return valor.toISOString();
  var str = String(valor || '').trim();
  return str;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
