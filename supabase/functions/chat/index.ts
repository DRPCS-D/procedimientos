// Edge Function "chat" · Centro de conocimiento (RAG)
//
// Flujo: valida la sesión contra el Apps Script actual -> genera el embedding
// de la pregunta -> búsqueda híbrida en pgvector (match_documents) -> arma el
// prompt con las fuentes y el guardrail anti-invención -> llama a OpenAI ->
// devuelve { respuesta, fuentes }.
//
// Las claves viven SOLO aquí (secrets de Supabase), nunca en el frontend.
//
// Secrets necesarios (supabase secrets set ...):
//   OPENAI_API_KEY, APPS_SCRIPT_URL
// Disponibles automáticamente en el entorno de la Edge Function:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
const APPS_SCRIPT_URL = Deno.env.get('APPS_SCRIPT_URL')!;
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHAT_MODEL = Deno.env.get('CHAT_MODEL') || 'gpt-4o-mini';
const EMBEDDING_MODEL = Deno.env.get('EMBEDDING_MODEL') || 'text-embedding-3-small';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Valida usuario/contraseña reutilizando el login del Apps Script actual.
async function validarSesion(usuario: string, password: string) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'login', usuario, password }),
  });
  const data = await res.json().catch(() => null);
  return data && data.ok === true ? data : null;
}

async function embeddingPregunta(texto: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texto }),
  });
  if (!res.ok) throw new Error('OpenAI embeddings ' + res.status);
  const data = await res.json();
  return data.data[0].embedding;
}

async function buscarFragmentos(embedding: number[], pregunta: string, area: string | null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_documents`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE,
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: embedding,
      query_text: pregunta,
      match_count: 6,
      filtro_area: area,
    }),
  });
  if (!res.ok) throw new Error('Supabase match ' + res.status + ': ' + (await res.text()));
  return await res.json() as Array<{
    source_id: string; source_type: string; codigo: string | null;
    titulo: string | null; area: string | null; doc_url: string | null;
    content: string; score: number;
  }>;
}

async function guardarMensajes(usuario: string, pregunta: string, respuesta: string, fuentes: unknown) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE,
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify([
        { usuario, role: 'user', content: pregunta },
        { usuario, role: 'assistant', content: respuesta, sources: fuentes },
      ]),
    });
  } catch (_e) { /* el historial es best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Solicitud inválida' }, 400); }

  const usuario = String(body.usuario || '').trim();
  const password = String(body.password || '');
  const pregunta = String(body.pregunta || '').trim();
  const area = body.area ? String(body.area) : null;

  if (!pregunta) return json({ ok: false, error: 'Escribe una pregunta.' }, 400);

  // 1) Autenticación (login actual)
  const sesion = await validarSesion(usuario, password);
  if (!sesion) return json({ ok: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401);

  try {
    // 2) Embedding + 3) recuperación
    const embedding = await embeddingPregunta(pregunta);
    const fragmentos = await buscarFragmentos(embedding, pregunta, area);

    if (!fragmentos.length) {
      const respuesta = 'No encuentro esa información en los manuales.';
      await guardarMensajes(usuario, pregunta, respuesta, []);
      return json({ ok: true, respuesta, fuentes: [] });
    }

    // Agrupa fuentes únicas (para citar y enlazar) y numera el contexto.
    const fuentesMap = new Map<string, { n: number; codigo: string | null; titulo: string | null; area: string | null; doc_url: string | null }>();
    const contexto = fragmentos.map((f) => {
      if (!fuentesMap.has(f.source_id)) {
        fuentesMap.set(f.source_id, {
          n: fuentesMap.size + 1,
          codigo: f.codigo, titulo: f.titulo, area: f.area, doc_url: f.doc_url,
        });
      }
      const n = fuentesMap.get(f.source_id)!.n;
      const cab = [f.codigo ? `Código ${f.codigo}` : '', f.titulo, f.area ? `Área: ${f.area}` : '']
        .filter(Boolean).join(' · ');
      return `[${n}] ${cab}\n${f.content}`;
    }).join('\n\n---\n\n');

    const fuentes = [...fuentesMap.values()].sort((a, b) => a.n - b.n);

    // 4) Generación con guardrail
    const sistema = [
      'Eres el asistente de conocimiento interno de la empresa.',
      'Responde ÚNICAMENTE con la información del CONTEXTO proporcionado.',
      'Si la respuesta no está en el contexto, responde exactamente:',
      '"No encuentro esa información en los manuales."',
      'Cita las fuentes que uses con su número entre corchetes, por ejemplo [1].',
      'Responde en español, de forma clara y concisa.',
    ].join(' ');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: `CONTEXTO:\n\n${contexto}\n\n---\n\nPREGUNTA: ${pregunta}` },
        ],
      }),
    });
    if (!res.ok) throw new Error('OpenAI chat ' + res.status + ': ' + (await res.text()));
    const data = await res.json();
    const respuesta = data.choices?.[0]?.message?.content?.trim() || 'No encuentro esa información en los manuales.';

    await guardarMensajes(usuario, pregunta, respuesta, fuentes);
    return json({ ok: true, respuesta, fuentes });
  } catch (err) {
    return json({ ok: false, error: 'Error del servidor: ' + (err as Error).message }, 500);
  }
});
