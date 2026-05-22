/**
 * hast 上に残った **text** を <strong> に変換する（remark 修正後のフォールバック）。
 */
export function rehypeFixBold() {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type !== "element" || !node.children?.length) return;
      node.children = fixElementChildren(node.children);
    });
  };
}

function fixElementChildren(children) {
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
      result.push(strongElement(match[1]));
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
            middle[0].type === "element" &&
            (middle[0].tagName === "strong" || middle[0].tagName === "em")
          ) {
            if (openMatch[1]) out.push({ type: "text", value: openMatch[1] });
            if (openMatch[2]) out.push(strongElement(openMatch[2]));
            out.push({ type: "text", value: elementToText(middle[0]) });
            if (boldB) out.push(strongElement(boldB));
            if (suffix) out.push({ type: "text", value: suffix });
            i = j;
            continue;
          }

          if (openMatch[1]) out.push({ type: "text", value: openMatch[1] });
          if (boldB) middle.push({ type: "text", value: boldB });
          out.push({ type: "element", tagName: "strong", properties: {}, children: middle });
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

function elementToText(node) {
  if (node.type === "text") return node.value;
  if (node.children) return node.children.map(elementToText).join("");
  return "";
}

function strongElement(text) {
  return {
    type: "element",
    tagName: "strong",
    properties: {},
    children: [{ type: "text", value: text }],
  };
}

function walk(node, fn) {
  fn(node);
  if (node.children) {
    for (const child of node.children) {
      walk(child, fn);
    }
  }
}
