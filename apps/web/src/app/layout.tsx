import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Monitor | Helpdesk Público",
  description: "Monitorização de anúncios de contratação pública",
  icons: {
    icon: "/android-chrome-57x57.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
