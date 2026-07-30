"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import { Mail, ArrowLeft, KeyRound } from "lucide-react";

const GREEN = "#3f6f27";
const GREEN_RGB = "63, 111, 39";

function LoginMIEntrarContent() {
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
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 opacity-50"
              style={{ backgroundColor: `rgba(${GREEN_RGB}, 0.12)` }}
            />

            <div className="text-center mb-8 relative z-10 flex flex-col items-center">
              <div className="inline-block">
                <Image src="/logo.webp" alt="Helpdesk Público" width={150} height={150} className="rounded-xl" />
              </div>
              <h1 className="mt-4 text-2xl font-black text-slate-900 tracking-tight">Market Intelligence</h1>
              <p className="text-slate-400 text-sm mt-2 font-medium">
                {step === "login" ? "Área reservada a subscritores" : "Verificação de Segurança"}
              </p>
            </div>

            {step === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5 relative z-10">
                <div className="space-y-1.5 text-center">
                  <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: GREEN }}>
                    INDIQUE SEU EMAIL DE ACESSO
                  </label>
                  <div className="relative">
                    {!email && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
                        <Mail className="h-5 w-5" style={{ color: GREEN }} />
                        <span className="text-base font-medium text-slate-400">
                          email@exemplo.pt
                        </span>
                      </div>
                    )}
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={{ paddingLeft: "1rem", paddingRight: "1rem" }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 text-base text-center focus:ring-2 transition-all font-medium text-slate-700 outline-none"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = GREEN;
                        e.currentTarget.style.boxShadow = `0 0 0 2px rgba(${GREEN_RGB}, 0.2)`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                      placeholder=""
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl px-4 py-3 text-xs font-bold">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 text-base shadow-lg hover:shadow-lg active:scale-[0.98]"
                  style={{ backgroundColor: GREEN, boxShadow: `0 10px 15px -3px rgba(${GREEN_RGB}, 0.2), 0 4px 6px -4px rgba(${GREEN_RGB}, 0.2)` }}
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

                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-bold uppercase tracking-wider block" style={{ color: GREEN }}>
                    CÓDIGO DE VERIFICAÇÃO
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="absolute left-1/2 top-1/2 -translate-x-[190px] -translate-y-1/2 w-5 h-5"
                      style={{ color: GREEN, zIndex: 1 }}
                    />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      autoFocus
                      style={{ paddingLeft: "3rem", paddingRight: "3rem" }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 text-2xl tracking-[0.5em] text-center transition-all font-black text-slate-900 outline-none"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = GREEN;
                        e.currentTarget.style.boxShadow = `0 0 0 2px rgba(${GREEN_RGB}, 0.2)`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.boxShadow = "none";
                      }}
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
                    className="w-full text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 text-base shadow-lg active:scale-[0.98]"
                    style={{ backgroundColor: GREEN, boxShadow: `0 10px 15px -3px rgba(${GREEN_RGB}, 0.2), 0 4px 6px -4px rgba(${GREEN_RGB}, 0.2)` }}
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

          <p className="text-center text-xs text-slate-300 mt-8 font-medium tracking-wide"></p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

export default function LoginMIEntrarPage() {
  return (
    <Suspense>
      <LoginMIEntrarContent />
    </Suspense>
  );
}
