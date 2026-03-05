/**
 * Edge Function: ingest-contracts
 *
 * Ingere contratos celebrados a partir do endpoint GetInfoContrato da API BASE.
 * 
 * == DADOS DISPONÍVEIS NA API ==
 * O endpoint GET /APIBase2/GetInfoContrato aceita:
 *   - idContrato: ID do contrato
 *   - IdProcedimento: ID do procedimento
 *   - nifEntidade: NIF da entidade adjudicante
 *   - nAnuncio: número do anúncio (liga anúncio → contrato)
 *   - Ano: ano (permite ingestão por ano completo)
 *
 * Campos retornados pela API:
 *   - idContrato, nAnuncio, TipoAnuncio, idINCM
 *   - tipoContrato[], idprocedimento, tipoprocedimento
 *   - objectoContrato, descContrato
 *   - adjudicante[] ("NIF - Nome")      → entidades públicas
 *   - adjudicatarios[] ("NIF - Nome")    → empresas vencedoras
 *   - concorrentes                       → empresas concorrentes
 *   - dataPublicacao, dataCelebracaoContrato, dataDecisaoAdjudicacao, dataFechoContrato
 *   - precoContratual, precoBaseProcedimento, PrecoTotalEfetivo
 *   - cpv[] ("CÓDIGO - Descrição")
 *   - prazoExecucao (dias)
 *   - localExecucao[] ("País, Distrito, Concelho")
 *   - fundamentacao, regime
 *   - ProcedimentoCentralizado (Sim/Não), ContratEcologico (Sim/Não)
 *   - tipoFimContrato, linkPecasProc, Observacoes
 *   - numAcordoQuadro, DescrAcordoQuadro
 *
 * == LÓGICA DE INGESTÃO ==
 * 1. Recebe POST com { from_date?, to_date?, tenant_id?, dry_run? }
 * 2. Faz GET /GetInfoContrato?Ano=YYYY para cada ano no intervalo
 * 3. Filtra por data de publicação no intervalo pedido
 * 4. Calcula SHA-256 do payload para deduplicação
 * 5. Compara com contratos existentes (por base_contract_id)
 * 6. Insere novos, atualiza alterados, ignora iguais
 * 7. Tenta ligar cada contrato ao anúncio existente (via nAnuncio)
 * 8. Extrai entidades (adjudicante) e empresas (adjudicatarios) para
 *    posterior processamento por extract-entities e extract-companies
 *
 * == TABELA DESTINO ==
 * contracts (ver migração 20260305010000)
 *
 * == SCHEDULE (cron) ==
 * A correr a cada 2 horas, logo após ingest-base
 *
 * Request body:
 *   {
 *     from_date?:  string,   // YYYY-MM-DD, default: hoje - 7 dias
 *     to_date?:    string,   // YYYY-MM-DD, default: hoje
 *     tenant_id?:  string,   // default: primeiro tenant
 *     dry_run?:    boolean   // se true, não persiste nada
 *   }
 *
 * Response:
 *   {
 *     fetched: number,
 *     inserted: number,
 *     updated: number,
 *     skipped: number,
 *     linked_to_announcements: number,
 *     entities_extracted: number,
 *     companies_extracted: number,
 *     errors: number,
 *     dry_run: boolean,
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
    // TODO: Fase 1 - Implementar ingestão de contratos
    // 1. Parse body (from_date, to_date, tenant_id, dry_run)
    // 2. GET /APIBase2/GetInfoContrato?Ano=YYYY
    // 3. Map payload → contracts table schema
    // 4. Dedup via SHA-256 hash (reutilizar canonicalJson.ts)
    // 5. Batch upsert
    // 6. Link to existing announcements via nAnuncio
    // 7. Return stats

    return new Response(
      JSON.stringify({
        status: "stub",
        message: "ingest-contracts: ainda não implementado (Fase 1)",
        description: "Esta função irá ingerir contratos celebrados do endpoint GetInfoContrato da API BASE",
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[ingest-contracts] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
