     ALTER TABLE IF EXISTS public.clients
     ADD COLUMN IF NOT EXISTS cpv_s_alerta_concursos_publicos boolean DEFAULT false;
     