"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import { Mail, ArrowLeft, KeyRound } from "lucide-react";

export default function LoginMIEntrarPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"login" | "verify">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  // Preserve the original URL (e.g. /outros?contract=...) to redirect back after login
  const redirectTo = searchParams.get("redirect") || "/outros";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mi-login", {
        method: "POST",
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao solicitar código de acesso.");
        setLoading(false);
        return;
      }

      setStep("verify");
      setLoading(false);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mi-verify", {
        method: "POST",
        body: JSON.stringify({ email, code }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Código inválido ou expirado.");
        setLoading(false);
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 opacity-50" />

            <div className="text-center mb-8 relative z-10">
              <div className="inline-block mb-4 p-3 bg-emerald-50 rounded-2xl shadow-sm">
                <Image src="/logo.webp" alt="Helpdesk Público" width={56} height={56} className="rounded-xl" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Market Intelligence</h1>
              <p className="text-slate-400 text-sm mt-2 font-medium">
                {step === "login" ? "Área reservada a subscritores" : "Verificação de Segurança"}
              </p>
            </div>

            {step === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5 relative z-10">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email de Acesso</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" style={{ zIndex: 1 }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={{ paddingLeft: "3rem" }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-4 py-4 text-base focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all font-medium text-slate-700 outline-none"
                      placeholder="o-seu-email@exemplo.pt"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl px-4 py-3 text-xs font-bold">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 text-base shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 active:scale-[0.98]"
                >
                  {loading ? "A solicitar código..." : "Iniciar Sessão"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-6 relative z-10">
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                  <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                    Enviámos um código de 6 dígitos para o seu email. Por favor, introduza-o abaixo para continuar.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 text-center block">Código de Verificação</label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" style={{ zIndex: 1 }} />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      autoFocus
                      style={{ paddingLeft: "3rem" }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-4 py-4 text-2xl tracking-[0.5em] text-center focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all font-black text-slate-900 outline-none"
                      placeholder="000000"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl px-4 py-3 text-xs font-bold">{error}</div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 text-base shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                  >
                    {loading ? "A validar..." : "Confirmar Código"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep("login")}
                    className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors py-2"
                  >
                    <ArrowLeft className="w-3 h-3" /> Voltar ao Login
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-slate-300 mt-8 font-medium tracking-wide">SISTEMA DE SEGURANÇA AVANÇADA • BREVO™ ENABLED</p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
