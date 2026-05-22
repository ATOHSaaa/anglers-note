/**
 * 記事本文内のルート相対リンク・画像パスに base を付与する（GitHub Pages 用）
 */
import { visit } from "unist-util-visit";

export function rehypeBasePath(base = "/") {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  function prefixPath(value) {
    if (typeof value !== "string") return value;
    if (!value.startsWith("/") || value.startsWith("//")) return value;
    return `${normalizedBase}${value.slice(1)}`;
  }

  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.properties?.href) {
        node.properties.href = prefixPath(node.properties.href);
      }

      if (node.properties?.src) {
        node.properties.src = prefixPath(node.properties.src);
      }

      if (node.properties?.srcset && typeof node.properties.srcset === "string") {
        node.properties.srcset = node.properties.srcset
          .split(",")
          .map((entry) => {
            const trimmed = entry.trim();
            const spaceIndex = trimmed.lastIndexOf(" ");
            if (spaceIndex === -1) {
              return prefixPath(trimmed);
            }

            const url = trimmed.slice(0, spaceIndex);
            const descriptor = trimmed.slice(spaceIndex);
            return `${prefixPath(url)}${descriptor}`;
          })
          .join(", ");
      }
    });
  };
}
