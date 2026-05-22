import { defineConfig } from "astro/config";
import { remarkFixBold } from "./src/plugins/remark-fix-bold.js";
import { rehypeFixBold } from "./src/plugins/rehype-fix-bold.js";
import { rehypeOptimizeImages } from "./src/plugins/rehype-optimize-images.js";
import { rehypeBasePath } from "./src/plugins/rehype-base-path.js";

const repository = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repository?.split("/") ?? [];
const isUserPages = repo?.endsWith(".github.io");

/** リポジトリ名が anglers-note 以外の場合は GITHUB_REPOSITORY から自動判定 */
const base = repository ? (isUserPages ? "/" : `/${repo}/`) : "/";
const site = repository
  ? isUserPages
    ? `https://${repo}`
    : `https://${owner}.github.io`
  : "http://localhost:4321";

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
