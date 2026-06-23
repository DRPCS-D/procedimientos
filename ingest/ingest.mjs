// Pipeline de ingesta para el centro de conocimiento (RAG).
//
// Lee el contenido desde el Apps Script (manuales + datos), lo trocea en
// fragmentos, genera embeddings con OpenAI y los sube a Supabase (pgvector).
//
// Sin dependencias: usa fetch nativo (Node 18+).
// Uso:   node ingest/ingest.mjs
// Config: copia ingest/.env.example a ingest/.env y rellena las claves.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- Configuración (.env sencillo, sin dotenv) ----------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cargarEnv() {
  const ruta = path.join(__dirname, '.env');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i === -1) continue;
    const clave = limpia.slice(0, i).trim();
    let valor = limpia.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}
cargarEnv();

const CFG = {
  appsScriptUrl: process.env.APPS_SCRIPT_URL,
  adminUser: process.env.ADMIN_USER,
  adminPass: process.env.ADMIN_PASS,
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE,
  openaiKey: process.env.OPENAI_API_KEY,
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
};

function exigirConfig() {
  const faltan = Object.entries({
    APPS_SCRIPT_URL: CFG.appsScriptUrl,
    ADMIN_USER: CFG.adminUser,
    ADMIN_PASS: CFG.adminPass,
    SUPABASE_URL: CFG.supabaseUrl,
    SUPABASE_SERVICE_ROLE: CFG.supabaseKey,
    OPENAI_API_KEY: CFG.openaiKey,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (faltan.length) {
    console.error('Faltan variables en ingest/.env: ' + faltan.join(', '));
    process.exit(1);
  }
}

// ---------- Troceado de texto (chunking) ----------

const MAX_CHARS = 1500;   // ~400-500 tokens por fragmento
const OVERLAP = 200;      // solape para no cortar ideas a la mitad

function trocear(texto) {
  const limpio = String(texto || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpio) return [];
  if (limpio.length <= MAX_CHARS) return [limpio];

  // Trocea por párrafos y agrupa hasta MAX_CHARS, con solape entre fragmentos.
  const parrafos = limpio.split(/\n\n+/);
  const trozos = [];
  let actual = '';
  for (const p of parrafos) {
    if (actual && (actual.length + p.length + 2) > MAX_CHARS) {
      trozos.push(actual.trim());
      actual = actual.slice(Math.max(0, actual.length - OVERLAP));
    }
    actual += (actual ? '\n\n' : '') + p;
    // Un párrafo enorme se parte por longitud.
    while (actual.length > MAX_CHARS) {
      trozos.push(actual.slice(0, MAX_CHARS).trim());
      actual = actual.slice(MAX_CHARS - OVERLAP);
    }
  }
  if (actual.trim()) trozos.push(actual.trim());
  return trozos.filter(Boolean);
}

// ---------- OpenAI embeddings ----------

async function generarEmbeddings(textos) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + CFG.openaiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: CFG.embeddingModel, input: textos }),
  });
  if (!res.ok) throw new Error('OpenAI embeddings ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// ---------- Supabase REST ----------

function sbHeaders(extra = {}) {
  return {
    'apikey': CFG.supabaseKey,
    'Authorization': 'Bearer ' + CFG.supabaseKey,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sbDeleteFuente(sourceType, sourceId) {
  const url = `${CFG.supabaseUrl}/rest/v1/documents`
    + `?source_type=eq.${encodeURIComponent(sourceType)}`
    + `&source_id=eq.${encodeURIComponent(sourceId)}`;
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error('Supabase delete ' + res.status + ': ' + (await res.text()));
}

async function sbInsert(filas) {
  if (!filas.length) return;
  const res = await fetch(`${CFG.supabaseUrl}/rest/v1/documents`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error('Supabase insert ' + res.status + ': ' + (await res.text()));
}

// Borra del índice las fuentes que ya no existen (manuales/filas eliminados).
async function sbPurgarHuérfanos(sourceType, idsVigentes) {
  const lista = idsVigentes.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
  const filtro = idsVigentes.length ? `&source_id=not.in.(${lista})` : '';
  const url = `${CFG.supabaseUrl}/rest/v1/documents?source_type=eq.${sourceType}${filtro}`;
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error('Supabase purge ' + res.status + ': ' + (await res.text()));
}

// ---------- Origen de datos (Apps Script) ----------

async function obtenerContenido() {
  const res = await fetch(CFG.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'contenidoParaIndexar', usuario: CFG.adminUser, password: CFG.adminPass }),
  });
  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) throw new Error('Apps Script: ' + ((data && data.error) || res.status));
  return { manuales: data.manuales || [], datos: data.datos || [] };
}

// ---------- Proceso principal ----------

// Sube una fuente: borra sus fragmentos anteriores e inserta los nuevos.
async function indexarFuente(sourceType, sourceId, meta, texto) {
  const trozos = trocear(texto);
  await sbDeleteFuente(sourceType, sourceId);
  if (!trozos.length) return 0;

  const embeddings = [];
  for (let i = 0; i < trozos.length; i += 100) {
    const lote = trozos.slice(i, i + 100);
    embeddings.push(...await generarEmbeddings(lote));
  }

  const filas = trozos.map((content, idx) => ({
    source_type: sourceType,
    source_id: sourceId,
    chunk_index: idx,
    source_rev: meta.source_rev || '',
    codigo: meta.codigo || null,
    titulo: meta.titulo || null,
    area: meta.area || null,
    doc_url: meta.doc_url || null,
    content,
    embedding: embeddings[idx],
  }));
  await sbInsert(filas);
  return filas.length;
}

async function main() {
  exigirConfig();
  console.log('Obteniendo contenido desde Apps Script…');
  const { manuales, datos } = await obtenerContenido();
  console.log(`  ${manuales.length} manuales, ${datos.length} filas de datos.`);

  let totalChunks = 0;

  const idsManuales = [];
  for (const m of manuales) {
    idsManuales.push(m.id);
    const cabecera = [m.codigo ? `Código ${m.codigo}` : '', m.titulo, m.area ? `Área: ${m.area}` : '', m.descripcion]
      .filter(Boolean).join('\n');
    const texto = [cabecera, m.texto].filter(Boolean).join('\n\n');
    const n = await indexarFuente('doc', m.id, {
      codigo: m.codigo, titulo: m.titulo, area: m.area, doc_url: m.docUrl, source_rev: m.actualizado,
    }, texto);
    totalChunks += n;
    console.log(`  doc ${m.codigo || m.id} "${m.titulo}" → ${n} fragmentos`);
  }
  await sbPurgarHuérfanos('doc', idsManuales);

  const idsDatos = [];
  for (const d of datos) {
    const sourceId = `${d.sheet}:${d.fila}`;
    idsDatos.push(sourceId);
    const n = await indexarFuente('sheet', sourceId, {
      titulo: d.sheet, area: null, doc_url: null,
    }, d.texto);
    totalChunks += n;
  }
  if (datos.length) console.log(`  ${datos.length} filas de datos indexadas`);
  await sbPurgarHuérfanos('sheet', idsDatos);

  console.log(`Listo. ${totalChunks} fragmentos indexados en Supabase.`);
}

main().catch((err) => { console.error('Error de ingesta:', err.message); process.exit(1); });
