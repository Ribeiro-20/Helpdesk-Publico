import { createClient } from "@/lib/supabase/server";
import { FileSignature, ArrowRightLeft, Link2, Filter, TrendingDown, Calendar, Building2, Factory } from "lucide-react";

export const dynamic = "force-dynamic";

function PhaseCard({
  phase,
  title,
  status,
  children,
}: {
  phase: number;
  title: string;
  status: "planned" | "in_progress" | "done";
  children: React.ReactNode;
}) {
  const statusStyles = {
    planned: "bg-surface-50 border-surface-200 text-gray-400",
    in_progress: "bg-amber-50/60 border-amber-200/60 text-amber-700",
    done: "bg-brand-50/60 border-brand-200/60 text-brand-700",
  };
  const statusLabels = {
    planned: "Planeado",
    in_progress: "Em progresso",
    done: "Concluído",
  };

  return (
    <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand-700 text-sm font-bold">
            {phase}
          </span>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusStyles[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      <div className="text-sm text-gray-500 space-y-3">{children}</div>
    </div>
  );
}

function FeatureItem({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-50 shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default async function ContractsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", user!.id)
    .maybeSingle();

  const tenantId = appUser?.tenant_id;

  // Contar contratos existentes (se a tabela já tiver dados)
  let totalContracts = 0;
  if (tenantId) {
    const { count } = await supabase
      .from("contracts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    totalContracts = count ?? 0;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FileSignature className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Contratos celebrados na contratação pública portuguesa -- dados do endpoint
          <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded mx-1">GetInfoContrato</code>
          da API BASE
        </p>
        {totalContracts > 0 && (
          <p className="text-sm text-brand-600 font-medium mt-2">
            {totalContracts.toLocaleString("pt-PT")} contratos na base de dados
          </p>
        )}
      </div>

      {/* O que esta página vai mostrar */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">O que vais encontrar aqui</h2>
        <p className="text-sm text-gray-500 mb-5">
          Depois de um concurso público terminar, é celebrado um contrato. Esta página mostra todos os
          contratos publicados no portal BASE, com informação crucial que não existe nos anúncios:
          <strong className="text-gray-700"> quem ganhou, quanto pagou, e quem concorreu</strong>.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureItem
            icon={ArrowRightLeft}
            title="Preço Base vs Preço Contratual"
            description="Compara o valor estimado do concurso com o valor final adjudicado. Mostra o desconto médio praticado por sector e permite estimar preços competitivos."
          />
          <FeatureItem
            icon={Factory}
            title="Empresa Vencedora"
            description="Para cada contrato, quem ganhou (adjudicatários) e quem participou (concorrentes). Liga directamente ao perfil da empresa na página Empresas."
          />
          <FeatureItem
            icon={Building2}
            title="Entidade Adjudicante"
            description="Qual a entidade pública que contratou. Permite navegar para o perfil completo da entidade e ver o seu histórico de contratação."
          />
          <FeatureItem
            icon={Link2}
            title="Ligação Anúncio → Contrato"
            description="Cada contrato é ligado ao anúncio original (quando existe), permitindo ver o ciclo completo: publicação → concurso → adjudicação → contrato."
          />
          <FeatureItem
            icon={Calendar}
            title="Timeline Completa"
            description="Datas de publicação, decisão de adjudicação, celebração do contrato, e fecho. Permite calcular tempos médios de adjudicação por sector."
          />
          <FeatureItem
            icon={TrendingDown}
            title="Modificações Contratuais"
            description="Aditamentos e alterações a contratos existentes. Detecta contratos que disparam em valor ou prazo (red flags de gestão)."
          />
          <FeatureItem
            icon={Filter}
            title="Filtros Avançados"
            description="Filtrar por CPV, entidade, empresa vencedora, intervalo de valor, tipo de procedimento, região, e intervalo de datas."
          />
        </div>
      </div>

      {/* Dados da API */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Campos disponíveis da API</h2>
        <p className="text-sm text-gray-500 mb-4">
          O endpoint <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">GetInfoContrato</code> retorna
          dados muito mais ricos que o endpoint de anúncios. Estes são os campos principais:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase">Campo API</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase">Coluna BD</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">idContrato</td><td className="py-2 pr-4 font-mono text-xs">base_contract_id</td><td className="py-2 text-gray-500">Identificador único do contrato</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">objectoContrato</td><td className="py-2 pr-4 font-mono text-xs">object</td><td className="py-2 text-gray-500">Objecto do contrato (título)</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">adjudicante[]</td><td className="py-2 pr-4 font-mono text-xs">contracting_entities</td><td className="py-2 text-gray-500">Entidades adjudicantes (formato &quot;NIF - Nome&quot;)</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">adjudicatarios[]</td><td className="py-2 pr-4 font-mono text-xs">winners</td><td className="py-2 text-gray-500">Empresas vencedoras (formato &quot;NIF - Nome&quot;)</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">concorrentes</td><td className="py-2 pr-4 font-mono text-xs">competitors</td><td className="py-2 text-gray-500">Outras empresas que participaram no concurso</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">precoContratual</td><td className="py-2 pr-4 font-mono text-xs">contract_price</td><td className="py-2 text-gray-500">Valor final do contrato (o que se paga)</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">precoBaseProcedimento</td><td className="py-2 pr-4 font-mono text-xs">base_price</td><td className="py-2 text-gray-500">Preço base estimado no procedimento</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">PrecoTotalEfetivo</td><td className="py-2 pr-4 font-mono text-xs">effective_price</td><td className="py-2 text-gray-500">Preço total efetivo (incluindo aditamentos)</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">dataDecisaoAdjudicacao</td><td className="py-2 pr-4 font-mono text-xs">award_date</td><td className="py-2 text-gray-500">Data em que foi decidido quem ganhou</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">dataCelebracaoContrato</td><td className="py-2 pr-4 font-mono text-xs">signing_date</td><td className="py-2 text-gray-500">Data de assinatura do contrato</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">localExecucao[]</td><td className="py-2 pr-4 font-mono text-xs">execution_locations</td><td className="py-2 text-gray-500">Locais de execução (&quot;País, Distrito, Concelho&quot;)</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">cpv[]</td><td className="py-2 pr-4 font-mono text-xs">cpv_list</td><td className="py-2 text-gray-500">Códigos CPV do contrato</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">tipoprocedimento</td><td className="py-2 pr-4 font-mono text-xs">procedure_type</td><td className="py-2 text-gray-500">Concurso Público, Ajuste Directo, etc.</td></tr>
              <tr><td className="py-2 pr-4 font-mono text-xs text-brand-600">prazoExecucao</td><td className="py-2 pr-4 font-mono text-xs">execution_deadline_days</td><td className="py-2 text-gray-500">Prazo de execução em dias</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Roadmap */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Roadmap de implementação</h2>

        <PhaseCard phase={1} title="Ingestão de contratos" status="planned">
          <p>
            Criar a Edge Function <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">ingest-contracts</code> que
            consome o endpoint <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">GetInfoContrato?Ano=YYYY</code> da API BASE.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Fetch por ano, filtrar por intervalo de datas</li>
            <li>Mapear todos os campos da API para a tabela <code className="bg-surface-100 px-1 rounded">contracts</code></li>
            <li>Deduplicação via SHA-256 hash (mesmo padrão dos anúncios)</li>
            <li>Ligar automaticamente ao anúncio existente via <code className="bg-surface-100 px-1 rounded">nAnuncio</code></li>
            <li>Extrair NIF da entidade e da empresa vencedora do formato &quot;NIF - Nome&quot;</li>
            <li>Batch insert/update com estatísticas de execução</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={2} title="Tabela de contratos com filtros" status="planned">
          <p>
            Construir a interface de listagem de contratos, seguindo o padrão da página de Anúncios.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Tabela paginada com colunas: Objecto, Entidade, Vencedor, Preço Base, Preço Contratual, Data, CPV</li>
            <li>Badge de &quot;desconto&quot; mostrando a diferença percentual entre preço base e contratual</li>
            <li>Filtros: por CPV, entidade, empresa vencedora, intervalo de valor, tipo de procedimento, ano</li>
            <li>Links para: detalhe do contrato, perfil da entidade, perfil da empresa</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={3} title="Detalhe do contrato" status="planned">
          <p>
            Página de detalhe individual de cada contrato, com toda a informação disponível.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Header: objecto, entidade, empresa vencedora, valores</li>
            <li>Timeline visual: publicação → adjudicação → celebração → fecho</li>
            <li>Card de participantes: entidades adjudicantes + empresas vencedoras + concorrentes</li>
            <li>Card de execução: prazo, localização, regime jurídico</li>
            <li>Link para o anúncio original (se existir no sistema)</li>
            <li>Histórico de modificações contratuais (aditamentos)</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={4} title="Modificações contratuais" status="planned">
          <p>
            Edge Function <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">ingest-contract-mods</code> para
            acompanhar aditamentos e alterações a contratos.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Consumir <code className="bg-surface-100 px-1 rounded">GetInfoModContrat</code></li>
            <li>Calcular deltas de preço por modificação</li>
            <li>Mostrar timeline de modificações no detalhe do contrato</li>
            <li>Alertar quando um contrato sofre alterações significativas (&gt;20% do valor)</li>
          </ul>
        </PhaseCard>
      </div>

      {/* Empty state */}
      {totalContracts === 0 && (
        <div className="bg-surface-50 border border-dashed border-surface-200 rounded-xl p-8 text-center">
          <FileSignature className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            Ainda não existem contratos na base de dados.
          </p>
          <p className="text-gray-300 text-xs mt-1">
            A Edge Function <code className="bg-surface-100 px-1.5 py-0.5 rounded">ingest-contracts</code> será implementada na Fase 1.
          </p>
        </div>
      )}
    </div>
  );
}
