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

const BODY_BG = "rgba(247, 250, 253, 1)";
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
        #hp-global-hero { --hp-gap-fix: 0px; width: 100vw; max-width: 100vw; margin-left: calc(-50vw + 50%); margin-right: calc(-50vw + 50%); margin-top: var(--hp-gap-fix); margin-bottom: 0; padding: 42px 20px 60px 20px; background: linear-gradient(135deg, #244315 0%, #2f5218 58%, #3f6f27 100%); color: #ffffff; position: relative; overflow: hidden; text-align: center; box-sizing: border-box; z-index: 0; font-family: Arial, Helvetica, sans-serif; }
        #hp-global-hero, #hp-global-hero * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
        #hp-global-hero .hp-global-hero-inner { max-width: 1120px; margin: 0 auto; position: relative; z-index: 3; }
        #hp-global-hero .hp-global-brand { margin: 0 0 14px 0; color: #ffffff; font-size: 28px; font-weight: 700; line-height: 1.15; letter-spacing: 0; }
        #hp-global-hero .hp-global-title { margin: 0; color: #ffffff; font-size: 44px; font-weight: 700; line-height: 1.12; letter-spacing: 0; }
        #hp-global-hero .hp-title-line { display: inline; }
        #hp-global-hero .hp-global-hero-main { max-width: 920px; margin: 20px auto 0 auto; color: #ffffff; font-size: 19px; font-weight: 700; line-height: 1.45; letter-spacing: 0; }
        #hp-global-hero .hp-main-line, #hp-global-hero .hp-sub-line { display: block; }
        #hp-global-hero .hp-global-hero-sub { max-width: 850px; margin: 16px auto 0 auto; color: rgba(255, 255, 255, 0.92); font-size: 16px; font-weight: 400; line-height: 1.55; letter-spacing: 0; }
        #hp-global-hero::before { content: ""; position: absolute; right: -120px; bottom: -120px; width: 300px; height: 300px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); z-index: 1; pointer-events: none; }
        #hp-global-hero::after { content: ""; position: absolute; right: 70px; top: 34px; width: 92px; height: 92px; border-radius: 50%; background: rgba(255, 255, 255, 0.06); z-index: 1; pointer-events: none; }
        #hp-global-hero .hp-global-hero-wave { position: absolute; left: 0; bottom: -1px; width: 100%; height: 42px; z-index: 2; pointer-events: none; }
        #hp-global-hero .hp-global-hero-wave svg { width: 100%; height: 100%; display: block; }
        @media (max-width: 900px) { #hp-global-hero { --hp-gap-fix: 0px; padding: 40px 18px 56px 18px; } #hp-global-hero .hp-global-brand { font-size: 24px; } #hp-global-hero .hp-global-title { font-size: 36px; } #hp-global-hero .hp-global-hero-main { font-size: 17px; } #hp-global-hero .hp-global-hero-sub { font-size: 15px; } #hp-global-hero::before { width: 240px; height: 240px; right: -120px; bottom: -110px; } #hp-global-hero::after { width: 72px; height: 72px; right: 45px; top: 38px; } }
        @media (max-width: 560px) { #hp-global-hero { --hp-gap-fix: 0px; padding: 34px 14px 50px 14px; } #hp-global-hero .hp-global-brand { font-size: 20px; margin-bottom: 12px; } #hp-global-hero .hp-global-title { font-size: 30px; line-height: 1.15; } #hp-global-hero .hp-title-line { display: block; } #hp-global-hero .hp-global-hero-main { margin-top: 16px; font-size: 15px; line-height: 1.45; } #hp-global-hero .hp-global-hero-sub { margin-top: 14px; font-size: 14px; line-height: 1.55; } #hp-global-hero::before { width: 190px; height: 190px; right: -120px; bottom: -100px; } #hp-global-hero::after { display: none; } #hp-global-hero .hp-global-hero-wave { height: 36px; } }
        @media (max-width: 390px) { #hp-global-hero { --hp-gap-fix: 0px; padding: 32px 12px 46px 12px; } #hp-global-hero .hp-global-brand { font-size: 19px; } #hp-global-hero .hp-global-title { font-size: 28px; line-height: 1.14; } #hp-global-hero .hp-global-hero-main { font-size: 14.5px; line-height: 1.45; } #hp-global-hero .hp-global-hero-sub { font-size: 13.5px; line-height: 1.5; } }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <Header />

      <section className="hp-global-hero" id="hp-global-hero">
        <div className="hp-global-hero-inner">
          <div className="hp-global-brand">Helpdesk Público</div>

          <div className="hp-global-title">
            <span className="hp-title-line">Contratação </span>
            <span className="hp-title-line">Pública </span>
            <span className="hp-title-line">Eficiente</span>
          </div>

          <div className="hp-global-hero-main">
            <span className="hp-main-line">Suporte especializado</span>
            <span className="hp-main-line">a Entidades Públicas e Empresas</span>
            <span className="hp-main-line">
              em todas as fases da Contratação Pública
            </span>
          </div>

          <div className="hp-global-hero-sub">
            <span className="hp-sub-line">
              Informação, ferramentas e soluções digitais para atuar no mercado
              público
            </span>
            <span className="hp-sub-line">
              com mais agilidade, conformidade e eficiência
            </span>
          </div>
        </div>

        <div className="hp-global-hero-wave">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
            <path
              d="M0,50 C250,80 500,20 750,50 C1000,80 1200,30 1440,50 L1440,80 L0,80 Z"
              fill={BODY_BG}
            ></path>
          </svg>
        </div>
      </section>

      <main className="flex-1 relative overflow-hidden">
        {/* Elementos geométricos decorativos */}
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
            background: GREEN,
            opacity: 0.8,
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
            background: GREEN,
            opacity: 0.8,
          }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
          <h1 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-slate-900 sm:mb-12 sm:text-[2.6rem]">
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