/**
 * CommonMark では日本語・記号に隣接する ** が正しくパースされず、
 * 段落内で ** が分割されたり残ったりする。mdast 上で統合・変換する。
 */
import { visit } from "unist-util-visit";

const PHRASING = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "html",
  "inlineCode",
  "link",
  "image",
  "break",
]);

const CONTAINERS = new Set(["paragraph", "heading", "tableCell", "listItem"]);

export function remarkFixBold() {
  return (tree) => {
    visit(tree, (node) => {
      if (!CONTAINERS.has(node.type) || !node.children?.length) return;
      node.children = fixChildren(node.children);
    });
  };
}

function fixChildren(children) {
  let result = [];

  for (const child of children) {
    if (child.type === "text" && child.value.includes("**")) {
      result.push(...splitCompleteBold(child.value));
    } else {
      result.push(child);
    }
  }

  result = fixSplitBold(result);
  return result;
}

function splitCompleteBold(value) {
  const parts = value.split(/(\*\*[^*]+?\*\*)/g);
  const result = [];

  for (const part of parts) {
    const match = part.match(/^\*\*([^*]+?)\*\*$/);
    if (match) {
      result.push(strongText(match[1]));
    } else if (part.length > 0) {
      result.push({ type: "text", value: part });
    }
  }

  return result;
}

function fixSplitBold(children) {
  const out = [];
  let i = 0;

  while (i < children.length) {
    const a = children[i];

    if (a.type === "text" && /\*\*[^*]*$/.test(a.value)) {
      const openMatch = a.value.match(/^(.*?)\*\*([^*]*)$/s);
      if (openMatch) {
        const middle = [];
        if (openMatch[2]) middle.push({ type: "text", value: openMatch[2] });

        let j = i + 1;
        let suffix = null;
        let boldB = null;

        while (j < children.length) {
          const node = children[j];
          if (node.type === "text") {
            const closeMatch = node.value.match(/^([^*]*)\*\*(.*)$/s);
            if (closeMatch) {
              boldB = closeMatch[1];
              suffix = closeMatch[2];
              j++;
              break;
            }
          }
          middle.push(node);
          j++;
        }

        if (suffix !== null) {
          if (
            middle.length === 1 &&
            (middle[0].type === "strong" || middle[0].type === "emphasis")
          ) {
            if (openMatch[1]) out.push({ type: "text", value: openMatch[1] });
            if (openMatch[2]) out.push(strongText(openMatch[2]));
            out.push({ type: "text", value: phrasingToText(middle[0]) });
            if (boldB) out.push(strongText(boldB));
            if (suffix) out.push({ type: "text", value: suffix });
            i = j;
            continue;
          }

          if (openMatch[1]) out.push({ type: "text", value: openMatch[1] });
          if (boldB) middle.push({ type: "text", value: boldB });
          out.push({ type: "strong", children: middle });
          if (suffix) out.push({ type: "text", value: suffix });
          i = j;
          continue;
        }
      }
    }

    out.push(children[i]);
    i++;
  }

  return out;
}

function phrasingToText(node) {
  if (node.type === "text") return node.value;
  if (node.children) return node.children.map(phrasingToText).join("");
  return "";
}

function strongText(value) {
  return { type: "strong", children: [{ type: "text", value }] };
}
