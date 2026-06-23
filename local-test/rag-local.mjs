// Prueba de RAG con modelos LOCALES (Ollama) en el servidor Ubuntu con GPU.
//
// No toca la producción (OpenAI/Supabase siguen igual). Lee los manuales del
// Apps Script, genera embeddings con nomic-embed-text, indexa EN MEMORIA y
// responde con un modelo local. Sirve para comparar calidad/velocidad.
//
// Sin dependencias: usa fetch nativo (Node 18+).
//
// Uso:
//   node rag-local.mjs "¿Cómo creo una Gift Card?"
//
// Config por variables de entorno o por un archivo .env junto a este script:
//   APPS_SCRIPT_URL, ADMIN_USER, ADMIN_PASS   (de dónde leer los manuales)
//   OLLAMA_URL   (default http://localhost:11434)
//   EMBED_MODEL  (default nomic-embed-text)
//   CHAT_MODEL   (default qwen2.5:7b)   ← prueba también llama3.1, gemma3:12b, mistral-nemo

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cargarEnv() {
  const ruta = path.join(__dirname, '.env');
  if (!fs.existsSync(ruta)) return;
  for (const l of fs.readFileSync(ruta, 'utf8').split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
cargarEnv();

const CFG = {
  appsScriptUrl: process.env.APPS_SCRIPT_URL,
  adminUser: process.env.ADMIN_USER,
  adminPass: process.env.ADMIN_PASS,
  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
  chatModel: process.env.CHAT_MODEL || 'qwen2.5:7b',
};

const MAX_CHARS = 1500, OVERLAP = 200, TOP_K = 6;

function trocear(texto) {
  const limpio = String(texto || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpio) return [];
  if (limpio.length <= MAX_CHARS) return [limpio];
  const parrafos = limpio.split(/\n\n+/);
  const trozos = [];
  let actual = '';
  for (const p of parrafos) {
    if (actual && (actual.length + p.length + 2) > MAX_CHARS) {
      trozos.push(actual.trim());
      actual = actual.slice(Math.max(0, actual.length - OVERLAP));
    }
    actual += (actual ? '\n\n' : '') + p;
    while (actual.length > MAX_CHARS) { trozos.push(actual.slice(0, MAX_CHARS).trim()); actual = actual.slice(MAX_CHARS - OVERLAP); }
  }
  if (actual.trim()) trozos.push(actual.trim());
  return trozos.filter(Boolean);
}

async function embed(texto) {
  const res = await fetch(`${CFG.ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CFG.embedModel, prompt: texto }),
  });
  if (!res.ok) throw new Error('Ollama embeddings ' + res.status + ': ' + (await res.text()));
  return (await res.json()).embedding;
}

async function chat(system, user) {
  const res = await fetch(`${CFG.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CFG.chatModel,
      stream: false,
      options: { temperature: 0.3 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error('Ollama chat ' + res.status + ': ' + (await res.text()));
  return (await res.json()).message.content;
}

function coseno(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function obtenerContenido() {
  const res = await fetch(CFG.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'contenidoParaIndexar', usuario: CFG.adminUser, password: CFG.adminPass }),
  });
  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) throw new Error('Apps Script: ' + ((data && data.error) || res.status));
  return data;
}

async function main() {
  const pregunta = process.argv.slice(2).join(' ').trim();
  if (!pregunta) { console.error('Uso: node rag-local.mjs "tu pregunta"'); process.exit(1); }
  for (const [k, v] of Object.entries({ APPS_SCRIPT_URL: CFG.appsScriptUrl, ADMIN_USER: CFG.adminUser, ADMIN_PASS: CFG.adminPass })) {
    if (!v) { console.error('Falta la variable ' + k + ' (ponla en local-test/.env)'); process.exit(1); }
  }

  console.log(`Modelos → embeddings: ${CFG.embedModel} | chat: ${CFG.chatModel}`);
  console.log('Leyendo manuales…');
  const { manuales = [], datos = [] } = await obtenerContenido();

  // Construir índice en memoria
  console.log('Generando embeddings locales…');
  const t0 = Date.now();
  const indice = [];
  for (const m of manuales) {
    const cabecera = [m.codigo ? `Código ${m.codigo}` : '', m.titulo, m.area ? `Área: ${m.area}` : '', m.descripcion].filter(Boolean).join('\n');
    const texto = [cabecera, m.texto].filter(Boolean).join('\n\n');
    for (const trozo of trocear(texto)) {
      indice.push({ titulo: m.titulo, codigo: m.codigo, content: trozo, emb: await embed(trozo) });
    }
  }
  for (const d of datos) {
    indice.push({ titulo: d.sheet, codigo: '', content: d.texto, emb: await embed(d.texto) });
  }
  console.log(`  ${indice.length} fragmentos en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Recuperar
  const qEmb = await embed(pregunta);
  const top = indice
    .map((x) => ({ ...x, score: coseno(qEmb, x.emb) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  const fuentes = [...new Set(top.map((t) => `${t.codigo ? '#' + t.codigo + ' ' : ''}${t.titulo}`))];
  const contexto = top.map((t, i) => `[${i + 1}] ${t.codigo ? 'Código ' + t.codigo + ' · ' : ''}${t.titulo}\n${t.content}`).join('\n\n---\n\n');

  const system = 'Eres el asistente interno de la empresa. Responde en español, de forma clara y útil, '
    + 'usando solo el CONTEXTO. Si no está en el contexto, dilo amablemente y sugiere reformular. '
    + 'Cita las fuentes con su número entre corchetes, por ejemplo [1]. No inventes datos.';
  const user = `CONTEXTO:\n\n${contexto}\n\n---\n\nPREGUNTA: ${pregunta}`;

  console.log('\nGenerando respuesta…\n');
  const t1 = Date.now();
  const respuesta = await chat(system, user);
  console.log('❓', pregunta);
  console.log('\n' + respuesta);
  console.log('\nFuentes candidatas:', fuentes.join(' | '));
  console.log(`(respuesta en ${((Date.now() - t1) / 1000).toFixed(1)}s con ${CFG.chatModel})`);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
