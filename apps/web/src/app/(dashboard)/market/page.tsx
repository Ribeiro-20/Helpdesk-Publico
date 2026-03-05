import { createClient } from "@/lib/supabase/server";
import { TrendingUp, BarChart3, PieChart, Target, ArrowUpDown, Map, Activity, Lightbulb, Calculator, Zap } from "lucide-react";

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

export default async function MarketPage() {
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

  let totalCpvStats = 0;
  if (tenantId) {
    const { count } = await supabase
      .from("cpv_stats")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    totalCpvStats = count ?? 0;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Mercado</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Inteligência de mercado da contratação pública portuguesa -- análise por sector CPV,
          tendências, preços e oportunidades
        </p>
        {totalCpvStats > 0 && (
          <p className="text-sm text-brand-600 font-medium mt-2">
            {totalCpvStats.toLocaleString("pt-PT")} sectores CPV analisados
          </p>
        )}
      </div>

      {/* O que esta página vai mostrar */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">O que vais encontrar aqui</h2>
        <p className="text-sm text-gray-500 mb-5">
          Esta é a página que transforma dados brutos em inteligência de mercado. Cruza anúncios,
          contratos, entidades e empresas para dar uma visão macro do mercado de contratação pública.
          A pergunta:
          <strong className="text-gray-700"> &quot;Qual é o tamanho do mercado na minha área e como está a evoluir?&quot;</strong>
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureItem
            icon={BarChart3}
            title="Dashboard por Sector CPV"
            description="Para cada divisão CPV: total de concursos, total de contratos, valor total, número de entidades e empresas activas. Visão macro do mercado."
          />
          <FeatureItem
            icon={Activity}
            title="Evolução Temporal"
            description="Gráficos de evolução mensal e anual: número de concursos, valor contratado, e crescimento year-over-year. Detecta tendências e sazonalidade."
          />
          <FeatureItem
            icon={ArrowUpDown}
            title="Análise Preço Base vs Contratual"
            description="Rácio médio entre preço base e preço adjudicado por sector. Desconto médio praticado, permitindo estimar preços competitivos para novas propostas."
          />
          <FeatureItem
            icon={PieChart}
            title="Concentração de Mercado"
            description="Top 10 entidades e empresas por CPV. Market share das empresas dominantes. Índice de concentração (poucas empresas vs muitas)."
          />
          <FeatureItem
            icon={Map}
            title="Distribuição Geográfica"
            description="Mapa de calor de contratação por região (distrito/concelho). Baseado nos execution_locations dos contratos. Onde há mais oportunidades."
          />
          <FeatureItem
            icon={Target}
            title="Radar de Oportunidades"
            description="Cruzamento dos CPVs dos seus clientes com as tendências de mercado. Identifica sectores em crescimento e entidades com mais actividade recente."
          />
          <FeatureItem
            icon={Calculator}
            title="Estimativa de Preço Vencedor"
            description="Com base no histórico de preço base vs preço contratual por CPV, estima o intervalo de preço competitivo para um novo concurso."
          />
          <FeatureItem
            icon={Lightbulb}
            title="Recomendações Automáticas"
            description="Sistema sugere: 'O CPV 71240000 cresceu 25% este ano, as entidades X e Y estão a contratar mais nesta área, e o desconto médio é 15%'."
          />
        </div>
      </div>

      {/* Métricas calculadas */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Métricas calculadas por CPV</h2>
        <p className="text-sm text-gray-500 mb-4">
          A tabela <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">cpv_stats</code> é recalculada
          periodicamente pela Edge Function <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">compute-stats</code>.
          Para cada código CPV com actividade:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase">Métrica</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase">Coluna</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Anúncios</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">total_announcements</td><td className="py-2 text-gray-400">Total histórico + últimos 30d + últimos 365d</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Contratos</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">total_contracts</td><td className="py-2 text-gray-400">Total histórico + últimos 30d + últimos 365d</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Valor total</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">total_value</td><td className="py-2 text-gray-400">Soma de preço contratual de todos os contratos</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Valor médio</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">avg_contract_value</td><td className="py-2 text-gray-400">Valor médio por contrato neste CPV</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Min / Max / Mediana</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">min / max / median</td><td className="py-2 text-gray-400">Distribuição de valores (para estimar preços)</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Rácio de preço</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">avg_price_ratio</td><td className="py-2 text-gray-400">preço_contratual / preço_base (média)</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Desconto médio</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">avg_discount_pct</td><td className="py-2 text-gray-400">(1 - ratio) * 100 → &quot;em média, ganha-se com 15% abaixo do preço base&quot;</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Entidades activas</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">total_entities</td><td className="py-2 text-gray-400">Nº de entidades que compram neste CPV</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Empresas activas</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">total_companies</td><td className="py-2 text-gray-400">Nº de empresas que ganham neste CPV</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Crescimento YoY</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">yoy_growth_pct</td><td className="py-2 text-gray-400">Crescimento anual em % (últimos 12m vs 12m anteriores)</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Top 10 entidades</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">top_entities</td><td className="py-2 text-gray-400">JSONB: [{"{nif, name, count, value}"}]</td></tr>
              <tr><td className="py-2 pr-4 text-gray-700 font-medium">Top 10 empresas</td><td className="py-2 pr-4 font-mono text-xs text-brand-600">top_companies</td><td className="py-2 text-gray-400">JSONB: [{"{nif, name, count, value}"}]</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Exemplo visual */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Exemplo: Visão de mercado por CPV (futuro)</h2>
        <div className="bg-surface-50 rounded-xl p-5 space-y-4">
          <div>
            <p className="font-semibold text-gray-900">71240000-2 -- Serviços de arquitectura, engenharia e planeamento</p>
            <p className="text-xs text-gray-400">Divisão 71 &middot; Serviços de arquitectura e engenharia</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Contratos (12m)", value: "342" },
              { label: "Valor total", value: "45.2M\u20AC" },
              { label: "Valor médio", value: "132k\u20AC" },
              { label: "Desconto médio", value: "-14.3%" },
              { label: "Crescimento YoY", value: "+18.7%" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg p-3 border border-surface-200">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-3 border border-surface-200">
              <p className="text-xs font-medium text-gray-500 mb-2">Top Entidades (quem mais compra)</p>
              <div className="space-y-1">
                {[
                  "1. CM Lisboa -- 28 contratos, 4.8M\u20AC",
                  "2. IP - Infraestruturas -- 19 contratos, 6.2M\u20AC",
                  "3. CM Porto -- 15 contratos, 2.1M\u20AC",
                  "4. REFER -- 12 contratos, 3.8M\u20AC",
                  "5. CM Sintra -- 10 contratos, 1.2M\u20AC",
                ].map((line) => (
                  <p key={line} className="text-xs text-gray-400">{line}</p>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-surface-200">
              <p className="text-xs font-medium text-gray-500 mb-2">Top Empresas (quem mais ganha)</p>
              <div className="space-y-1">
                {[
                  "1. Eng. Consultores, Lda. -- 15 contratos, 2.3M\u20AC",
                  "2. Atelier Projecto, SA -- 12 contratos, 1.8M\u20AC",
                  "3. Arqui+Eng -- 9 contratos, 1.1M\u20AC",
                  "4. Projectos Globais -- 7 contratos, 890k\u20AC",
                  "5. Norte Engenharia -- 6 contratos, 720k\u20AC",
                ].map((line) => (
                  <p key={line} className="text-xs text-gray-400">{line}</p>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-surface-200">
            <p className="text-xs font-medium text-gray-500 mb-2">Distribuição de valores</p>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>Min: <strong className="text-gray-700">2.5k\u20AC</strong></span>
              <span>Mediana: <strong className="text-gray-700">85k\u20AC</strong></span>
              <span>Média: <strong className="text-gray-700">132k\u20AC</strong></span>
              <span>Max: <strong className="text-gray-700">1.2M\u20AC</strong></span>
            </div>
            <p className="text-[10px] text-gray-300 mt-2">
              Preço base médio: 154k\u20AC &middot; Preço contratual médio: 132k\u20AC &middot; Desconto médio: 14.3%
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-300 mt-3 text-center italic">
          Exemplo ilustrativo -- dados fictícios
        </p>
      </div>

      {/* Roadmap */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Roadmap de implementação</h2>

        <PhaseCard phase={1} title="Cálculo de estatísticas base" status="planned">
          <p>
            Edge Function <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">compute-stats</code> que
            agrega dados de anúncios e contratos por CPV.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Contagem de anúncios e contratos por CPV (total, 30d, 365d)</li>
            <li>Cálculo de valores: total, avg, min, max, mediana</li>
            <li>Rácio preço base vs contratual e desconto médio</li>
            <li>Contagem de entidades e empresas únicas por CPV</li>
            <li>Upsert em cpv_stats com timestamp de computação</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={2} title="Dashboard de mercado" status="planned">
          <p>
            Interface de visualização com tabelas e KPIs agregados.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Tabela de sectores CPV ordenável por: valor, nº contratos, crescimento</li>
            <li>Filtros: por divisão CPV (2 dígitos), intervalo de valor, crescimento mín/máx</li>
            <li>KPI cards gerais: total mercado, crescimento médio, maior sector</li>
            <li>Drill-down: clicar num CPV mostra detalhe com top entidades e empresas</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={3} title="Tendências e evolução" status="planned">
          <p>
            Gráficos de evolução temporal e cálculo de crescimento year-over-year.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Gráficos de barras/linhas com evolução mensal e anual</li>
            <li>Comparação entre sectores CPV</li>
            <li>Destaque de sectores em crescimento vs declínio</li>
            <li>Sazonalidade por tipo de entidade</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={4} title="Funcionalidades premium" status="planned">
          <p>
            Funcionalidades avançadas que diferenciam como produto SaaS.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Estimativa de preço vencedor: baseada no desconto médio por CPV</li>
            <li>Radar de oportunidades: cruzamento CPVs do cliente com tendências</li>
            <li>Recomendações automáticas: &quot;Este CPV cresceu 25%, estas entidades estão activas&quot;</li>
            <li>Distribuição geográfica (mapa de calor por região)</li>
            <li>Probabilidade de vitória: baseada no histórico por CPV + entidade + empresa</li>
          </ul>
        </PhaseCard>
      </div>

      {/* Visão de produto */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-3">De monitor de anúncios a plataforma de inteligência</h2>
        <div className="space-y-3 text-sm text-gray-500">
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-gray-700">Nível 1 -- Scraper:</strong> Recolher e mostrar anúncios (o que já temos).
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p>
              <strong className="text-gray-700">Nível 2 -- Monitor:</strong> Alertas por CPV, entidade, valor e região (próximo passo).
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p>
              <strong className="text-gray-700">Nível 3 -- Intelligence:</strong> Análise de mercado, concorrência, estimativa de preços, e recomendações (esta página). O &quot;Crunchbase da contratação pública&quot;.
            </p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {totalCpvStats === 0 && (
        <div className="bg-surface-50 border border-dashed border-surface-200 rounded-xl p-8 text-center">
          <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            Ainda não existem estatísticas de mercado calculadas.
          </p>
          <p className="text-gray-300 text-xs mt-1">
            A Edge Function <code className="bg-surface-100 px-1.5 py-0.5 rounded">compute-stats</code> será implementada na Fase 3
            e irá calcular agregações a partir de anúncios e contratos.
          </p>
        </div>
      )}
    </div>
  );
}
