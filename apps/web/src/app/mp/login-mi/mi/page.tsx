import Link from "next/link";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";

export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  {
    badge: "01",
    title: "Alertas de renovação",
    description:
      "Acompanhe contratos a terminar e oportunidades de renovação antes de se tornarem urgentes.",
  },
  {
    badge: "02",
    title: "Pesquisa por CPV",
    description:
      "Cruze o interesse comercial com os códigos CPV mais relevantes para o seu mercado.",
  },
  {
    badge: "03",
    title: "Tendências do mercado",
    description:
      "Veja evolução de valor, volume e principais entidades adjudicantes e adjudicatárias.",
  },
];

const STEPS = [
  "Identificar contratos em fim de prazo",
  "Filtrar por CPV, entidade e localização",
  "Priorizar novas oportunidades com base em dados",
];

export default function LoginMiPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-emerald-50 via-white to-transparent" />
        <div className="absolute -left-24 top-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-sky-100/50 blur-3xl" />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 lg:py-20">
          <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 shadow-sm">
                Market Intelligence
              </div>

              <div className="space-y-4">
                <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
                  Informação para antecipar contratos, renovação e procura.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                  A área de Market Intelligence junta contratos a terminar,
                  padrões de compra e sinais de mercado para apoiar decisões
                  comerciais mais rápidas e mais seguras.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/mp/login-mi"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  Entrar no serviço &gt;
                </Link>
              </div>

              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                {STEPS.map((step, index) => (
                  <div
                    key={step}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                      0{index + 1}
                    </p>
                    <p className="text-sm font-medium text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Visão geral
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    Market Intelligence pronto para uso
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  MI
                </div>
              </div>

              <div className="space-y-4">
                {HIGHLIGHTS.map((item) => {
                  return (
                    <div
                      key={item.title}
                      className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-bold text-emerald-700 shadow-sm">
                        {item.badge}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Acesso reservado a subscritores. Depois de entrar, abre o
                dashboard de Market Intelligence com os dados completos.
              </div>
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
