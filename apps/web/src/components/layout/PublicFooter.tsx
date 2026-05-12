import Image from "next/image";
import Link from "next/link";
import { Mail, User } from "lucide-react";

export default function PublicFooter() {
  return (
    <footer className="bg-[#1a1b1f] px-4 py-12 text-gray-300 sm:px-6 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Coluna 1: Logo e Descrição */}
          <div className="space-y-6">
            <Link href="/">
              <Image
                src="/logo-white.png"
                alt="Helpdesk Público"
                width={200}
                height={65}
                className="object-contain"
                style={{ width: "170px", height: "auto" }}
              />
            </Link>
            <p className="text-sm leading-relaxed max-w-xs">
              Soluções especializadas em Contratação Pública Eficiente. Apoiamos
              entidades adjudicantes e operadores económicos em todo o processo
              de concurso público.
            </p>
          </div>

          {/* Coluna 2: Serviços */}
          <div className="space-y-4">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">
              Serviços
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Serviços Adjudicantes
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="hover:text-white transition-colors underline decoration-gray-500 underline-offset-4"
                >
                  Serviços Empresas e Adjudicatários
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Alerta Concursos Públicos
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Identificação CPV
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Recursos */}
          <div className="space-y-4">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">
              Recursos
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  ESG e Sustentabilidade
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  RH
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 4: Institucional e Ícones */}
          <div className="space-y-4">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">
              Institucional
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Sobre Nós
                </Link>
              </li>
            </ul>
            <div className="flex items-center gap-4 pt-4">
              <Link
                href="#"
                className="p-2 border border-gray-700 rounded-md hover:border-white transition-all"
              >
                <Mail className="w-5 h-5" />
              </Link>
              <Link
                href="#"
                className="p-2 border border-gray-700 rounded-md hover:border-white transition-all relative"
              >
                <User className="w-5 h-5" />
                <span className="absolute -bottom-1 -right-1 bg-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  <svg
                    className="w-2.5 h-2.5 text-black"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={4}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Linha Divisória */}
        <hr className="my-10 border-gray-800" />

        {/* Rodapé Inferior */}
        <div className="flex flex-col items-start gap-4 text-xs text-gray-500 md:flex-row md:items-center md:justify-between md:gap-6">
          <p>
            © 2023 Helpdesk Público. Todos os direitos reservados. Contratação
            Pública Eficiente.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="#" className="hover:text-gray-300">
              Política de Privacidade
            </Link>
            <Link href="#" className="hover:text-gray-300">
              Termos de Utilização
            </Link>
            <Link href="#" className="hover:text-gray-300">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
