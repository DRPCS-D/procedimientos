-- Procedimientos · Centro de conocimiento (RAG)
-- Migración inicial para Supabase (Postgres + pgvector).
-- Ejecuta este SQL en: Supabase > SQL Editor.

-- 1) Extensión de vectores
create extension if not exists vector;

-- 2) Tabla de fragmentos indexados (documents)
--    Un registro por "chunk" de texto, con su embedding y metadatos de origen
--    para poder citar la fuente exacta (manual/Doc o fila de una hoja).
create table if not exists public.documents (
  id           bigint generated always as identity primary key,
  source_type  text   not null check (source_type in ('doc', 'sheet')),
  source_id    text   not null,           -- id del manual o "sheet:fila"
  chunk_index  int    not null default 0, -- nº de fragmento dentro de la fuente
  codigo       text,
  titulo       text,
  area         text,
  doc_url      text,
  content      text   not null,           -- texto del fragmento
  embedding    vector(1536) not null,     -- text-embedding-3-small = 1536 dims
  fts          tsvector generated always as (to_tsvector('spanish', coalesce(content, ''))) stored,
  updated_at   timestamptz not null default now()
);

-- Evita duplicados al reindexar la misma fuente/fragmento.
create unique index if not exists documents_source_chunk_uidx
  on public.documents (source_type, source_id, chunk_index);

-- Índice vectorial (coseno) para búsqueda semántica.
create index if not exists documents_embedding_idx
  on public.documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Índice full-text para la parte léxica de la búsqueda híbrida.
create index if not exists documents_fts_idx
  on public.documents using gin (fts);

-- 3) Historial de conversaciones (opcional, para memoria y métricas)
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  usuario    text not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  sources    jsonb,
  created_at timestamptz not null default now()
);

-- 4) Búsqueda híbrida: combina similitud vectorial + relevancia full-text.
--    Devuelve los mejores fragmentos para una pregunta.
create or replace function public.match_documents (
  query_embedding vector(1536),
  query_text      text default '',
  match_count     int  default 6,
  filtro_area     text default null
)
returns table (
  id          bigint,
  source_type text,
  source_id   text,
  codigo      text,
  titulo      text,
  area        text,
  doc_url     text,
  content     text,
  score       float
)
language sql stable
as $$
  with semantic as (
    select d.*, 1 - (d.embedding <=> query_embedding) as sim
    from public.documents d
    where filtro_area is null or d.area = filtro_area
    order by d.embedding <=> query_embedding
    limit greatest(match_count * 4, 24)
  ),
  lexical as (
    select s.id,
           case when coalesce(query_text, '') = '' then 0
                else ts_rank(s.fts, plainto_tsquery('spanish', query_text)) end as lex
    from semantic s
  )
  select s.id, s.source_type, s.source_id, s.codigo, s.titulo, s.area, s.doc_url,
         s.content,
         (s.sim * 0.8 + coalesce(l.lex, 0) * 0.2) as score
  from semantic s
  join lexical l on l.id = s.id
  order by score desc
  limit match_count;
$$;

-- 5) Seguridad: RLS activado y sin políticas públicas. El acceso se hace solo
--    desde la Edge Function con la service_role (que omite RLS). El frontend
--    nunca habla directamente con estas tablas.
alter table public.documents     enable row level security;
alter table public.chat_messages enable row level security;
