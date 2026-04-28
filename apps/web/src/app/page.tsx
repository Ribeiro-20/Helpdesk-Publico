import Link from "next/link";
import {
  FileText,
  Landmark,
  Building2,
  FileSearch,
  ScanSearch,
} from "lucide-react";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import { createAdminClient } from "@/lib/supabase/server";
import InfoPopover from "@/components/InfoPopover";
import type { ElementType } from "react";

export const dynamic = "force-dynamic";

const BODY_BG = "rgba(248, 250, 252, 1)";
const GREEN = "rgba(74, 222, 128, 1)";

type HomeStats = {
  contracts: number;
  entities: number;
  companies: number;
};

function integer(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value);
}

async function resolveTenantId() {
  const supabase = await createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  return tenant?.id ?? null;
}

async function getCountByTable(
  table: "contracts" | "entities" | "companies",
  tenantId: string,
): Promise<number> {
  const supabase = await createAdminClient();

  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  return count ?? 0;
}

export default async function HomePage() {
  const tenantId = await resolveTenantId();

  let stats: HomeStats = {
    contracts: 0,
    entities: 0,
    companies: 0,
  };

  if (tenantId) {
    const [contracts, entities, companies] = await Promise.all([
      getCountByTable("contracts", tenantId),
      getCountByTable("entities", tenantId),
      getCountByTable("companies", tenantId),
    ]);

    stats = { contracts, entities, companies };
  }

  const cards = [
    {
      icon: FileText,
      title: "Contratos Públicos",
      description: "Consulte a informação detalhada dos contratos públicos",
      href: "/mercado-publico",
    },
    {
      icon: Landmark,
      title: "Adjudicantes",
      description:
        "Consulte as Entidades Adjudicantes com contratos públicos publicados",
      href: "/estatisticas-publico",
    },
    {
      icon: Building2,
      title: "Adjudicatários",
      description:
        "Consulte os Adjudicatários envolvidos em contratos públicos",
      href: "/estatisticas-privado",
    },
    {
      icon: FileSearch,
      title: "Oportunidades\nno Mercado Público",
      description:
        "Consulte oportunidades de negócio agregadas a partir de múltiplas fontes do mercado público",
      href: "/oportunidades",
    },
    {
      icon: ScanSearch,
      title: "Market Intelligence",
      italicTitle: true,
      description:
        "Consulte todos os contratos públicos a terminar ou em fase de renovação (área reservada a subscritores do serviço).",
      href: "/login-mi",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      <Header />

      <main className="flex-1 relative overflow-hidden">
        <div
          className="absolute pointer-events-none"
          style={{
            left: "-130px",
            top: "-30px",
            width: "340px",
            height: "340px",
            borderRadius: "50%",
            border: "1.5px dashed #94a3b8",
            opacity: 0.7,
          }}
        />
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            left: "255px",
            top: "95px",
            width: "25px",
            height: "25px",
            background: GREEN,
          }}
        />

        <div
          className="absolute pointer-events-none"
          style={{
            right: "-180px",
            bottom: "-60px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            border: "1.5px dashed #94a3b8",
            opacity: 0.7,
          }}
        />
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            right: "50px",
            bottom: "100px",
            width: "180px",
            height: "180px",
            background: GREEN,
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-16">
          <div className="flex items-center justify-center gap-2 mb-8 md:mb-12">
            <h1 className="text-3xl md:text-[2.6rem] font-extrabold text-gray-900 text-center tracking-tight">
              Mercado Público
            </h1>
            <InfoPopover
              text="A informação apresentada resulta da agregação de dados provenientes de fontes oficiais do mercado público, no âmbito do enquadramento legal da Contratação Pública em Portugal. Parte da informação é tratada pelo Helpdesk Público com recurso a tecnologia e modelos próprios de análise, incluindo inteligência artificial aplicada ao tratamento e interpretação de dados. A sua consulta não dispensa a validação junto das fontes oficiais."
              ariaLabel="Informação sobre os dados apresentados"
              placement="bottom"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {cards.slice(0, 3).map((c) => (
              <Card key={c.href} {...c} green={GREEN} />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:w-2/3 mx-auto">
            {cards.slice(3).map((c) => (
              <Card key={c.href} {...c} green={GREEN} />
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  href,
  green,
  italicTitle,
}: {
  icon: ElementType;
  title: string;
  description: string;
  href: string;
  green: string;
  italicTitle?: boolean;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl flex flex-col items-center text-center p-8 md:p-12 gap-4 md:gap-5 shadow-sm hover:shadow-lg transition-all duration-200 group border border-gray-100 h-full"
    >
      <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl transition-colors">
        <Icon
          className="w-8 h-8 md:w-10 md:h-10"
          style={{ color: green }}
          strokeWidth={1.5}
        />
      </div>

      <h2
        className={`text-lg font-bold text-gray-900 leading-snug whitespace-pre-line ${italicTitle ? "italic" : ""}`}
      >
        {title}
      </h2>

      <p className="text-sm md:text-base text-gray-500 leading-relaxed">
        {description}
      </p>
    </Link>
  );
}
