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

const BODY_BG = "#ffffff";
const GREEN = "rgba(34, 197, 94, 1)";

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

  const HERO_CSS = `
        #hp-global-hero {
          --hp-green-dark: #26461a;
          width: 100vw;
          max-width: 100vw;
          margin-left: calc(-50vw + 50%);
          margin-right: calc(-50vw + 50%);
          padding: 30px 30px 0px;
          background: linear-gradient(to bottom, #3f6f27 75%, transparent 85%);
          color: #ffffff;
          position: relative;
          text-align: center;
          box-sizing: border-box;
          isolation: isolate;
          overflow: visible;
        }
        #hp-global-hero, #hp-global-hero * { box-sizing: border-box; font-family: inherit; }
        #hp-global-hero .hp-global-hero-inner { max-width: 1120px; margin: 0 auto; position: relative; z-index: 3; text-align: center; }
        #hp-global-hero .hp-global-eyebrow { margin: 0 0 10px; color: #a8e890; font-size: clamp(0.85rem, 1.2vw, 1rem); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        #hp-global-hero .hp-global-title { margin: 0 0 18px; color: #ffffff; font-size: clamp(1.8rem, 3.45vw, 3.15rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.05em; text-wrap: balance; }
        #hp-global-hero .hp-global-hero-main { max-width: 700px; margin: 0 auto 14px; color: #e0f0d8; font-size: clamp(0.95rem, 1.6vw, 1.25rem); font-weight: 500; line-height: 1.4; letter-spacing: -0.01em; text-wrap: balance; }
        #hp-global-hero .hp-global-hero-sub { max-width: 680px; margin: 0 auto 0; color: #c8e0be; font-size: clamp(0.78rem, 1vw, 0.92rem); font-weight: 400; line-height: 1.6; letter-spacing: 0; text-wrap: balance; }
        #hp-global-hero .hp-main-line, #hp-global-hero .hp-sub-line { display: block; }
        #hp-global-hero .hp-global-hero-bottom-title { margin-top: 30px; color: #000000; font-size: clamp(1.7rem, 2.45vw, 2.7rem); font-weight: 400; line-height: 1.08; letter-spacing: -0.04em; text-wrap: balance; }
        @media (max-width: 900px) {
          #hp-global-hero { padding: 40px 18px 24px; }
          #hp-global-hero .hp-global-hero-wave { height: 256px; margin-top: 14px; }
          #hp-global-hero .hp-global-title { margin-bottom: 14px; }
          #hp-global-hero .hp-global-hero-main { margin-bottom: 10px; }gr
          #hp-global-hero .hp-global-hero-bottom-title { margin-top: 20px; }
        }
        @media (max-width: 560px) {
          #hp-global-hero { padding: 28px 14px 20px; }
          #hp-global-hero .hp-global-eyebrow { font-size: 0.78rem; }
          #hp-global-hero .hp-global-title { font-size: clamp(1.7rem, 9vw, 2.35rem); line-height: 1.05; margin-bottom: 12px; }
          #hp-global-hero .hp-global-hero-main { font-size: 0.9rem; line-height: 1.4; margin-bottom: 8px; }
          #hp-global-hero .hp-global-hero-sub { font-size: 0.78rem; line-height: 1.55; }
          #hp-global-hero .hp-global-hero-wave { height: 220px; margin-top: 12px; }
          #hp-global-hero .hp-global-hero-bottom-title { font-size: 1.35rem; margin-top: 36px; }
        }
      `;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <Header />

      <section className="hp-global-hero" id="hp-global-hero">
        <div className="hp-global-hero-inner">
          <p className="hp-global-eyebrow">Helpdesk Público</p>

          <h1 className="hp-global-title">Contratação Pública Eficiente</h1>

          <div className="hp-global-hero-main">
            <span className="hp-main-line">
              Suporte especializado a Entidades Públicas e Empresas em todas as fases da Contratação Pública
            </span>
          </div>

          <div className="hp-global-hero-sub">
            <span className="hp-sub-line">
              Informação, ferramentas e soluções digitais para atuar no mercado público com mais agilidade, conformidade e eficiência
            </span>
          </div>
        </div>

        <div className="hp-global-hero-wave" style={{ marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)", width: "100vw", position: "relative", zIndex: 2, marginTop: "-60px" }}>
          <svg viewBox="0 0 1440 340" preserveAspectRatio="none" style={{ width: "100%", height: "280px", display: "block" }}>
            <path
              d="M0,180 C180,80 360,260 540,160 C720,60 900,220 1080,150 C1260,80 1360,140 1440,130 L1440,260 C1260,300 1080,220 900,280 C720,340 540,240 360,300 C180,360 80,280 0,310 Z"
              fill="#3f6f27"
              opacity={0.35}
            />
            <path
              d="M0,210 C200,120 380,280 600,190 C780,120 960,240 1140,175 C1300,120 1380,160 1440,155 L1440,280 C1280,320 1080,250 900,300 C700,355 480,260 300,315 C150,360 60,295 0,330 Z"
              fill="#2f5218"
              opacity={0.45}
            />
            <path
              d="M0,240 C150,170 320,300 520,230 C700,165 880,270 1080,210 C1240,160 1360,195 1440,190 L1440,295 C1300,330 1120,270 940,315 C740,365 540,275 360,325 C200,368 80,305 0,340 Z"
              fill="#2f5218"
              opacity={0.6}
            />
            <path
              d="M0,270 C120,220 280,310 460,265 C640,215 820,295 1020,255 C1200,215 1340,245 1440,240 L1440,310 C1320,340 1140,285 960,325 C760,368 560,290 380,335 C210,372 90,318 0,345 Z"
              fill="#244315"
              opacity={0.8}
            />
          </svg>
        </div>

        <div className="hp-global-hero-bottom-title">Mercado Público</div>
      </section>

      <main className="flex-1 relative overflow-hidden pt-6 pb-10 sm:pt-8 sm:pb-14 lg:pt-10 lg:pb-16">

        {/* Decoração esquerda — círculo dashed + bolinha verde */}
        <div
          className="absolute pointer-events-none hidden sm:block"
          style={{
            left: "-130px",
            top: "-30px",
            width: "340px",
            height: "340px",
            borderRadius: "50%",
            border: "1.5px dashed #94a3b8",
            opacity: 0.5,
          }}
        />
        <div
          className="absolute pointer-events-none hidden sm:block rounded-full"
          style={{
            left: "255px",
            top: "95px",
            width: "25px",
            height: "25px",
            background: "#2f5218",
            opacity: 0.8,
          }}
        />

        {/* Decoração direita — círculo dashed + bolinha verde */}
        <div
          className="absolute pointer-events-none hidden sm:block"
          style={{
            right: "-180px",
            bottom: "-60px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            border: "1.5px dashed #94a3b8",
            opacity: 0.5,
          }}
        />
        <div
          className="absolute pointer-events-none hidden sm:block rounded-full"
          style={{
            right: "50px",
            bottom: "100px",
            width: "180px",
            height: "180px",
            background: "#2f5218",
            opacity: 0.8,
          }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
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
          style={{ color: "#2f5218" }}
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