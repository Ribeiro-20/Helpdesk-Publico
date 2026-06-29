"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Mail, UserCircle2, Home } from "lucide-react";

const NAV_BG = "#1a1b1f";

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
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-12 lg:py-0 lg:h-[104px]">
        {/* ── Logo ── */}
        <Link href="/" className="shrink-0">
          <Image
            src="/logo.png"
            alt="Helpdesk Público"
            width={300}
            height={110}
            className="object-contain"
            style={{ width: "300px", maxWidth: "72vw", height: "auto" }}
            priority
          />
        </Link>

        <div className="flex-1" />

        {/* ── Right menu & Actions ── */}
        <div className="relative shrink-0 flex items-center gap-2" ref={menuRef}>
          
          {/* Botão "Início" sempre fora do menu - Atualizado com o link externo */}
          <a
            href="https://www.helpdeskpublico.pt"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/5 active:scale-95"
          >
            <Home className="w-4 h-4" strokeWidth={2} />
            <span className="hidden sm:inline">Início</span>
          </a>

          {/* Botão de Menu Dropdown */}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/5 hover:text-white"
          >
            <span className="font-medium">Menu</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
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
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <Mail className="w-4.5 h-4.5" strokeWidth={1.6} />
                <span>Contactos</span>
              </a>

              <Link
                href="/login"
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