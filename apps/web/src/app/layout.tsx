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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
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
