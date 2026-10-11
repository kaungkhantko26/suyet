import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, Noto_Sans_Myanmar } from "next/font/google";
import Script from "next/script";
import { config } from "@/lib/config";
import { dictionaries } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { headers } from "next/headers";
import { getLocale } from "@/i18n/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { VerifyBanner } from "@/components/layout/verify-banner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const myanmar = Noto_Sans_Myanmar({ subsets: ["myanmar"], variable: "--font-myanmar", display: "swap", weight: ["400", "500", "600", "700"] });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: { default: `${config.brandName} — Myanmar's home for tech events`, template: `%s · ${config.brandName}` },
  description: "Discover hackathons, competitions, workshops and technology opportunities across Myanmar and beyond.",
  applicationName: config.brandName,
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: config.brandName, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f3f0e8" }, { media: "(prefers-color-scheme: dark)", color: "#09090b" }],
  width: "device-width",
  initialScale: 1,
};

// Production: register the service worker. Development: remove any worker (and its caches) so un-hashed dev chunks are never served stale.
const swScript = process.env.NODE_ENV === "production"
  ? `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`
  : `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})});if(window.caches){caches.keys().then(function(k){k.forEach(function(n){if(n.indexOf('lte-')===0)caches.delete(n)})})}}`;

const themeScript = `try{var t=localStorage.getItem('lte-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const dict = dictionaries[locale];
  return (
    <html lang={locale} className={`${inter.variable} ${myanmar.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce}>{themeScript}</Script>
        <I18nProvider dict={dict} locale={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[10px] focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">{dict.nav.skip}</a>
          <SiteHeader />
          <VerifyBanner />
          <main id="main" className="flex-1">{children}</main>
          <SiteFooter />
        </I18nProvider>
        <Script id="sw-register" strategy="afterInteractive" nonce={nonce}>{swScript}</Script>
      </body>
    </html>
  );
}
