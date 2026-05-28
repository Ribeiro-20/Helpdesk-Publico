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
      description: "Consulte os dados e as informações dos contratos públicos.",
      href: "/mercado-publico",
    },
    {
      icon: Landmark,
      title: "Adjudicantes",
      description:
        "Consulte as informações das Entidades Adjudicantes ativas no mercado público.",
      href: "/estatisticas-publico",
    },
    {
      icon: Building2,
      title: "Adjudicatários",
      description:
        "Consulte as informações dos Adjudicatários ativos no mercado público.",
      href: "/estatisticas-privado",
    },
    {
      icon: FileSearch,
      title: "Oportunidades no Mercado Público",
      description:
        "Consulte todas as oportunidades de negócio ativas no mercado público.",
      href: "/oportunidades",
    },
    {
      icon: ScanSearch,
      title: "Market Intelligence",
      description:
        "Consulte todos os contratos públicos a terminar ou em fase de renovação (área reservada a subscritores do serviço).",
      href: "/login-mi",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      <style>{`
        @keyframes wave-float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .wave-animate {
          animation: wave-float 6s ease-in-out infinite;
        }
      `}</style>
      
      <Header />

      <div className="w-full h-20 sm:h-24 overflow-hidden">
        <svg
          viewBox="0 0 1200 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <path
            className="wave-animate"
            d="M0,40 Q300,10 600,40 T1200,40 L1200,100 L0,100 Z"
            fill={GREEN}
            opacity="0.85"
          />
          <path
            d="M0,50 Q300,20 600,50 T1200,50 L1200,100 L0,100 Z"
            fill={GREEN}
            opacity="0.6"
          />
        </svg>
      </div>

      <main className="flex-1 relative overflow-hidden">
        <div
          className="absolute pointer-events-none hidden sm:block"
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
          className="absolute pointer-events-none hidden sm:block rounded-full"
          style={{
            left: "255px",
            top: "95px",
            width: "25px",
            height: "25px",
            background: GREEN,
          }}
        />

        <div
          className="absolute pointer-events-none hidden sm:block"
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
          className="absolute pointer-events-none hidden sm:block rounded-full"
          style={{
            right: "50px",
            bottom: "100px",
            width: "180px",
            height: "180px",
            background: GREEN,
          }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
          <h1 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:mb-12 sm:text-[2.6rem]">
            Mercado Público
          </h1>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {cards.slice(0, 3).map((c) => (
              <Card key={c.href} {...c} green={GREEN} />
            ))}
          </div>

          <div className="mx-auto mt-4 grid w-full max-w-[728px] grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
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
}: {
  icon: ElementType;
  title: string;
  description: string;
  href: string;
  green: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-4 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm transition-all duration-200 hover:shadow-lg sm:gap-5 sm:p-8 lg:p-12"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl transition-colors sm:h-20 sm:w-20">
        <Icon
          className="h-8 w-8 sm:h-10 sm:w-10"
          style={{ color: green }}
          strokeWidth={1.5}
        />
      </div>

      <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">
        {title}
      </h2>

      <p className="text-sm leading-relaxed text-gray-500 sm:text-base">
        {description}
      </p>
    </Link>
  );
}
