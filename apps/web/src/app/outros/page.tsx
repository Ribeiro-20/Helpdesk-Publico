import { createAdminClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import BackButton from "@/components/BackButton";
import MISessionTimer from "@/components/MISessionTimer";
import { TrendingUp, Clock, AlertTriangle } from "lucide-react";

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
  // Para a Fase 1, vamos buscar os mais recentes que têm prazo e calcular em JS
  const { data: contractsRaw } = await supabase
    .from("contracts")
    .select("id, object, signing_date, execution_deadline_days, contracting_entities, winners, contract_price")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .not("signing_date", "is", null)
    .not("execution_deadline_days", "is", null)
    .order("signing_date", { ascending: false })
    .limit(1000);

  const today = new Date();
  
  const contracts = (contractsRaw ?? []).map(c => {
    const signingDate = new Date(c.signing_date!);
    const diffTime = Math.abs(today.getTime() - signingDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const progress = diffDays / c.execution_deadline_days!;
    
    return {
      ...c,
      days_passed: diffDays,
      progress: Math.min(progress, 1.0)
    };
  }).filter(c => c.progress >= 0.8);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <MISessionTimer />
      <Header />
      
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-500" />
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Market Intelligence</h1>
              <p className="text-gray-500 text-sm">Contratos em fase final de execução (>= 80% do prazo)</p>
            </div>
          </div>
          <BackButton fallbackHref="/" />
        </div>

        {contracts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-gray-200 shadow-sm">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Não foram encontrados contratos com este critério.</p>
            <p className="text-gray-400 text-sm mt-1">Experimente verificar os dados de ingestão ou tente mais tarde.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Objecto do Contrato</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Entidade</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Progresso</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-5">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-green-600 transition-colors line-clamp-2">
                          {c.object || "Sem objecto"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                            {c.signing_date}
                          </span>
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                            {c.execution_deadline_days} dias total
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs text-gray-500 font-medium truncate max-w-[200px]">
                          {c.contracting_entities?.[0] || "N/A"}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 italic">Adjudicatário: {c.winners?.[0] || "N/A"}</p>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-400 rounded-full"
                              style={{ width: `${c.progress * 100}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-gray-700">{(c.progress * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <p className="text-sm font-bold text-gray-900">
                          {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(c.contract_price || 0)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <div className="mt-8 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>Nota:</strong> Estes dados são calculados com base na data de assinatura e prazo de execução declarados. 
            Contratos sem estas informações protegidas não são apresentados.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
