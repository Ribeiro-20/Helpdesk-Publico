"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const HUBSPOT_PORTAL_ID =
  process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID ?? "139646329";

const MARKET_PATH_PREFIXES = [
  "/mp",
  "/mercado-publico",
  "/oportunidades",
  "/outros",
  "/estatisticas-publico",
  "/estatisticas-privado",
];

function shouldLoadHubspot(pathname: string): boolean {
  return MARKET_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function HubspotMarketEmbed() {
  const pathname = usePathname();

  const canLoadOnRoute = !!pathname && shouldLoadHubspot(pathname);

  if (!pathname) return null;

  if (!canLoadOnRoute) return null;

  return (
    <Script
      id="hs-script-loader"
      src={`https://js-eu1.hs-scripts.com/${HUBSPOT_PORTAL_ID}.js`}
      strategy="afterInteractive"
    />
  );
}
