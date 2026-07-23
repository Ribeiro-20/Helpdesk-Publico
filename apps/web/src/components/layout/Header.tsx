"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Mail, UserCircle2, Home } from "lucide-react";

const NAV_BG = "#1a1b1f";
const SAME_DOMAIN = "mercado.helpdeskpublico.pt";

const externalLinkProps = (href: string): { target?: string; rel?: string } => {
  try {
    const url = new URL(href);
    return url.hostname === SAME_DOMAIN ? {} : { target: "_blank", rel: "noopener noreferrer" };
  } catch {
    return { target: "_blank", rel: "noopener noreferrer" };
  }
};

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: NAV_BG,
      }}
    >
      <div className="max-w-screen-2xl mx-auto flex items-center px-4 sm:px-6 lg:px-12 py-0 h-[80px] sm:h-[92px] lg:h-[104px] min-w-0">
        <a
          href="https://www.helpdeskpublico.pt/"
          {...externalLinkProps("https://www.helpdeskpublico.pt/")}
          className="shrink-0 mr-3 sm:mr-8 lg:mr-12"
        >
          <Image
            src="/logo.png"
            alt="Helpdesk Público"
            width={300}
            height={110}
            className="shrink-0 h-auto w-[170px] sm:w-[220px] lg:w-[300px] object-contain"
            priority
          />
        </a>

        <div className="flex-1" />

        {/* ── Right menu & Actions ── */}
        <div className="relative shrink-0 flex items-center gap-1 sm:gap-2 ml-2 sm:ml-4 lg:ml-8" ref={menuRef}>
          <a
            href="https://www.helpdeskpublico.pt"
            {...externalLinkProps("https://www.helpdeskpublico.pt")}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/5 active:scale-95"
            title="Helpdesk Público"
          >
            <Home className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={2} />
            {/* O texto fica escondido em mobile e aparece a partir de ecrãs 'sm' */}
            <span className="hidden sm:inline">Helpdesk Público</span>
          </a>

          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-gray-200 hover:text-white hover:bg-white/5 transition-colors"
          >
            {/* O texto do Menu também fica escondido em mobile */}
            <span className="hidden sm:inline text-sm font-medium">Menu</span>
            <ChevronDown
              className={`w-5 h-5 sm:w-4 sm:h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
              strokeWidth={1.8}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-60 rounded-xl border border-white/10 bg-[#202329] p-1.5 shadow-xl top-full"
            >
              <a
                href="https://www.helpdeskpublico.pt/contactos"
                {...externalLinkProps("https://www.helpdeskpublico.pt/contactos")}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <Mail className="w-4.5 h-4.5" strokeWidth={1.6} />
                <span>Contactos</span>
              </a>

              <Link
                href="/mp/login"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <UserCircle2 className="w-4.5 h-4.5" strokeWidth={1.6} />
                <span>Área Reservada</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}