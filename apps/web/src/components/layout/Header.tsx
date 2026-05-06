"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Mail, UserCircle2 } from "lucide-react";

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
      <div className="max-w-screen-2xl mx-auto flex items-center px-12 py-0 h-[104px]">
        {/* ── Logo ── */}
        <Link href="/" className="shrink-0 mr-12">
          <Image
            src="/logo.png"
            alt="Helpdesk Público"
            width={300}
            height={110}
            className="object-contain"
            priority
          />
        </Link>

        <div className="flex-1" />

        {/* ── Right menu ── */}
        <div className="shrink-0 ml-8" ref={menuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-gray-200 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="text-sm font-medium">Menu</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
              strokeWidth={1.8}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-6 mt-2 w-60 rounded-xl border border-white/10 bg-[#202329] p-1.5 shadow-xl"
            >
              <a
                href="mailto:supcom@helpdeskpublico.pt"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <Mail className="w-4.5 h-4.5" strokeWidth={1.6} />
                <span>Contacto por email</span>
              </a>

              <Link
                href="/login"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <UserCircle2 className="w-4.5 h-4.5" strokeWidth={1.6} />
                <span>Área de utilizador</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
