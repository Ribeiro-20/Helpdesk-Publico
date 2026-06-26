import Image from "next/image";
import Link from "next/link";
import { Linkedin, Facebook, Instagram, Twitter, Youtube } from "lucide-react";

export default function PublicFooter() {
  return (
    <footer className="bg-[#1a1b1f] px-4 py-12 text-gray-300 sm:px-6 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-7xl">
        
        {/* Distribuição flexível perfeita com justify-between e flex-wrap para responsividade */}
        <div className="flex flex-col gap-12 md:flex-row md:justify-between md:gap-6">
          
          {/* Coluna 1: Logo e Redes Sociais */}
          <div className="flex flex-col items-start gap-5">
            <Link href="/" className="inline-block">
              <Image
                src="/logo-white.png"
                alt="Helpdesk Público"
                width={220}
                height={70}
                className="object-contain"
                priority
              />
            </Link>
            
            {/* Ícones com recuo pl-6 para alinhar exatamente sob o escudo/bandeira */}
            <div className="flex items-center gap-4 pl-6 text-gray-500">
              <Link href="https://linkedin.com/company/helpdeskpublico/" className="hover:text-white transition-colors" aria-label="LinkedIn">
                <Linkedin className="w-5 h-5" />
              </Link>
              <Link href="https://facebook.com/helpdeskpublico/" className="hover:text-white transition-colors" aria-label="Facebook">
                <Facebook className="w-5 h-5" />
              </Link>
              <Link href="https://instagram.com/helpdeskpublico/" className="hover:text-white transition-colors" aria-label="Instagram">
                <Instagram className="w-5 h-5" />
              </Link>
              <Link href="https://twitter.com/helpdeskpublico" className="hover:text-white transition-colors" aria-label="Twitter / X">
                <Twitter className="w-5 h-5" />
              </Link>
              <Link href="https://youtube.com/@helpdeskpublico/" className="hover:text-white transition-colors" aria-label="YouTube">
                <Youtube className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Coluna 2: SERVIÇOS */}
          <div className="space-y-6">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              SERVIÇOS
            </h3>
            <ul className="space-y-4 text-[15px]">
              <li>
                <Link href="https://helpdeskpublico.pt/adjudicantes" className="hover:text-white transition-colors">
                  Serviços Adjudicantes
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/adjudicatarios" className="hover:text-white transition-colors">
                  Serviços Empresas e Adjudicatários
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/alerta-concursos-publicos" className="hover:text-white transition-colors">
                  Alerta Concursos Públicos
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/market-intelligence" className="hover:text-white transition-colors">
                  Market Intelligence
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/go-no-go-concursos-publicos" className="hover:text-white transition-colors">
                  Go / No-Go Concursos Públicos
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 3: RECURSOS */}
          <div className="space-y-6">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              RECURSOS
            </h3>
            <ul className="space-y-4 text-[15px]">
              <li>
                <Link href="https://helpdeskpublico.pt/identificacao-cpvs" className="hover:text-white transition-colors">
                  Identificação CPV
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/observatorio" className="hover:text-white transition-colors">
                  Observatório
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/blog" className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/FAQs" className="hover:text-white transition-colors">
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 4: INSTITUCIONAL */}
          <div className="space-y-6">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              INSTITUCIONAL
            </h3>
            <ul className="space-y-4 text-[15px]">
              <li>
                <Link href="https://www.helpdeskpublico.pt/sobre-o-helpdesk-publico" className="hover:text-white transition-colors">
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/contactos" className="hover:text-white transition-colors">
                  Contactos
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/privacidade" className="hover:text-white transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/esg-sustentabilidade" className="hover:text-white transition-colors">
                  ESG e Sustentabilidade
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Linha Divisória */}
        <hr className="my-10 border-gray-800" />

        {/* Rodapé Inferior */}
        <div className="text-center text-sm text-gray-500">
          <p>
            © 2022-2026 Helpdesk Público. Todos os direitos reservados. Contratação Pública Eficiente.
          </p>
        </div>
      </div>
    </footer>
  );
}