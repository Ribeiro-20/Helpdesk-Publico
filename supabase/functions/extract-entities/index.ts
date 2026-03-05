/**
 * Edge Function: extract-entities
 *
 * Extrai e atualiza entidades públicas a partir dos dados já ingeridos
 * (anúncios + contratos) e opcionalmente enriquece via GetInfoEntidades.
 *
 * == FONTES DE DADOS ==
 * 1. Tabela announcements: campos entity_nif + entity_name
 * 2. Tabela contracts: campo contracting_entities (JSONB array ["NIF - Nome"])
 *    + execution_locations para localização
 * 3. API GetInfoEntidades?nifEntidade=X (enriquecimento opcional)
 *
 * == LÓGICA ==
 * 1. Scan de anúncios e contratos para NIFs únicos de entidades
 * 2. Para cada NIF encontrado:
 *    a) Se não existe na tabela entities → INSERT
 *    b) Se existe → UPDATE com dados mais recentes
 * 3. Inferência de entity_type a partir do nome:
 *    - "Câmara Municipal" / "Município" → município
 *    - "Ministério" → ministério
 *    - "Instituto" → instituto
 *    - "Universidade" / "Politécnico" → ensino
 *    - "Hospital" / "Centro Hospitalar" / "ARS" / "ACES" → saúde
 *    - "EP" / "SA" / "EM" (sufixos) → empresa_publica
 *    - Outros → outro
 * 4. Extração de localização:
 *    - De execution_locations dos contratos (formato "País, Distrito, Concelho")
 *    - Localização mais frequente = localização da entidade
 * 5. Opcionalmente: chamar GetInfoEntidades para enriquecimento
 *    (dados adicionais sobre a entidade)
 * 6. Estatísticas são calculadas por compute-stats separadamente
 *
 * == VALOR PARA O UTILIZADOR ==
 * - Perfil completo de cada entidade pública
 * - Saber quem são os maiores compradores
 * - Perceber em que regiões há mais oportunidades
 * - Filtrar oportunidades por tipo de entidade (só municípios, só hospitais, etc.)
 *
 * == TABELA DESTINO ==
 * entities (ver migração 20260305010000)
 *
 * == SCHEDULE ==
 * A correr após ingest-contracts, tipicamente a cada 2 horas
 *
 * Request body:
 *   {
 *     tenant_id?:     string,
 *     enrich_api?:    boolean,    // se true, chama GetInfoEntidades (mais lento)
 *     nif_filter?:    string[],   // se fornecido, processa apenas estes NIFs
 *     since_hours?:   number      // processar apenas anúncios/contratos das últimas N horas
 *   }
 *
 * Response:
 *   {
 *     nifs_found: number,
 *     entities_created: number,
 *     entities_updated: number,
 *     api_enriched: number,
 *     types_inferred: { [type: string]: number },
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
    // TODO: Fase 2 - Implementar extração de entidades
    // 1. Query anúncios e contratos para NIFs únicos
    // 2. Upsert na tabela entities
    // 3. Inferir entity_type a partir do nome
    // 4. Extrair localização mais frequente
    // 5. Opcionalmente enriquecer via API

    return new Response(
      JSON.stringify({
        status: "stub",
        message: "extract-entities: ainda não implementado (Fase 2)",
        description: "Esta função irá extrair entidades públicas dos anúncios e contratos ingeridos",
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[extract-entities] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
