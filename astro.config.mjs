import { defineConfig } from "astro/config";
import { remarkFixBold } from "./src/plugins/remark-fix-bold.js";
import { rehypeFixBold } from "./src/plugins/rehype-fix-bold.js";
import { rehypeOptimizeImages } from "./src/plugins/rehype-optimize-images.js";
import { rehypeBasePath } from "./src/plugins/rehype-base-path.js";

/** 本番の公開 URL（ムームードメインのサブドメインなど）。例: https://www.example.com */
const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");

const repository = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repository?.split("/") ?? [];
const isUserPages = repo?.endsWith(".github.io");

let site = "http://localhost:4321";
let base = "/";

if (siteUrl) {
  site = siteUrl;
  base = "/";
} else if (repository) {
  base = isUserPages ? "/" : `/${repo}/`;
  site = isUserPages ? `https://${repo}` : `https://${owner}.github.io`;
}

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  markdown: {
    remarkPlugins: [remarkFixBold],
    rehypePlugins: [rehypeFixBold, rehypeOptimizeImages, [rehypeBasePath, base]],
    shikiConfig: {
      theme: "github-light",
    },
  },
});
