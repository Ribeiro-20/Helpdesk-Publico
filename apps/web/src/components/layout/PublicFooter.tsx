import Image from "next/image";
import Link from "next/link";
import { Linkedin, Facebook, Instagram, Twitter, Youtube } from "lucide-react";

const SAME_DOMAIN = "mercado.helpdeskpublico.pt";

const externalProps = (href: string): { target?: string; rel?: string } => {
  try {
    const url = new URL(href);
    return url.hostname === SAME_DOMAIN ? {} : { target: '_blank', rel: 'noopener noreferrer' };
  } catch {
    return { target: '_blank', rel: 'noopener noreferrer' };
  }
};

export default function PublicFooter() {
  return (
    <footer className="bg-[#1a1b1f] px-4 py-12 text-gray-300 sm:px-6 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-7xl text-center">
        
        {/* Distribuição centralizada em coluna para mobile e lado a lado em desktop */}
        <div className="flex flex-col items-center gap-12 md:flex-row md:justify-center md:items-start md:gap-16 lg:gap-24"> 
          
          {/* Coluna 1: Logo, Redes Sociais e Destaque da Agência */}
          <div className="flex flex-col items-center gap-6">
            {/* Logo */}
            <a 
              href="https://www.helpdeskpublico.pt/" 
              {...externalProps('https://www.helpdeskpublico.pt/')}
              className="inline-block"
            >
              <Image
                src="/logo-white.png"
                alt="Helpdesk Público"
                width={220}
                height={70}
                className="object-contain"
                priority
              />
            </a>
            
            {/* Ícones das Redes Sociais */}
            <div className="flex justify-center items-center gap-4 text-[#80889a]">
              <Link
                href="https://linkedin.com/company/helpdeskpublico/"
                {...externalProps('https://linkedin.com/company/helpdeskpublico/')}
                className="hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </Link>
              <Link 
                href="https://facebook.com/helpdeskpublico/" 
                {...externalProps('https://facebook.com/helpdeskpublico/')}
                className="hover:text-white transition-colors" 
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" />
              </Link>
              <Link 
                href="https://instagram.com/helpdeskpublico/" 
                {...externalProps('https://instagram.com/helpdeskpublico/')}
                className="hover:text-white transition-colors" 
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </Link>
              <Link 
                href="https://twitter.com/helpdeskpublico" 
                {...externalProps('https://twitter.com/helpdeskpublico')}
                className="hover:text-white transition-colors" 
                aria-label="Twitter / X"
              >
                <Twitter className="w-5 h-5" />
              </Link>
              <Link 
                href="https://youtube.com/@helpdeskpublico/" 
                {...externalProps('https://youtube.com/@helpdeskpublico/')}
                className="hover:text-white transition-colors" 
                aria-label="YouTube"
              >
                <Youtube className="w-5 h-5" />
              </Link>
            </div>

            {/* Secção de Destaque da TBubble */}
            <div className="mt-2 border-t border-gray-800 pt-4 w-full flex justify-center">
              <span className="text-[#c3881a] text-[14px]">
                Design by{" "}
                <Link 
                  href="https://www.tbubble.pt/" 
                  {...externalProps('https://www.tbubble.pt/')}
                  className="text-[#c3881a] hover:opacity-80 font-semibold transition-all duration-300 underline underline-offset-4 decoration-[#c3881a]/40 hover:decoration-[#c3881a]"
                >
                  TBubble Marketing & Comunicação
                </Link>
              </span>
            </div>
          </div>

          {/* Coluna 2: SERVIÇOS */}
          <div className="space-y-6 flex flex-col items-center">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              SERVIÇOS
            </h3>
            <ul className="space-y-4 text-[15px] flex flex-col items-center">
              <li>
                <Link href="https://helpdeskpublico.pt/adjudicantes" {...externalProps('https://helpdeskpublico.pt/adjudicantes')} className="hover:text-white transition-colors">
                  Serviços Adjudicantes
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/adjudicatarios" {...externalProps('https://helpdeskpublico.pt/adjudicatarios')} className="hover:text-white transition-colors">
                  Serviços Empresas e Adjudicatários
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/alerta-concursos-publicos" {...externalProps('https://helpdeskpublico.pt/alerta-concursos-publicos')} className="hover:text-white transition-colors">
                  Alerta Concursos Públicos
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/market-intelligence" {...externalProps('https://helpdeskpublico.pt/market-intelligence')} className="hover:text-white transition-colors">
                  Market Intelligence
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/go-no-go-concursos-publicos" {...externalProps('https://helpdeskpublico.pt/go-no-go-concursos-publicos')} className="hover:text-white transition-colors">
                  Go / No-Go Concursos Públicos
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 3: RECURSOS */}
          <div className="space-y-6 flex flex-col items-center">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              RECURSOS
            </h3>
            <ul className="space-y-4 text-[15px] flex flex-col items-center">
              <li>
                <Link href="https://helpdeskpublico.pt/identificacao-cpvs" {...externalProps('https://helpdeskpublico.pt/identificacao-cpvs')} className="hover:text-white transition-colors">
                  Identificação CPV
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/observatorio" {...externalProps('https://helpdeskpublico.pt/observatorio')} className="hover:text-white transition-colors">
                  Observatório
                </Link>
              </li>
              <li>
                <Link href="https://helpdeskpublico.pt/blog" {...externalProps('https://helpdeskpublico.pt/blog')} className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/FAQs" {...externalProps('https://www.helpdeskpublico.pt/FAQs')} className="hover:text-white transition-colors">
                  FAQs
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/decisao-contratacao-publica" {...externalProps('https://www.helpdeskpublico.pt/decisao-contratacao-publica')} className="hover:text-white transition-colors">
                  Apoio à Decisão
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 4: INSTITUCIONAL */}
          <div className="space-y-6 flex flex-col items-center">
            <h3 className="text-white font-semibold text-[15px] uppercase tracking-wide">
              INSTITUCIONAL
            </h3>
            <ul className="space-y-4 text-[15px] flex flex-col items-center">
              <li>
                <Link href="https://www.helpdeskpublico.pt/sobre-o-helpdesk-publico" {...externalProps('https://www.helpdeskpublico.pt/sobre-o-helpdesk-publico')} className="hover:text-white transition-colors">
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/contactos" {...externalProps('https://www.helpdeskpublico.pt/contactos')} className="hover:text-white transition-colors">
                  Contactos
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/privacidade" {...externalProps('https://www.helpdeskpublico.pt/privacidade')} className="hover:text-white transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/esg-sustentabilidade" {...externalProps('https://www.helpdeskpublico.pt/esg-sustentabilidade')} className="hover:text-white transition-colors">
                  ESG e Sustentabilidade
                </Link>
              </li>
              <li>
                <Link href="https://www.helpdeskpublico.pt/rh" {...externalProps('https://www.helpdeskpublico.pt/rh')} className="hover:text-white transition-colors">
                  Recursos Humanos
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Linha Divisória */}
        <hr className="my-10 border-gray-800" />

        {/* Rodapé Inferior */}
        <div className="text-center text-sm text-[#80889a] flex justify-center">
          <p>
            © 2022-2026 Helpdesk Público. Todos os direitos reservados. Contratação Pública Eficiente.
          </p>
        </div>
      </div>
    </footer>
  );
}