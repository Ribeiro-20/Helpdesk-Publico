import { Clock3 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import IngestionHistoryView from "@/components/IngestionHistoryView";

export default function IngestionHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Clock3}
        title="Histórico de ingestão"
        description="Consulta local das execuções de ingestão guardadas neste navegador"
        backHref="/settings"
        backLabel="Voltar às definições"
      />

      <IngestionHistoryView />
    </div>
  );
}