import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      <Sidebar userEmail={user.email ?? ""} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 pt-14 pb-5 sm:px-6 sm:pt-6 sm:pb-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
