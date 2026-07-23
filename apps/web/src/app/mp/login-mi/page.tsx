import Link from "next/link";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";

const GREEN = "#3f6f27";
const GREEN_RGB = "63, 111, 39";

export const metadata = {
  title: "Market Intelligence em Contratação Pública | Helpdesk Público",
  description:
    "Identifique oportunidades na Contratação Pública. Consulte contratos em execução, potenciais clientes públicos e informação estruturada para apoiar a ação comercial.",
};

const FEATURES = [
  {
    number: "01",
    title: "Contratos em fase final",
    description:
      "Identifique contratos próximos da conclusão e acompanhe potenciais necessidades futuras de contratação.",
  },
  {
    number: "02",
    title: "Pesquisa Inteligente",
    description:
      "Cruze CPV, entidades adjudicantes e localização para identificar oportunidades relevantes para a sua atividade.",
  },
  {
    number: "03",
    title: "Análise do Mercado",
    description:
      "Consulte indicadores, entidades e padrões de contratação para apoiar decisões comerciais mais informadas.",
  },
];

const STEPS = [
  "Acompanhar contratos em fase final de execução",
  "Pesquisar por CPV, entidade e localização",
  "Priorizar oportunidades com informação estruturada",
];

export default function LoginMILandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 relative overflow-hidden">
        {/* Background decorations */}
        <div
          className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b via-white to-transparent"
          style={{ backgroundImage: `linear-gradient(to bottom, rgba(${GREEN_RGB}, 0.08), rgba(255, 255, 255, 0.98) 55%, transparent)` }}
        />
        <div
          className="absolute -left-24 top-20 h-64 w-64 rounded-full blur-3xl"
          style={{ backgroundColor: `rgba(${GREEN_RGB}, 0.18)` }}
        />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-sky-100/50 blur-3xl" />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 lg:py-20">
          <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            {/* Left column */}
            <div className="space-y-6">
              <div
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] shadow-sm"
                style={{ border: `1px solid rgba(${GREEN_RGB}, 0.2)`, color: GREEN }}
              >
                Market Intelligence em Contratação Pública
              </div>

              <div className="space-y-4">
                <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
                  Informação para antecipar oportunidades, acompanhar contratos e apoiar decisões.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                  A área de Market Intelligence reúne contratos em execução, padrões de contratação, indicadores de mercado e informação estratégica para apoiar a identificação de oportunidades e a tomada de decisões comerciais mais informadas.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/mp/login-mi/entrar"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors"
                  style={{ backgroundColor: GREEN }}
                >
                  Aceda à área reservada
                </Link>
                <Link
                  href="/mp/contratos-publicos"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Explorar mercado público
                </Link>
                <Link
                  href="https://www.helpdeskpublico.pt/contactos"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Solicitar demonstração
                </Link>
              </div>

              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                {STEPS.map((step, i) => (
                  <div
                    key={step}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: GREEN }}>
                      0{i + 1}
                    </p>
                    <p className="text-sm font-medium text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — feature card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Visão geral
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    Ferramentas para apoiar a decisão comercial
                  </p>
                </div>

              </div>

              <div className="space-y-4">
                {FEATURES.map((feat) => (
                  <div
                    key={feat.number}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-bold shadow-sm" style={{ color: GREEN }}>
                      {feat.number}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{feat.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {feat.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="mt-6 rounded-2xl px-4 py-3 text-sm"
                style={{ border: `1px solid rgba(${GREEN_RGB}, 0.2)`, backgroundColor: `rgba(${GREEN_RGB}, 0.08)`, color: GREEN }}
              >
                Acesso reservado a subscritores. Após autenticação, consulte o dashboard com toda a informação disponível para análise e acompanhamento do mercado.
              </div>
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
