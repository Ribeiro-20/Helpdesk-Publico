import { createClient } from "@/lib/supabase/server";
import { Building2, MapPin, BarChart3, Target, History, Award, PieChart, Search } from "lucide-react";

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

export default async function EntitiesPage() {
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

  let totalEntities = 0;
  if (tenantId) {
    const { count } = await supabase
      .from("entities")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    totalEntities = count ?? 0;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Entidades Públicas</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Perfil completo de todas as entidades adjudicantes -- municípios, ministérios, institutos,
          hospitais e empresas públicas que contratam no portal BASE
        </p>
        {totalEntities > 0 && (
          <p className="text-sm text-brand-600 font-medium mt-2">
            {totalEntities.toLocaleString("pt-PT")} entidades na base de dados
          </p>
        )}
      </div>

      {/* O que esta página vai mostrar */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">O que vais encontrar aqui</h2>
        <p className="text-sm text-gray-500 mb-5">
          Cada entidade pública que publica anúncios ou celebra contratos ganha um perfil
          completo. A grande pergunta que esta página responde é:
          <strong className="text-gray-700"> &quot;Onde devo concorrer?&quot;</strong>
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureItem
            icon={BarChart3}
            title="Volume de Contratação"
            description="Total de anúncios publicados, contratos celebrados, e valor anual contratado por cada entidade. Ranking das entidades que mais compram."
          />
          <FeatureItem
            icon={PieChart}
            title="CPVs Mais Frequentes"
            description="Para cada entidade, quais os sectores CPV em que mais contrata. Permite perceber se uma câmara investe mais em obras, TI, ou consultoria."
          />
          <FeatureItem
            icon={Award}
            title="Empresas Favoritas"
            description="Top empresas adjudicatárias por entidade -- com quem costuma contratar. Revela padrões de adjudicação e possíveis parceiros a vigiar."
          />
          <FeatureItem
            icon={MapPin}
            title="Localização e Tipo"
            description="Classificação por tipo (município, ministério, hospital, etc.) e localização geográfica. Permite filtrar por região e sector público."
          />
          <FeatureItem
            icon={History}
            title="Histórico de Actividade"
            description="Timeline de anúncios e contratos publicados ao longo do tempo. Detecta sazonalidade (ex: municípios contratam mais no Q4)."
          />
          <FeatureItem
            icon={Target}
            title="Radar de Oportunidades"
            description="Cruzamento automático: 'esta entidade costuma comprar CPVs na tua área, e publicou X concursos no último ano'. Funcionalidade premium."
          />
          <FeatureItem
            icon={Search}
            title="Pesquisa e Filtros"
            description="Pesquisar por nome, NIF, tipo de entidade, região, volume mínimo de contratação, ou CPVs contratados."
          />
        </div>
      </div>

      {/* Fontes de dados */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Fontes de dados</h2>
        <div className="space-y-3 text-sm text-gray-500">
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-50 text-blue-600 text-xs font-bold shrink-0 mt-0.5">1</span>
            <div>
              <p className="font-medium text-gray-700">Anúncios existentes</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Campos <code className="bg-surface-100 px-1 rounded">entity_nif</code> e <code className="bg-surface-100 px-1 rounded">entity_name</code>
                de cada anúncio já ingerido. Fonte primária e mais rápida.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-50 text-blue-600 text-xs font-bold shrink-0 mt-0.5">2</span>
            <div>
              <p className="font-medium text-gray-700">Contratos celebrados</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Campo <code className="bg-surface-100 px-1 rounded">adjudicante[]</code> dos contratos (formato &quot;NIF - Nome&quot;).
                Fonte mais rica com localização de execução.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-50 text-blue-600 text-xs font-bold shrink-0 mt-0.5">3</span>
            <div>
              <p className="font-medium text-gray-700">API GetInfoEntidades</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Endpoint <code className="bg-surface-100 px-1 rounded">GetInfoEntidades?nifEntidade=X</code> para enriquecimento
                (dados adicionais sobre a entidade). Usado opcionalmente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Classificação automática */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Classificação automática de tipo</h2>
        <p className="text-sm text-gray-500 mb-4">
          O sistema infere automaticamente o tipo de entidade a partir do nome oficial:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Município", pattern: "\"Câmara Municipal\", \"Município\"", color: "bg-blue-50 text-blue-700 border-blue-100" },
            { label: "Ministério", pattern: "\"Ministério\"", color: "bg-purple-50 text-purple-700 border-purple-100" },
            { label: "Instituto", pattern: "\"Instituto\"", color: "bg-indigo-50 text-indigo-700 border-indigo-100" },
            { label: "Saúde", pattern: "\"Hospital\", \"ARS\", \"ACES\"", color: "bg-red-50 text-red-700 border-red-100" },
            { label: "Ensino", pattern: "\"Universidade\", \"Politécnico\"", color: "bg-amber-50 text-amber-700 border-amber-100" },
            { label: "Empresa Pública", pattern: "sufixo \"EP\", \"SA\", \"EM\"", color: "bg-green-50 text-green-700 border-green-100" },
          ].map((type) => (
            <div key={type.label} className={`rounded-xl border p-3 ${type.color}`}>
              <p className="text-xs font-semibold">{type.label}</p>
              <p className="text-[10px] opacity-70 mt-0.5">{type.pattern}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Roadmap de implementação</h2>

        <PhaseCard phase={1} title="Extração de entidades" status="planned">
          <p>
            Edge Function <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">extract-entities</code> que
            percorre anúncios e contratos para extrair NIFs únicos de entidades.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Scan de announcements.entity_nif + contracts.contracting_entities</li>
            <li>Upsert na tabela entities com deduplicação por NIF</li>
            <li>Inferir entity_type a partir do nome</li>
            <li>Extrair localização mais frequente dos execution_locations</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={2} title="Listagem e perfil de entidade" status="planned">
          <p>
            Interface de listagem com cards e página de detalhe individual.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>Tabela/cards com: nome, tipo, localização, total contratos, valor total</li>
            <li>Filtros por tipo, região, volume, CPVs contratados</li>
            <li>Página de perfil: KPIs, gráficos de evolução, top CPVs, top empresas</li>
            <li>Lista de anúncios e contratos da entidade</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={3} title="Estatísticas e rankings" status="planned">
          <p>
            Cálculos por <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">compute-stats</code> para
            preencher os campos desnormalizados.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-400 mt-2">
            <li>total_announcements, total_contracts, total_value por entidade</li>
            <li>top_cpvs: Top 10 CPVs mais contratados [{"{code, count, description}"}]</li>
            <li>top_companies: Top 10 empresas adjudicadas [{"{nif, name, count, value}"}]</li>
            <li>Ranking geral de entidades por volume de contratação</li>
          </ul>
        </PhaseCard>

        <PhaseCard phase={4} title="Enriquecimento via API" status="planned">
          <p>
            Opcionalmente chamar <code className="text-xs bg-surface-100 px-1.5 py-0.5 rounded">GetInfoEntidades</code> para
            dados adicionais que não estão nos anúncios/contratos.
          </p>
        </PhaseCard>
      </div>

      {/* Empty state */}
      {totalEntities === 0 && (
        <div className="bg-surface-50 border border-dashed border-surface-200 rounded-xl p-8 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            Ainda não existem entidades na base de dados.
          </p>
          <p className="text-gray-300 text-xs mt-1">
            A Edge Function <code className="bg-surface-100 px-1.5 py-0.5 rounded">extract-entities</code> será implementada na Fase 2
            e irá extrair entidades automaticamente dos anúncios e contratos.
          </p>
        </div>
      )}
    </div>
  );
}
