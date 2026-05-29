import { Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import IngestionHistoryView from "@/components/IngestionHistoryView";

export default async function IngestionHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = user
    ? await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  const isAdmin = appUser?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Clock3}
        title="Histórico de ingestão"
        description={isAdmin ? "Execuções de ingestão guardadas no Supabase para este tenant" : "Execuções de ingestão guardadas no Supabase para este utilizador"}
        backHref="/settings"
        backLabel="Voltar às definições"
      />

      <IngestionHistoryView adminView={isAdmin} />
    </div>
  );
}