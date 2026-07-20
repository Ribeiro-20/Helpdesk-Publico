-- Ensure compatibility with match-and-queue and ingest pipeline queries.
ALTER TABLE IF EXISTS public.clients
ADD COLUMN IF NOT EXISTS cpv_s_alerta_concursos_publicos boolean DEFAULT false;
