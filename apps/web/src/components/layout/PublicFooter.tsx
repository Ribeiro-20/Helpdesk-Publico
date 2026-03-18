import Image from "next/image";
import Link from "next/link";
import {
  Facebook,
  Handshake,
  Instagram,
  Linkedin,
  Users,
  Youtube,
} from "lucide-react";

const QUICK_LINKS = [
  { label: "Contatos Oficiais", href: "#" },
  { label: "Sobre Nós", href: "#" },
  { label: "Política de Privacidade", href: "#" },
];

const SOCIAL_LINKS = [
  {
    label: "LinkedIn",
    href: "#",
    icon: <Linkedin className="h-6 w-6" strokeWidth={1.9} />,
  },
  {
    label: "Facebook",
    href: "#",
    icon: <Facebook className="h-6 w-6" strokeWidth={1.9} />,
  },
  {
    label: "Instagram",
    href: "#",
    icon: <Instagram className="h-6 w-6" strokeWidth={1.9} />,
  },
  {
    label: "X",
    href: "#",
    icon: <span className="text-2xl font-light leading-none">X</span>,
  },
  {
    label: "YouTube",
    href: "#",
    icon: <Youtube className="h-6 w-6" strokeWidth={1.9} />,
  },
];

export default function PublicFooter() {
  return (
    <footer
      className="text-white"
      style={{
        background:
          "linear-gradient(180deg, rgba(25,27,34,1) 0%, rgba(18,20,28,1) 100%)",
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-5 lg:px-6 py-5 sm:py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 sm:gap-x-14 sm:gap-y-4 lg:gap-x-16">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-12 w-12 items-center justify-center text-white">
              <Users className="h-9 w-9" strokeWidth={1.8} />
            </div>

            <div className="flex h-12 w-12 items-center justify-center text-white">
              <Handshake className="h-9 w-9" strokeWidth={1.8} />
            </div>
          </div>

          <div className="space-y-1 text-left">
            <h3 className="text-xl sm:text-2xl font-semibold leading-tight">
              As nossas Redes Sociais
            </h3>

            <div className="flex items-center gap-2.5 sm:gap-3">
              {SOCIAL_LINKS.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="text-white hover:text-[#D49A28] transition-colors"
                >
                  {social.icon}
                </Link>
              ))}
            </div>

            <p className="text-base sm:text-lg font-medium tracking-tight">
              © 2022 Helpdesk Público
            </p>
          </div>

          <div className="flex">
            <Image
              src="/logo-white.webp"
              alt="Helpdesk Público"
              width={230}
              height={74}
              className="h-auto w-[170px] sm:w-[210px] object-contain"
            />
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm sm:text-base leading-tight underline underline-offset-2 hover:text-white/80 transition-colors"
              >
                {link.label}
              </Link>
            ))}

            <Link
              href="#"
              className="mt-1 text-sm sm:text-base font-semibold text-[#D49A28] underline underline-offset-2 hover:text-[#E2AF45] transition-colors"
            >
              Fale Conosco
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}