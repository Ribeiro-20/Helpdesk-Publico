-- ============================================================
-- Add cpv_codes (JSONB array) and hubspot_contact_id to mi_subscribers
-- Allows storing multiple CPV codes per subscriber from HubSpot
-- ============================================================

ALTER TABLE mi_subscribers
  ADD COLUMN IF NOT EXISTS cpv_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS mi_subscribers_hubspot_id_idx
  ON mi_subscribers(hubspot_contact_id);
