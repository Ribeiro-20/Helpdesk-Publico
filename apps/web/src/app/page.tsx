"use client";

import Link from "next/link";
import Image from "next/image";

import {
  FileText,
  Landmark,
  Building2,
  FileSearch,
  Chrome,
} from "lucide-react";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
const CARDS = [
  {
    icon: FileText,
    title: "Contratos Públicos",
    description:
      "Consulte todos os dados referentes aos contratos públicos.",
    href: "/mercado-publico",
  },
  {
    icon: Landmark,
    title: "Estatísticas Adjudicantes",
    description:
      "Consulte todas as informações sobre os adjudicantes no mercado público.",
    href: "/estatisticas-publico",
  },
  {
    icon: Building2,
    title: "Estatísticas Adjudicatarias",
    description:
      "Consulte todas as informações sobre os adjudicatarias no mercado público.",
    href: "/estatisticas-privado",
  },
  {
    icon: FileSearch,
    title: "Oportunidade no Mercado Público",
    description: "Consulte todas as oportunidades de negócio ativas no mercado público.",
    href: "/oportunidades",
  },
  {
    icon: Chrome,
    title: "Market Intelligence",
    description:
      "Consulte todos os contratos públicos a terminar ou em fase de renovação (área reservada a subscritores do serviço).",
    href: "/outros",
  },
];
const BODY_BG = "rgba(248, 250, 252, 1)";
const GREEN = "rgba(74, 222, 128, 1)";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      {/* ── HEADER ── */}
      <Header />

      {/* ── MAIN ── */}
      <main className="flex-1 relative overflow-hidden">
        {/* Dashed circle left */}
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
        {/* Green dot — right edge of left dashed circle */}
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

        {/* Dashed circle right */}
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
        {/* Big green circle inside dashed circle bottom-right */}
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

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">
          {/* Title */}
          <h1 className="text-[2.6rem] font-extrabold text-gray-900 text-center mb-12 tracking-tight">
            Mercado Público
          </h1>

          {/* Row 1 — 3 cards */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            {CARDS.slice(0, 3).map((c) => (
              <Card key={c.href} {...c} green={GREEN} />
            ))}
          </div>

          {/* Row 2 — 2 cards centered */}
          <div className="grid grid-cols-2 gap-6 w-2/3 mx-auto">
            {CARDS.slice(3).map((c) => (
              <Card key={c.href} {...c} green={GREEN} />
            ))}
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
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
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  green: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl flex flex-col items-center text-center p-12 gap-5 shadow-sm hover:shadow-lg transition-all duration-200 group border border-gray-100"
    >
      {/* Icon container */}
      <div className="flex items-center justify-center w-20 h-20 rounded-2xl transition-colors">
        <Icon
          className="w-10 h-10"
          style={{ color: green }}
          strokeWidth={1.5}
        />
      </div>

      {/* Title */}
      <h2 className="text-lg font-bold text-gray-900 leading-snug">{title}</h2>

      {/* Description */}
      <p className="text-base text-gray-500 leading-relaxed">{description}</p>
    </Link>
  );
}
