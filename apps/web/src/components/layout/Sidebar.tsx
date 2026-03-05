"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import clsx from "clsx";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/announcements", label: "Anúncios", icon: Megaphone },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/notifications", label: "Notificações", icon: Bell },
  { href: "/settings", label: "Definições", icon: Settings },
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
    <aside className="w-64 bg-white border-r border-surface-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-surface-200">
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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-brand-50 text-brand-700 shadow-sm"
                  : "text-gray-500 hover:bg-surface-100 hover:text-gray-900",
              )}
            >
              <Icon className={clsx("w-[18px] h-[18px] shrink-0", isActive ? "text-brand-600" : "")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-surface-200">
        <p className="text-gray-400 text-xs truncate mb-2">{userEmail}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-gray-400 hover:text-accent-500 text-xs font-medium transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
