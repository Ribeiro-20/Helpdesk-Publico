"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

type CsvExportButtonProps = {
  href: string;
  filenamePrefix?: string;
};

function downloadFilename(contentDisposition: string | null, filenamePrefix: string): string {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const candidate = encoded ? decodeURIComponent(encoded) : plain;
  return (candidate || `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`)
    .replace(/[\\/\0]/g, "-");
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // The server can return an HTML proxy error. Keep the public message below.
  }

  return response.status === 429
    ? "Já existe uma exportação recente. Aguarde alguns segundos e tente novamente."
    : fallback;
}

export default function CsvExportButton({ href, filenamePrefix = "contratos" }: CsvExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const failureMessage = filenamePrefix === "anuncios"
    ? "Não foi possível exportar os anúncios neste momento."
    : "Não foi possível exportar os contratos neste momento.";

  const handleExport = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(href, {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        setError(await responseError(response, failureMessage));
        return;
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.toLowerCase().includes("text/csv")) {
        setError("O servidor não devolveu um ficheiro CSV válido.");
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadFilename(response.headers.get("Content-Disposition"), filenamePrefix);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      setError(failureMessage);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 whitespace-nowrap bg-brand-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70 transition-all shadow-sm hover:shadow-md"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        {loading ? "A exportar…" : "Exportar CSV"}
      </button>
      <span
        aria-live="polite"
        className={`absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-md ${error ? "block" : "hidden"}`}
      >
        {error}
      </span>
    </div>
  );
}
