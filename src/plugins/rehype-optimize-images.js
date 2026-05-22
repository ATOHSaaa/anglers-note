/**
 * 記事内の <img> を WebP 配信用の <picture> に変換する。
 * .astro/image-manifest.json の寸法・srcset 情報を利用する。
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_PATH = join(process.cwd(), ".astro/image-manifest.json");

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function toWebpPath(src) {
  return src.replace(/\.(jpe?g|png|tiff?)$/i, ".webp");
}

function buildSrcset(srcset) {
  return srcset.map(({ width, path }) => `${path} ${width}w`).join(", ");
}

function createPicture(img, entry) {
  const src = img.properties.src;
  const webpSrc = toWebpPath(src);
  const properties = { ...img.properties, src: webpSrc };

  if (entry) {
    properties.width = entry.width;
    properties.height = entry.height;
    if (entry.srcset?.length > 1) {
      properties.srcset = buildSrcset(entry.srcset);
      properties.sizes = "(max-width: 768px) 100vw, 720px";
    }
  }

  if (!properties.loading) properties.loading = "lazy";
  if (!properties.decoding) properties.decoding = "async";

  const source = {
    type: "element",
    tagName: "source",
    properties: {
      type: "image/webp",
      ...(properties.srcset
        ? { srcset: properties.srcset, sizes: properties.sizes }
        : { srcset: webpSrc }),
    },
    children: [],
  };

  const fallbackImg = {
    ...img,
    properties: {
      ...properties,
      srcset: undefined,
      sizes: undefined,
    },
  };

  return {
    type: "element",
    tagName: "picture",
    properties: {},
    children: [source, fallbackImg],
  };
}

export function rehypeOptimizeImages() {
  const manifest = loadManifest();

  return (tree) => {
    walk(tree, (node, parent) => {
      if (node.type !== "element" || node.tagName !== "img") return;
      if (parent?.tagName === "picture") return;

      const src = node.properties?.src;
      if (!src || typeof src !== "string") return;
      if (!src.startsWith("/articles/")) return;
      const webpSrc = toWebpPath(src);
      const entry = manifest[src] ?? manifest[webpSrc];
      const replacement = createPicture(node, entry);
      Object.assign(node, replacement);
    });
  };
}

function walk(node, fn, parent = null) {
  fn(node, parent);
  if (node.children) {
    for (const child of node.children) {
      walk(child, fn, node);
    }
  }
}
