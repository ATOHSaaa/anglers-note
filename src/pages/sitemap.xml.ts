import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { CATEGORIES, TAGS } from "../utils/articles";

const STATIC_PAGES = ["", "about/", "how-to-use/", "privacy/", "search/", "articles/"];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toSitemapUrl(origin: string, path: string, lastmod?: Date): string {
  const loc = escapeXml(new URL(path, origin).href);
  const lastmodTag = lastmod
    ? `\n    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`
    : "";

  return `  <url>
    <loc>${loc}</loc>${lastmodTag}
  </url>`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL("https://tsurinara.atohs.me")).href.replace(/\/?$/, "/");
  const articles = await getCollection("articles", ({ data }) => !data.draft);

  const urls = [
    ...STATIC_PAGES.map((path) => toSitemapUrl(origin, path)),
    ...CATEGORIES.map((category) => toSitemapUrl(origin, `categories/${category.slug}/`)),
    ...TAGS.map((tag) => toSitemapUrl(origin, `tags/${tag.slug}/`)),
    ...articles.map((article) =>
      toSitemapUrl(origin, `articles/${article.slug}/`, article.data.updatedDate ?? article.data.pubDate),
    ),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
