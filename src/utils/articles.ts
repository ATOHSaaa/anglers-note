import { getCollection, type CollectionEntry } from "astro:content";
import { withBase } from "./paths";

const CATEGORY_ORDER = ["釣り用語", "釣り方", "タックル", "ニュース"];

export const CATEGORIES = [
  { name: "釣り用語", slug: "basics" },
  { name: "釣り方", slug: "methods" },
  { name: "タックル", slug: "tackle" },
  { name: "ニュース", slug: "news" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** ナビ・トップ・サイドバーなどに表示しないカテゴリ */
export const HIDDEN_CATEGORY_SLUGS = new Set<CategorySlug>([]);

export function isCategoryVisible(slug: CategorySlug): boolean {
  return !HIDDEN_CATEGORY_SLUGS.has(slug);
}

export const VISIBLE_CATEGORIES = CATEGORIES.filter((category) =>
  isCategoryVisible(category.slug),
);

export type ArticlesByCategory = [string, CollectionEntry<"articles">[]][];

export function getCategorySlugs(): CategorySlug[] {
  return CATEGORIES.map((category) => category.slug);
}

export function getCategoryBySlug(slug: string) {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function getCategoryHref(name: string): string {
  const category = CATEGORIES.find((item) => item.name === name);
  return category ? withBase(`/categories/${category.slug}/`) : withBase("/");
}

export async function getNavCategories() {
  const grouped = await getArticlesByCategory();

  return grouped.flatMap(([name]) => {
    const category = CATEGORIES.find((item) => item.name === name);
    if (!category || !isCategoryVisible(category.slug)) return [];

    return [{ name: category.name, slug: category.slug, href: withBase(`/categories/${category.slug}/`) }];
  });
}

export const TAGS = [
  { name: "アジング", slug: "ajing" },
  { name: "バスフィッシング", slug: "bass-fishing" },
  { name: "エギング", slug: "eging" },
] as const;

export type TagSlug = (typeof TAGS)[number]["slug"];

export function getTagSlugs(): TagSlug[] {
  return TAGS.map((tag) => tag.slug);
}

export function getTagBySlug(slug: string) {
  return TAGS.find((tag) => tag.slug === slug);
}

export function getTagHref(name: string): string | undefined {
  const tag = TAGS.find((item) => item.name === name);
  return tag ? withBase(`/tags/${tag.slug}/`) : undefined;
}

export function getNavTags() {
  return TAGS.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
    href: withBase(`/tags/${tag.slug}/`),
  }));
}

export async function getPublishedArticlesByTag(tagName: string) {
  const articles = await getPublishedArticles();
  return articles.filter((article) => article.data.tags.includes(tagName));
}

export function getActiveNavTag(tags: string[]): string | undefined {
  return TAGS.find((tag) => tags.includes(tag.name))?.name;
}

export async function getPublishedArticles() {
  return (await getCollection("articles", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
}

function getArticleSearchText(article: CollectionEntry<"articles">): string {
  const { title, description, category, tags, mainKeyword } = article.data;
  return [title, description, category, mainKeyword ?? "", ...tags].join(" ").toLowerCase();
}

export async function searchArticles(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const terms = normalized.split(/\s+/).filter(Boolean);
  const articles = await getPublishedArticles();

  return articles.filter((article) => {
    const haystack = getArticleSearchText(article);
    return terms.every((term) => haystack.includes(term));
  });
}

export async function getArticlesByCategory(): Promise<ArticlesByCategory> {
  const articles = await getPublishedArticles();
  const grouped = new Map<string, CollectionEntry<"articles">[]>();

  for (const article of articles) {
    const { category } = article.data;
    const list = grouped.get(category) ?? [];
    list.push(article);
    grouped.set(category, list);
  }

  const ordered: ArticlesByCategory = [];

  for (const category of CATEGORY_ORDER) {
    const list = grouped.get(category);
    if (list?.length) {
      ordered.push([category, list]);
      grouped.delete(category);
    }
  }

  for (const [category, list] of grouped.entries()) {
    ordered.push([category, list]);
  }

  return ordered;
}

export async function getVisibleArticlesByCategory(): Promise<ArticlesByCategory> {
  const grouped = await getArticlesByCategory();
  return grouped.filter(([name]) => {
    const category = CATEGORIES.find((item) => item.name === name);
    return category && isCategoryVisible(category.slug);
  });
}
