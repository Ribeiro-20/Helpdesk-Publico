const { Client } = require('pg');
const c = new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
c.connect().then(() => c.query(`
ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS cpv_codes JSONB NOT NULL DEFAULT '[]'::jsonb; 
ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT; 
ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS hubspot_synced_at TIMESTAMPTZ; 
CREATE INDEX IF NOT EXISTS mi_subscribers_hubspot_id_idx ON mi_subscribers(hubspot_contact_id);
`)).then(r => { 
  console.log('Migration applied!'); 
  c.end(); 
}).catch(e => { 
  console.error(e.message); 
  c.end(); 
});
