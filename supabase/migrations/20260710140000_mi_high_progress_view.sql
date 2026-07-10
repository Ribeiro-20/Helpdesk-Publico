-- Criar View para calcular o progresso dos contratos ativos diretamente no PostgreSQL.
-- Isto permite pesquisar e filtrar por progresso diretamente na base de dados para o Market Intelligence (MI).
CREATE OR REPLACE VIEW mi_high_progress_contracts AS
SELECT 
  id,
  tenant_id,
  object,
  procedure_type,
  contract_type,
  signing_date,
  publication_date,
  cpv_main,
  contract_price,
  base_price,
  status,
  contracting_entities,
  winners,
  execution_deadline_days,
  execution_locations,
  ROUND((EXTRACT(DAY FROM (CURRENT_DATE::timestamp - signing_date::timestamp))::numeric / execution_deadline_days::numeric), 4) as progress
FROM contracts
WHERE 
  status = 'active'
  AND signing_date IS NOT NULL
  AND execution_deadline_days IS NOT NULL
  AND execution_deadline_days > 0;
