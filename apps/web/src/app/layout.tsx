import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const GA_ID = "G-TXXYEHSNSB";

export const metadata: Metadata = {
  title: "Helpdesk Público | Informação do Mercado Público",
  description: "Helpdesk Público | Informação do Mercado Público",
  icons: {
    icon: "/android-chrome-57x57.png",
  },
  openGraph: {
    title: 'Helpdesk Público | Informação do Mercado Público',
    description: 'Helpdesk Público | Informação do Mercado Público',
    url: 'https://mercado.helpdeskpublico.pt',
    siteName: 'Helpdesk Público',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Helpdesk Público',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helpdesk Público | Informação do Mercado Público',
    description: 'Helpdesk Público | Informação do Mercado Público',
    images: ['/og-image.svg'],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="overflow-x-hidden">
        {/* Google Tag (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="beforeInteractive"
        />
        <Script id="google-analytics" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
