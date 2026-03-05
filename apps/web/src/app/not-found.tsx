import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface-50 text-center px-4">
      <div className="bg-white border border-surface-200 rounded-xl shadow-card p-8 max-w-md">
        <p className="text-6xl font-bold text-brand-600 mb-2">404</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Página não encontrada
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          A página que procura não existe ou foi movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
