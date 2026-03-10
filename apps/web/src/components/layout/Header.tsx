"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, UserCircle2 } from "lucide-react";

const NAV_ITEMS_ROW1 = [
  { label: "Serviços Adjudicantes", href: "#" },
  { label: "Serviços Empresas e Adjudicatários", href: "#" },
  { label: "Alerta Concursos Públicos", href: "#" },
  { label: "Blog", href: "#" },
  { label: "Identificação CPV", href: "#" },
];

const NAV_ITEMS_ROW2 = [
  { label: "ESG e Sustentabilidade", href: "#" },
  { label: "RH", href: "#" },
  { label: "FAQs", href: "#" },
  { label: "Sobre Nós", href: "#" },
];

const NAV_BG = "#1a1b1f";

export default function Header() {
  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: NAV_BG,
      }}
    >
      <div className="max-w-screen-2xl mx-auto flex items-center px-6 py-0 h-[72px]">
        {/* ── Logo ── */}
        <Link href="/" className="shrink-0 mr-10">
          <Image
            src="/logo-white.webp"
            alt="Helpdesk Público"
            width={120}
            height={44}
            className="object-contain"
            priority
          />
        </Link>

        {/* ── Nav (two rows, centred) ── */}
        <nav className="flex-1 flex flex-col justify-center gap-0">
          {/* Row 1 */}
          <ul className="flex items-center justify-center gap-0">
            {NAV_ITEMS_ROW1.map((item, idx) => (
              <li key={item.label} className="flex items-center">
                {idx !== 0 && (
                  <span
                    className="mx-2 text-gray-500 select-none"
                    aria-hidden="true"
                  >
                    |
                  </span>
                )}
                <Link
                  href={item.href}
                  className="text-[11.5px] font-medium text-gray-200 hover:text-white transition-colors whitespace-nowrap"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {/* trailing separator */}
            <span className="mx-2 text-gray-500 select-none" aria-hidden="true">
              |
            </span>
          </ul>

          {/* Row 2 */}
          <ul className="flex items-center justify-center gap-0">
            {NAV_ITEMS_ROW2.map((item, idx) => (
              <li key={item.label} className="flex items-center">
                {idx !== 0 && (
                  <span
                    className="mx-2 text-gray-500 select-none"
                    aria-hidden="true"
                  >
                    |
                  </span>
                )}
                <Link
                  href={item.href}
                  className="text-[11.5px] font-medium text-gray-200 hover:text-white transition-colors whitespace-nowrap"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Right icons ── */}
        <div className="shrink-0 flex items-center gap-4 ml-8">
          <button
            aria-label="Contacto por email"
            className="text-gray-300 hover:text-white transition-colors"
          >
            <Mail className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <button
            aria-label="Área de utilizador"
            className="text-gray-300 hover:text-white transition-colors"
          >
            <UserCircle2 className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}
