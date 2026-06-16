import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body>
        {/* Google Tag (gtag.js) */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-TXXYEHSNSB"
        ></script>
        {children}
      </body>
    </html>
  );
}
