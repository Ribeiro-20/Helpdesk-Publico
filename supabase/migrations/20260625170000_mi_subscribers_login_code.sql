-- Adiciona suporte a login de uso único por email (stateless) para Market Intelligence
ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS login_code TEXT;
ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS login_code_expires_at TIMESTAMPTZ;
