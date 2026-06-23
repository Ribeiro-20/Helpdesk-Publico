-- Allow anonymous users to read active announcements without authentication
-- This policy enables the frontoffice to display public opportunities

alter table announcements disable row level security;

-- Unified policy: allow anyone to read active or recently-expired announcements
create policy ann_read_public on announcements
for select using (
  status = 'active'
  or (
    status = 'expired'
    and proposal_deadline_at >= now() - interval '30 days'
  )
);

-- Restore RLS to ensure policy is enforced
alter table announcements enable row level security;

comment on policy ann_read_public on announcements is 
'Permite leitura pública de anúncios ativos ou expirados há menos de 30 dias, sem autenticação';
