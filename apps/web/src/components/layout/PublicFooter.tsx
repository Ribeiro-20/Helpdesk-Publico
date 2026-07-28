import Image from "next/image";
import Link from "next/link";
import { Linkedin, Facebook, Instagram, Twitter, Youtube } from "lucide-react";

export default function PublicFooter() {
  return (
    <footer className="bg-[#1a1b1f] px-4 py-12 text-gray-300 sm:px-6 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-7xl">
        
        <div className="flex flex-col items-center text-center gap-12 md:flex-row md:items-start md:text-left md:justify-between md:gap-6">
          
          {/* Coluna 1: Logo, Redes Sociais e Destaque da Agência */}
          <div className="flex flex-col items-start gap-6">
            {/* Logo */}
            <a 
              href="https://www.helpdeskpublico.pt/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-block"
            >
              <Image
                src="/logo-white.png"
                alt="Helpdesk Público"
                width={220}
                height={70}
                className="object-contain"
                style={{ width: "220px", height: "auto", maxWidth: "100%" }}
                priority
              />
            </a>
            
            {/* Ícones das Redes Sociais */}
            <div className="flex items-center gap-4 pl-0 sm:pl-2 text-[#80889a]">
              <Link
                href="https://linkedin.com/company/helpdeskpublico/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </Link>
              <Link 
                href="https://facebook.com/helpdeskpublico/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-white transition-colors" 
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" />
              </Link>
              <Link 
                href="https://instagram.com/helpdeskpublico/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-white transition-colors" 
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </Link>
              <Link 
                href="https://twitter.com/helpdeskpublico" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-white transition-colors" 
                aria-label="Twitter / X"
              >
                <Twitter className="w-5 h-5" />
              </Link>
              <Link 
                href="https://youtube.com/@helpdeskpublico/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-white transition-colors" 
                aria-label="YouTube"
              >
                <Youtube className="w-5 h-5" />
              </Link>
            </div>

            {/* Secção de Destaque da TBubble alterada para rgb(195, 136, 26) -> #c3881a */}
            <div className="mt-2 pl-0 sm:pl-2 border-t border-gray-800 pt-4 w-full md:w-auto">
              <span className="text-[#c3881a] text-[14px]">
                Design by{" "}
                <Link 
                  href="https://www.tbubble.pt/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[#c3881a] hover:opacity-80 font-semibold transition-all duration-300 underline underline-offset-4 decoration-[#c3881a]/40 hover:decoration-[#c3881a]"
                >
                  TBubble Marketing &amp; Comunicação
                </Link>
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-start space-y-6">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              SERVIÇOS
            </h3>
            <ul className="flex flex-col items-center md:items-start space-y-4 text-[15px]">
              <li>
                <Link href="https://helpdeskpublico.pt/adjudicantes" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Serviços Adjudicantes
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/adjudicatarios" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Serviços Empresas e Adjudicatários
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/alerta-concursos-publicos" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Alerta Concursos Públicos
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/market-intelligence" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Market Intelligence
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/go-no-go-concursos-publicos" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Go / No-Go Concursos Públicos
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center md:items-start space-y-6">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              RECURSOS
            </h3>
            <ul className="flex flex-col items-center md:items-start space-y-4 text-[15px]">
              <li>
                <Link href="https://helpdeskpublico.pt/identificacao-cpvs" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Identificação CPV
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/observatorio" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Observatório
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/blog" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/FAQs" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  FAQs
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/decisao-contratacao-publica" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Apoio à Decisão
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center md:items-start space-y-6">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              INSTITUCIONAL
            </h3>
            <ul className="flex flex-col items-center md:items-start space-y-4 text-[15px]">
              <li>
                <Link href="https://www.helpdeskpublico.pt/sobre-o-helpdesk-publico" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/contactos" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Contactos
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/esg-sustentabilidade" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  ESG e Sustentabilidade
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/rh" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Recursos Humanos
                </Link>
              </li>
            </ul>
          </div>

        </div>


        <hr className="my-10 border-gray-800" />

        <div className="text-center text-sm text-gray-500">
          <p>
            © 2022-2026 Helpdesk Público. Todos os direitos reservados. Contratação Pública Eficiente.
          </p>
        </div>
      </div>
    </footer>
  );
}