import { createAdminClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import BackButton from "@/components/BackButton";
import MarketIntelligenceTable from "@/components/MarketIntelligenceTable";

import { TrendingUp, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutrosPage() {
  const supabase = await createAdminClient();

  // 1. Obter o tenant id (público)
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  const tenantId = tenant?.id ?? "";

  // 2. Procurar contratos ativos com prazos definidos
  const { data: contractsRaw } = await supabase
    .from("contracts")
    .select("id, object, cpv_main, signing_date, execution_deadline_days, contracting_entities, winners, contract_price")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .not("signing_date", "is", null)
    .not("execution_deadline_days", "is", null)
    .order("signing_date", { ascending: false })
    .limit(5000);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const contracts = (contractsRaw ?? []).map(c => {
    const signingDate = new Date(c.signing_date!);
    signingDate.setHours(0, 0, 0, 0);
    
    // Calcular diferença em dias
    const diffTime = Math.max(0, today.getTime() - signingDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // Calcular progresso
    const totalDays = c.execution_deadline_days || 1;
    const progress = diffDays / totalDays;
    
    return {
      ...c,
      days_passed: diffDays,
      progress: progress,
      is_overdue: progress >= 1.0
    };
  }).filter(c => c.progress >= 0.75)
    .sort((a, b) => a.progress - b.progress); // 75% primeiro, terminados (100%) por último

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-500" />
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Market Intelligence</h1>
              <p className="text-gray-500 text-sm">Monitorização de contratos em fase de conclusão</p>
            </div>
          </div>
          <BackButton fallbackHref="/" />
        </div>

        <MarketIntelligenceTable contracts={contracts as any} />
        
        <div className="mt-8 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>Nota:</strong> Estes dados são calculados com base na data de assinatura e prazo de execução. 
            Contratos sem estas informações básicas não são apresentados.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
