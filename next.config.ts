import type { NextConfig } from "next";

// Ime GitHub repozitorija — spremeni, če bo repo poimenovan drugače.
// Uporablja se za /repo-ime predpono, ki jo GitHub Pages zahteva za "project pages"
// (https://uporabnik.github.io/repo-ime/). Če boš objavljal na uporabnik.github.io
// (root/user page), nastavi REPO_NAME na "".
const REPO_NAME = "Komadi";
const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGithubPages && REPO_NAME ? `/${REPO_NAME}` : "",
  assetPrefix: isGithubPages && REPO_NAME ? `/${REPO_NAME}/` : "",
  images: { unoptimized: true },
};

export default nextConfig;
