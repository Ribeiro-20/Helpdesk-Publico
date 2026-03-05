import { createClient } from "@/lib/supabase/server";
import { Factory, Trophy, Target, TrendingUp, BarChart3, Building2, PieChart, GitCompare, Search, Shield } from "lucide-react";

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

export default async function CompaniesPage() {
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

  let totalCompanies = 0;
  if (tenantId) {
    const { count } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    totalCompanies = count ?? 0;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Factory className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Perfil de todas as empresas que participam em concursos públicos -- adjudicatárias,
          concorrentes, market share e análise de concorrência
        </p>
        {totalCompanies > 0 && (
          <p className="text-sm text-brand-600 font-medium mt-2">
            {totalCompanies.toLocaleString("pt-PT")} empresas na base de dados
          </p>
        )}
      </div>

      {/* O que esta página vai mostrar */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">O que vais encontrar aqui</h2>
        <p className="text-sm text-gray-500 mb-5">
          Cada empresa que ganha ou participa num concurso público ganha um perfil com
          todo o seu historial. A pergunta chave:
          <strong className="text-gray-700"> &quot;Quem são os meus concorrentes e como se comparam comigo?&quot;</strong>
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureItem
            icon={Trophy}
            title="Histórico de Vitórias"
            description="Quantos concursos ganhou, valor total adjudicado, e evolução ao longo do tempo. O 'CV público' de cada empresa."
          />
          <FeatureItem
            icon={Target}
            title="Taxa de Vitória"
            description="Quando os dados de concorrentes estão disponíveis: rácio de vitórias vs participações. Mede a competitividade real da empresa."
          />
          <FeatureItem
            icon={PieChart}
            title="Especialização CPV"
            description="Em que sectores CPV a empresa ganha mais. Revela a sua área de especialização e permite identificar concorrentes directos."
          />
          <FeatureItem
            icon={Building2}
            title="Entidades com quem Trabalha"
            description="Top entidades públicas de quem a empresa ganha contratos. Mostra relações recorrentes e possíveis dependências."
          />
          <FeatureItem
            icon={BarChart3}
            title="Ranking por Sector"
            description="Top empresas por CPV, por valor, por número de contratos. Quem domina cada mercado."
          />
          <FeatureItem
            icon={GitCompare}
            title="Análise de Concorrência"
            description="Para empresas que concorreram ao mesmo contrato: quem ganhou, a que preço, e quantas vezes. Head-to-head entre concorrentes."
          />
          <FeatureItem
            icon={TrendingUp}
            title="Evolução e Tendência"
            description="Valor anual adjudicado, número de contratos por ano, e crescimento. Empresas em ascensão vs em declínio."
          />
          <FeatureItem
            icon={Search}
            title="Pesquisa Avançada"
            description="Pesquisar por nome, NIF, CPV de especialização, região, volume mínimo, ou taxa de vitória."
          />
        </div>
      </div>

      {/* Fontes de dados */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Fontes de dados</h2>
        <div className="space-y-3 text-sm text-gray-500">
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-green-50 text-green-600 text-xs font-bold shrink-0 mt-0.5">1</span>
            <div>
              <p className="font-medium text-gray-700">Adjudicatários (vencedores)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Campo <code className="bg-surface-100 px-1 rounded">adjudicatarios[]</code> dos contratos.
                Formato: <code className="bg-surface-100 px-1 rounded">&quot;509000001 - Empresa Exemplo, Lda.&quot;</code>.
                Permite extrair NIF + Nome + contar vitórias + somar valores.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-green-50 text-green-600 text-xs font-bold shrink-0 mt-0.5">2</span>
            <div>
              <p className="font-medium text-gray-700">Concorrentes (participantes)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Campo <code className="bg-surface-100 px-1 rounded">concorrentes</code> dos contratos.
                Quando disponível, permite calcular a taxa de vitória: vitórias / participações.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-green-50 text-green-600 text-xs font-bold shrink-0 mt-0.5">3</span>
            <div>
              <p className="font-medium text-gray-700">Localização</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Inferida a partir dos <code className="bg-surface-100 px-1 rounded">execution_locations</code> dos
                contratos ganhos. A localização mais frequente é usada como base da empresa.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Exemplo de perfil */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Exemplo: Perfil de empresa (futuro)</h2>
        <div className="bg-surface-50 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Construções Exemplo, SA</p>
              <p className="text-xs text-gray-400">NIF: 509000001 &middot; Lisboa</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
              Activa
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Contratos ganhos", value: "47" },
              { label: "Valor total", value: "12.3M\u20AC" },
              { label: "Taxa de vitória", value: "38%" },
              { label: "Valor médio", value: "261k\u20AC" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg p-3 border border-surface-200">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-3 border border-surface-200">
              <p className="text-xs font-medium text-gray-500 mb-2">Especialização CPV</p>
              <div className="space-y-1">
                {["45210000 - Construção de edifícios (23 contratos)", "45233000 - Estradas (12 contratos)", "71320000 - Engenharia (8 contratos)"].map((cpv) => (
                  <p key={cpv} className="text-xs text-gray-400">{cpv}</p>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-surface-200">
              <p className="text-xs font-medium text-gray-500 mb-2">Top Entidades</p>
              <div className="space-y-1">
                {["CM Lisboa (8 contratos, 3.2M\u20AC)", "CM Sintra (5 contratos, 1.8M\u20AC)", "IP - Infraestruturas (4 contratos, 2.1M\u20AC)"].map((ent) => (
                  <p key={ent} className="text-xs text-gray-400">{ent}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-300 mt-3 text-center italic">
          Exemplo ilustrativo -- dados fictícios
        </p>
      </div>

      {/* Roadmap */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Roadmap de implementação</h2>

        <PhaseCard phase={1} title="Extração de empresas" status="planned">
          <p>
            Edge Function <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">extract-companies</code> que
            percorre contratos e extrai NIFs de adjudicatários e concorrentes.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Parse do formato &quot;NIF - Nome&quot; dos campos adjudicatarios[]</li>
            <li>Parse do campo concorrentes (texto livre, formato a determinar)</li>
            <li>Upsert na tabela companies com deduplicação por NIF</li>
            <li>Inferir localização dos execution_locations dos contratos ganhos</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={2} title="Listagem e perfil de empresa" status="planned">
          <p>
            Interface de listagem com ranking e página de detalhe individual.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Tabela com: nome, NIF, contratos ganhos, valor total, taxa de vitória, especialização</li>
            <li>Ordenação por: valor, nº contratos, taxa vitória</li>
            <li>Filtros por CPV, entidade, região, volume</li>
            <li>Perfil individual: KPIs, especialização CPV, top entidades, lista de contratos</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={3} title="Estatísticas e rankings" status="planned">
          <p>
            Cálculo de estatísticas desnormalizadas por <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">compute-stats</code>.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>contracts_won, total_value_won, avg_contract_value por empresa</li>
            <li>win_rate = contracts_won / contracts_participated * 100</li>
            <li>cpv_specialization: Top CPVs [{"{code, count, value}"}]</li>
            <li>top_entities: Top entidades [{"{nif, name, count, value}"}]</li>
            <li>Ranking geral e por sector CPV</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={4} title="Análise de concorrência" status="planned">
          <p>
            Funcionalidade premium: comparar empresas head-to-head.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Selecionar 2+ empresas e ver contratos em que ambas participaram</li>
            <li>Quem ganhou em cada caso, a que preço</li>
            <li>Sobreposição de CPVs e entidades</li>
            <li>Visualização comparativa de métricas</li>
          </ul>
        </PhaseCard>
      </div>

      {/* Valor de negócio */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-3">Valor de negócio</h2>
        <div className="space-y-2 text-sm text-gray-500">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
            <p><strong className="text-gray-700">Para empresas:</strong> perceber quem são os concorrentes directos, qual a sua taxa de vitória, e em que entidades têm mais presença.</p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
            <p><strong className="text-gray-700">Para consultores:</strong> aconselhar clientes sobre em que concursos têm maior probabilidade de ganhar, com base no histórico.</p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
            <p><strong className="text-gray-700">Para jornalistas:</strong> investigar padrões de adjudicação, empresas que ganham repetidamente na mesma entidade, ou concentração de mercado.</p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {totalCompanies === 0 && (
        <div className="bg-surface-50 border border-dashed border-surface-200 rounded-xl p-8 text-center">
          <Factory className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            Ainda não existem empresas na base de dados.
          </p>
          <p className="text-gray-300 text-xs mt-1">
            A Edge Function <code className="bg-surface-100 px-1.5 py-0.5 rounded">extract-companies</code> será implementada na Fase 2
            e irá extrair empresas automaticamente dos contratos.
          </p>
        </div>
      )}
    </div>
  );
}
