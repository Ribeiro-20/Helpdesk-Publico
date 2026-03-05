/**
 * Edge Function: ingest-contract-mods
 *
 * Ingere modificações contratuais a partir do endpoint GetInfoModContrat da API BASE.
 *
 * == DADOS DISPONÍVEIS NA API ==
 * O endpoint GET /APIBase2/GetInfoModContrat aceita:
 *   - idContrato: ID do contrato original
 *   - Ano: ano
 *
 * As modificações contratuais incluem:
 *   - Aditamentos (extensões de prazo/valor)
 *   - Alterações de preço
 *   - Alterações de âmbito
 *   - Cessações antecipadas
 *
 * == LÓGICA DE INGESTÃO ==
 * 1. Recebe POST com { tenant_id?, year?, contract_ids?[] }
 * 2. Dois modos de operação:
 *    a) Por ano: GET /GetInfoModContrat?Ano=YYYY → todas as modificações do ano
 *    b) Por contrato: para cada contract_id, GET /GetInfoModContrat?idContrato=X
 * 3. Para cada modificação:
 *    - Associa ao contrato existente na tabela contracts
 *    - Calcula o delta de preço (novo - anterior)
 *    - Hash para deduplicação
 *    - Insere na tabela contract_modifications
 * 4. Atualiza o status do contrato para 'modified' se houver alterações
 * 5. Atualiza o effective_price do contrato se o preço mudou
 *
 * == VALOR PARA O UTILIZADOR ==
 * - Detectar contratos que disparam em valor (red flag de má gestão ou corrupção)
 * - Acompanhar evolução real do custo de um projeto
 * - Alertar clientes quando contratos na sua área sofrem modificações significativas
 *
 * == TABELA DESTINO ==
 * contract_modifications (ver migração 20260305010000)
 *
 * == SCHEDULE (cron) ==
 * A correr diariamente (menor frequência que contratos)
 *
 * Request body:
 *   {
 *     tenant_id?:    string,
 *     year?:         number,     // default: ano corrente
 *     contract_ids?: string[],   // se fornecido, busca modificações destes contratos específicos
 *     dry_run?:      boolean
 *   }
 *
 * Response:
 *   {
 *     contracts_checked: number,
 *     modifications_found: number,
 *     inserted: number,
 *     skipped: number,
 *     contracts_updated: number,
 *     total_price_delta: number,
 *     errors: number,
 *     elapsed_ms: number
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // TODO: Fase 1 - Implementar ingestão de modificações contratuais
    // 1. Parse body
    // 2. GET /APIBase2/GetInfoModContrat?Ano=YYYY ou ?idContrato=X
    // 3. Match com contratos existentes
    // 4. Calcular deltas de preço
    // 5. Insert em contract_modifications
    // 6. Update status do contrato

    return new Response(
      JSON.stringify({
        status: "stub",
        message: "ingest-contract-mods: ainda não implementado (Fase 1)",
        description: "Esta função irá ingerir modificações contratuais do endpoint GetInfoModContrat da API BASE",
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[ingest-contract-mods] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
