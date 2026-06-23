-- Reindexado incremental: guarda la "revisión" de cada fuente (fecha de última
-- modificación del Doc) para poder saltarse las que no cambiaron.
-- Ejecuta este SQL en: Supabase > SQL Editor (después de 0001_init.sql).

alter table public.documents add column if not exists source_rev text;
