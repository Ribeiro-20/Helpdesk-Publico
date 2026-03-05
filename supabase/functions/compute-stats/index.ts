/**
 * Edge Function: compute-stats
 *
 * Recalcula todas as estatísticas agregadas do sistema.
 * Esta é a função que transforma dados brutos em inteligência de mercado.
 *
 * == O QUE CALCULA ==
 *
 * 1. CPV_STATS (tabela cpv_stats)
 *    Para cada código CPV com actividade:
 *    - total_announcements, announcements_last_30d, announcements_last_365d
 *    - total_contracts, contracts_last_30d, contracts_last_365d
 *    - total_value, avg/min/max/median_contract_value
 *    - avg_price_ratio (preço_contratual / preço_base)
 *    - avg_discount_pct (desconto médio face ao preço base)
 *    - total_entities, total_companies (únicos)
 *    - top_entities: Top 10 entidades que mais compram neste CPV
 *    - top_companies: Top 10 empresas que mais ganham neste CPV
 *    - yoy_growth_pct: crescimento anual (comparando últimos 12m com 12m anteriores)
 *
 * 2. ENTITY STATS (campos desnormalizados em entities)
 *    Para cada entidade pública:
 *    - total_announcements: contagem de anúncios publicados
 *    - total_contracts: contagem de contratos celebrados
 *    - total_value: valor total contratado
 *    - avg_contract_value: valor médio por contrato
 *    - last_activity_at: data do último anúncio/contrato
 *    - top_cpvs: Top 10 CPVs mais frequentes [{code, count, description}]
 *    - top_companies: Top 10 empresas adjudicadas [{nif, name, count, value}]
 *
 * 3. COMPANY STATS (campos desnormalizados em companies)
 *    Para cada empresa adjudicatária:
 *    - contracts_won: total de contratos ganhos
 *    - contracts_participated: total de participações (se dados disponíveis)
 *    - total_value_won: valor total de contratos ganhos
 *    - avg_contract_value: valor médio por contrato
 *    - win_rate: taxa de vitória (%)
 *    - last_win_at: data do último contrato ganho
 *    - cpv_specialization: Top CPVs [{code, count, value, description}]
 *    - top_entities: Top entidades com quem contrata [{nif, name, count, value}]
 *
 * == ESTRATÉGIA DE CÁLCULO ==
 * - Full recompute: recalcula tudo do zero (mais lento, mais preciso)
 * - Incremental: só atualiza registos afetados por novos dados (mais rápido)
 * - O modo é controlado pelo parâmetro mode (default: incremental)
 *
 * == QUERIES PRINCIPAIS ==
 * - Agregações SQL sobre announcements, contracts, entities, companies
 * - GROUP BY cpv_code para cpv_stats
 * - JOIN contracts → entities via entity_id para stats de entidade
 * - JOIN contracts → companies via winner_company_id para stats de empresa
 * - Cálculo de mediana via PERCENTILE_CONT(0.5)
 * - Crescimento YoY: COUNT(last 12m) / COUNT(previous 12m) - 1
 *
 * == VALOR PARA O UTILIZADOR ==
 * - Dashboard de mercado com visão agregada
 * - Comparação entre sectores CPV
 * - Identificação de tendências (mercados em crescimento/declínio)
 * - Previsão de preço competitivo (via análise de desconto médio)
 * - Ranking de entidades e empresas por volume
 *
 * == TABELAS DESTINO ==
 * - cpv_stats (upsert completo)
 * - entities (update campos estatísticos)
 * - companies (update campos estatísticos)
 *
 * == SCHEDULE ==
 * A correr diariamente às 03:00 (após todas as ingestões do dia)
 *
 * Request body:
 *   {
 *     tenant_id?:  string,
 *     mode?:       "full" | "incremental",  // default: incremental
 *     target?:     "all" | "cpv" | "entities" | "companies",  // default: all
 *   }
 *
 * Response:
 *   {
 *     mode: string,
 *     cpv_stats_upserted: number,
 *     entities_updated: number,
 *     companies_updated: number,
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
    // TODO: Fase 3 - Implementar cálculo de estatísticas
    // 1. Parse body (mode, target)
    // 2. Calcular cpv_stats via agregações SQL
    // 3. Atualizar stats em entities
    // 4. Atualizar stats em companies
    // 5. Return stats

    return new Response(
      JSON.stringify({
        status: "stub",
        message: "compute-stats: ainda não implementado (Fase 3)",
        description: "Esta função irá recalcular todas as estatísticas agregadas (CPV, entidades, empresas)",
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[compute-stats] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
