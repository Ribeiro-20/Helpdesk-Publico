"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import clsx from "clsx";
import {
  LayoutDashboard,
  Megaphone,
  FileSignature,
  Building2,
  Factory,
  TrendingUp,
  Users,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    title: "Monitorização",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/announcements", label: "Anúncios", icon: Megaphone },
      { href: "/contracts", label: "Contratos", icon: FileSignature },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { href: "/entities", label: "Entidades", icon: Building2 },
      { href: "/companies", label: "Empresas", icon: Factory },
      { href: "/market", label: "Mercado", icon: TrendingUp },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/clients", label: "Clientes", icon: Users },
      { href: "/notifications", label: "Notificações", icon: Bell },
      { href: "/settings", label: "Definições", icon: Settings },
    ],
  },
] as const;

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-200 bg-slate-100/70">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.webp"
            alt="Helpdesk Público"
            width={36}
            height={36}
            className="shrink-0 rounded"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight truncate">
              Base Monitor
            </p>
            <p className="text-[10px] text-gray-400 leading-tight">
              by Helpdesk Público
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-emerald-100/80 text-emerald-700"
                        : "text-slate-600 hover:bg-white hover:text-slate-900",
                    )}
                  >
                    <Icon className={clsx("w-[17px] h-[17px] shrink-0", isActive ? "text-emerald-600" : "text-slate-500")} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="m-3 mt-2 rounded-2xl border border-slate-300/80 bg-slate-100/60 p-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Sessão ativa
        </p>
        <Link
          href="/settings/alertas-sistema"
          className="mb-2 block truncate rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
        >
          {userEmail}
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
