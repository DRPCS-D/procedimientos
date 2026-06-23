// Edge Function "reindex" · Ingesta en el servidor (RAG)
//
// Apps Script empuja aquí el contenido (manuales + datos) y esta función genera
// los embeddings y los guarda en Supabase. Es la versión automática del script
// ingest/ingest.mjs: se dispara al crear/borrar un manual y por un trigger
// horario de Apps Script (para captar ediciones hechas en los Google Docs).
//
// Incremental: salta las fuentes cuya revisión (source_rev = última edición del
// Doc) no cambió, para no re-embeber ni gastar de más.
//
// Protegida por un secreto compartido (REINDEX_SECRET) que envía Apps Script.
//
// Secrets necesarios: OPENAI_API_KEY, REINDEX_SECRET
// Disponibles automáticamente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
const REINDEX_SECRET = Deno.env.get('REINDEX_SECRET')!;
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMBEDDING_MODEL = Deno.env.get('EMBEDDING_MODEL') || 'text-embedding-3-small';

const MAX_CHARS = 1500;
const OVERLAP = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function trocear(texto: string): string[] {
  const limpio = String(texto || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpio) return [];
  if (limpio.length <= MAX_CHARS) return [limpio];
  const parrafos = limpio.split(/\n\n+/);
  const trozos: string[] = [];
  let actual = '';
  for (const p of parrafos) {
    if (actual && (actual.length + p.length + 2) > MAX_CHARS) {
      trozos.push(actual.trim());
      actual = actual.slice(Math.max(0, actual.length - OVERLAP));
    }
    actual += (actual ? '\n\n' : '') + p;
    while (actual.length > MAX_CHARS) {
      trozos.push(actual.slice(0, MAX_CHARS).trim());
      actual = actual.slice(MAX_CHARS - OVERLAP);
    }
  }
  if (actual.trim()) trozos.push(actual.trim());
  return trozos.filter(Boolean);
}

async function embeddings(textos: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: textos }),
  });
  if (!res.ok) throw new Error('OpenAI embeddings ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'apikey': SERVICE_ROLE,
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function revisionesActuales(sourceType: string): Promise<Map<string, string>> {
  const res = await sb(`documents?select=source_id,source_rev&source_type=eq.${sourceType}`);
  if (!res.ok) throw new Error('Supabase select ' + res.status);
  const filas = await res.json() as Array<{ source_id: string; source_rev: string | null }>;
  const map = new Map<string, string>();
  for (const f of filas) map.set(f.source_id, f.source_rev || '');
  return map;
}

async function borrarFuente(sourceType: string, sourceId: string) {
  const res = await sb(
    `documents?source_type=eq.${encodeURIComponent(sourceType)}&source_id=eq.${encodeURIComponent(sourceId)}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
  );
  if (!res.ok) throw new Error('Supabase delete ' + res.status + ': ' + (await res.text()));
}

async function insertar(filas: unknown[]) {
  if (!filas.length) return;
  const res = await sb('documents', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(filas) });
  if (!res.ok) throw new Error('Supabase insert ' + res.status + ': ' + (await res.text()));
}

async function purgarHuerfanos(sourceType: string, idsVigentes: string[]) {
  const lista = idsVigentes.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
  const filtro = idsVigentes.length ? `&source_id=not.in.(${lista})` : '';
  const res = await sb(`documents?source_type=eq.${sourceType}${filtro}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!res.ok) throw new Error('Supabase purge ' + res.status + ': ' + (await res.text()));
}

async function indexarFuente(sourceType: string, sourceId: string, rev: string, meta: any, texto: string) {
  const trozos = trocear(texto);
  await borrarFuente(sourceType, sourceId);
  if (!trozos.length) return 0;
  const vecs = await embeddings(trozos);
  const filas = trozos.map((content, idx) => ({
    source_type: sourceType, source_id: sourceId, chunk_index: idx, source_rev: rev,
    codigo: meta.codigo || null, titulo: meta.titulo || null, area: meta.area || null,
    doc_url: meta.doc_url || null, content, embedding: vecs[idx],
  }));
  await insertar(filas);
  return filas.length;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Solicitud inválida' }, 400); }

  if (!REINDEX_SECRET || body.secret !== REINDEX_SECRET) {
    return json({ ok: false, error: 'No autorizado' }, 401);
  }

  try {
    const manuales = Array.isArray(body.manuales) ? body.manuales : [];
    const datos = Array.isArray(body.datos) ? body.datos : [];
    const eliminar = Array.isArray(body.eliminar) ? body.eliminar : [];
    const full = body.full === true;

    let cambiados = 0, saltados = 0, borrados = 0;

    // Borrados explícitos (al eliminar un manual desde la app).
    for (const sourceId of eliminar) { await borrarFuente('doc', String(sourceId)); borrados++; }

    // Manuales (incremental por source_rev = última edición del Doc).
    const revsDoc = await revisionesActuales('doc');
    for (const m of manuales) {
      const rev = String(m.actualizado || '');
      if (revsDoc.get(m.id) === rev && rev !== '') { saltados++; continue; }
      const cabecera = [m.codigo ? `Código ${m.codigo}` : '', m.titulo, m.area ? `Área: ${m.area}` : '', m.descripcion]
        .filter(Boolean).join('\n');
      const texto = [cabecera, m.texto].filter(Boolean).join('\n\n');
      await indexarFuente('doc', m.id, rev, { codigo: m.codigo, titulo: m.titulo, area: m.area, doc_url: m.docUrl }, texto);
      cambiados++;
    }

    // Datos de hojas (se reemplazan siempre que vengan).
    for (const d of datos) {
      const sourceId = `${d.sheet}:${d.fila}`;
      await indexarFuente('sheet', sourceId, '', { titulo: d.sheet }, d.texto);
    }

    // En modo completo, reconcilia: borra del índice lo que ya no existe.
    if (full) {
      await purgarHuerfanos('doc', manuales.map((m: any) => m.id));
      await purgarHuerfanos('sheet', datos.map((d: any) => `${d.sheet}:${d.fila}`));
    }

    return json({ ok: true, cambiados, saltados, borrados });
  } catch (err) {
    return json({ ok: false, error: 'Error de reindexado: ' + (err as Error).message }, 500);
  }
});
