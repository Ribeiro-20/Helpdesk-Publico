"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="bg-white border border-surface-200 rounded-xl shadow-card p-8 max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Ocorreu um erro
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Não foi possível carregar esta página. Por favor tente novamente.
        </p>
        {error.message && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 font-mono break-all">
            {error.message}
          </p>
        )}
        <button
          onClick={reset}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
