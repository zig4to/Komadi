import type { Metadata, Viewport } from "next";
import { Geist_Mono, Montserrat } from "next/font/google";
import Script from "next/script";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

// latin-ext: š/č/ž, sicer pridejo iz nadomestne pisave z drugačno širino in
// v ChordsViewer.tsx zamaknejo akorde nad besedilom.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Bitne Tabs — moje skladbe za kitaro",
  description: "Osebna zbirka priljubljenih skladb za igranje na kitaro.",
  manifest: "manifest.json",
  icons: {
    icon: [
      { url: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bitne Tabs",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Privzeto temno; ThemeProvider po prvem izrisu preklopi na shranjeno
    // izbiro (svetla / sistemska), če je uporabnik to izbral.
    <html
      lang="sl"
      suppressHydrationWarning
      className={`${montserrat.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <ThemeProvider />
        {children}
        <RegisterServiceWorker />
        <Script src="/install-promo.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
