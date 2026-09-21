import type { NextConfig } from "next";

// Ime GitHub repozitorija — spremeni, če bo repo poimenovan drugače.
// Uporablja se za /repo-ime predpono, ki jo GitHub Pages zahteva za "project pages"
// (https://uporabnik.github.io/repo-ime/). Če boš objavljal na uporabnik.github.io
// (root/user page), nastavi REPO_NAME na "".
const REPO_NAME = "Komadi";
const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPages && REPO_NAME ? `/${REPO_NAME}` : "";

const nextConfig: NextConfig = {
  output: "export",
  // Skrij Next.js indikator v razvojnem načinu (okno spodaj levo).
  devIndicators: false,
  // Dovoli dostop do dev strežnika s telefona prek WiFi (Next blokira
  // navzkrižne izvore dev virov). Ignorira se pri produkcijskem izvozu.
  allowedDevOrigins: ["192.168.2.84", "192.168.1.9"],
  basePath,
  assetPrefix: basePath ? `${basePath}/` : "",
  images: { unoptimized: true },
  // Na voljo v brskalniku, da service worker ve, pod katero potjo teče
  // (GitHub Pages project page ima vse pod /Komadi/).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
