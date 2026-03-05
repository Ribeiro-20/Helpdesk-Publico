/**
 * Edge Function: extract-companies
 *
 * Extrai e atualiza empresas adjudicatárias a partir dos contratos ingeridos.
 *
 * == FONTES DE DADOS ==
 * 1. Tabela contracts: campo winners (JSONB array ["NIF - Nome"])
 *    → empresas que GANHARAM o contrato
 * 2. Tabela contracts: campo competitors (texto)
 *    → empresas que PARTICIPARAM mas não ganharam
 * 3. Combinação de ambos permite calcular:
 *    - contracts_won (quantos ganhou)
 *    - contracts_participated (quantos participou)
 *    - win_rate (taxa de vitória)
 *
 * == LÓGICA ==
 * 1. Scan de todos os contratos para extrair NIFs de empresas
 * 2. Do campo winners[]: parse "NIF - Nome" → NIF + Nome
 * 3. Do campo competitors: parse texto (formato a determinar pela API)
 * 4. Para cada NIF de empresa:
 *    a) Se não existe na tabela companies → INSERT
 *    b) Se existe → UPDATE nome (o mais recente)
 * 5. A localização é inferida dos execution_locations dos contratos ganhos
 * 6. Estatísticas detalhadas são calculadas por compute-stats
 *
 * == PARSING DE "NIF - Nome" ==
 * O formato da API BASE para adjudicante e adjudicatarios é:
 *   "509000001 - Empresa Exemplo, Lda."
 * Parse: split(" - ", 2) → [NIF, Nome]
 *
 * == VALOR PARA O UTILIZADOR ==
 * - Saber quem são os concorrentes em cada área CPV
 * - Analisar quem ganha mais concursos em determinado sector
 * - Identificar empresas dominantes por entidade pública
 * - Perceber a taxa de vitória dos concorrentes
 * - Market share por sector/região
 *
 * == TABELA DESTINO ==
 * companies (ver migração 20260305010000)
 *
 * == SCHEDULE ==
 * A correr após ingest-contracts e extract-entities
 *
 * Request body:
 *   {
 *     tenant_id?:     string,
 *     nif_filter?:    string[],   // se fornecido, processa apenas estes NIFs
 *     since_hours?:   number      // processar apenas contratos das últimas N horas
 *   }
 *
 * Response:
 *   {
 *     contracts_scanned: number,
 *     nifs_found: number,
 *     companies_created: number,
 *     companies_updated: number,
 *     winners_extracted: number,
 *     competitors_extracted: number,
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
    // TODO: Fase 2 - Implementar extração de empresas
    // 1. Query contratos para winners e competitors
    // 2. Parse "NIF - Nome"
    // 3. Upsert na tabela companies
    // 4. Inferir localização
    // 5. Return stats

    return new Response(
      JSON.stringify({
        status: "stub",
        message: "extract-companies: ainda não implementado (Fase 2)",
        description: "Esta função irá extrair empresas adjudicatárias dos contratos ingeridos",
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[extract-companies] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
