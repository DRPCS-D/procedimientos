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
      match_count: 8,
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

// Lista de temas/manuales disponibles, para que el asistente pueda sugerir
// sobre qué ayudar (sin inventar). Devuelve nombres únicos, máximo ~30.
async function temasDisponibles(): Promise<string[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=titulo,area`, {
      headers: { 'apikey': SERVICE_ROLE, 'Authorization': `Bearer ${SERVICE_ROLE}` },
    });
    if (!res.ok) return [];
    const filas = await res.json() as Array<{ titulo: string | null; area: string | null }>;
    const set = new Set<string>();
    for (const f of filas) {
      const t = (f.titulo || '').trim();
      if (t) set.add(f.area ? `${t} (${String(f.area).trim()})` : t);
    }
    return [...set].slice(0, 30);
  } catch (_e) { return []; }
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
    // 2) Embedding + 3) recuperación (+ temas disponibles para sugerir)
    const embedding = await embeddingPregunta(pregunta);
    const [fragmentos, temas] = await Promise.all([
      buscarFragmentos(embedding, pregunta, area),
      temasDisponibles(),
    ]);

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

    // 4) Generación: asistente conversacional, servicial y anclado al contexto.
    const listaTemas = temas.length ? temas.map((t) => `- ${t}`).join('\n') : '(sin temas indexados todavía)';
    const sistema = [
      'Eres el asistente virtual interno de la empresa fidelitygroup. Tu trabajo es ayudar al',
      'personal con dudas sobre los manuales, procedimientos y datos internos. Eres amable,',
      'conversacional y proactivo.',
      'Pautas:',
      '1) Si el usuario saluda o hace charla (por ejemplo "hola", "buenas", "qué puedes hacer"),',
      'salúdalo con cordialidad, preséntate en una línea y ofrécele ayuda sugiriendo 3 o 4 TEMAS',
      'DISPONIBLES concretos sobre los que puede preguntar.',
      '2) Para preguntas reales, responde usando el CONTEXTO (extractos recuperados), resuelve la',
      'intención aunque la pregunta no sea literal, y cita las fuentes que uses con su número entre',
      'corchetes, por ejemplo [1].',
      '3) Si el CONTEXTO no contiene lo que piden, NO inventes: dilo con amabilidad y, en vez de',
      'cortar en seco, sugiere temas relacionados de los TEMAS DISPONIBLES o pídele que reformule.',
      '4) Nunca te inventes datos (teléfonos, montos, pasos) que no estén en el CONTEXTO.',
      'Responde siempre en español, claro y breve.',
    ].join(' ');

    const userMsg =
      `TEMAS DISPONIBLES (manuales/datos indexados):\n${listaTemas}\n\n` +
      `CONTEXTO (extractos recuperados para esta consulta):\n\n${contexto || '(no se recuperó contexto relevante)'}\n\n` +
      `---\n\nMENSAJE DEL USUARIO: ${pregunta}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) throw new Error('OpenAI chat ' + res.status + ': ' + (await res.text()));
    const data = await res.json();
    const respuesta = data.choices?.[0]?.message?.content?.trim()
      || 'Disculpa, no pude generar una respuesta. ¿Puedes reformular tu pregunta?';

    await guardarMensajes(usuario, pregunta, respuesta, fuentes);
    return json({ ok: true, respuesta, fuentes });
  } catch (err) {
    return json({ ok: false, error: 'Error del servidor: ' + (err as Error).message }, 500);
  }
});
