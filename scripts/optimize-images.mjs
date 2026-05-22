/**
 * content/articles/{slug}/images/ の元画像を WebP に変換し、
 * public/articles/{slug}/ に出力する。
 *
 * レスポンシブ用に複数幅のバリアントも生成し、
 * 寸法情報は .astro/image-manifest.json に書き出す。
 */
import { readdir, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const CONTENT_DIR = join(ROOT, "content/articles");
const OUTPUT_DIR = join(ROOT, "public/articles");
const MANIFEST_PATH = join(ROOT, ".astro/image-manifest.json");

const SOURCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const TARGET_WIDTHS = [480, 720, 1080];
const MAX_WIDTH = 1080;
const WEBP_QUALITY = 80;

async function collectArticleSlugs() {
  const entries = await readdir(CONTENT_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function collectSourceImages(slug) {
  const imagesDir = join(CONTENT_DIR, slug, "images");
  try {
    const entries = await readdir(imagesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && SOURCE_EXTENSIONS.has(extname(e.name).toLowerCase()))
      .map((e) => join(imagesDir, e.name));
  } catch {
    return [];
  }
}

async function optimizeImage(slug, sourcePath) {
  const name = basename(sourcePath, extname(sourcePath));
  const outDir = join(OUTPUT_DIR, slug);
  await mkdir(outDir, { recursive: true });

  const input = sharp(sourcePath).rotate(); // EXIF orientation
  const metadata = await input.metadata();
  const originalWidth = metadata.width ?? MAX_WIDTH;
  const effectiveMax = Math.min(originalWidth, MAX_WIDTH);

  const widths = TARGET_WIDTHS.filter((w) => w <= effectiveMax);
  if (widths.length === 0 || !widths.includes(effectiveMax)) {
    widths.push(effectiveMax);
  }
  widths.sort((a, b) => a - b);

  const srcset = [];
  let primaryWidth = 0;
  let primaryHeight = 0;
  let primaryPath = "";

  for (const width of widths) {
    const suffix = width === effectiveMax && widths.length === 1 ? "" : `-${width}w`;
    const filename = `${name}${suffix}.webp`;
    const outPath = join(outDir, filename);
    const publicPath = `/articles/${slug}/${filename}`;

    const resized = sharp(sourcePath).rotate().resize({
      width,
      withoutEnlargement: true,
    });

    await resized.webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(outPath);

    const info = await sharp(outPath).metadata();
    srcset.push({ width, path: publicPath, height: info.height ?? 0 });

    if (width === effectiveMax) {
      primaryWidth = info.width ?? width;
      primaryHeight = info.height ?? 0;
      primaryPath = publicPath;
    }
  }

  // 単一サイズの場合は {name}.webp、複数ある場合は最大幅を {name}.webp にもコピー
  const canonicalPath = join(outDir, `${name}.webp`);
  const canonicalPublicPath = `/articles/${slug}/${name}.webp`;
  if (primaryPath && primaryPath !== canonicalPublicPath) {
    const primaryFile = join(outDir, basename(primaryPath));
    await writeFile(canonicalPath, await readFile(primaryFile));
  } else if (widths.length === 1) {
    primaryPath = canonicalPublicPath;
  }

  return {
    key: canonicalPublicPath,
    entry: {
      width: primaryWidth,
      height: primaryHeight,
      srcset: srcset.map(({ width, path, height }) => ({ width, path, height })),
    },
  };
}

async function main() {
  const slugs = await collectArticleSlugs();
  const manifest = {};
  let total = 0;

  for (const slug of slugs) {
    const sources = await collectSourceImages(slug);
    for (const sourcePath of sources) {
      const { key, entry } = await optimizeImage(slug, sourcePath);
      manifest[key] = entry;

      // .jpg 等の拡張子でも manifest を引けるようにエイリアスを登録
      const ext = extname(sourcePath).toLowerCase();
      if (ext !== ".webp") {
        const aliasKey = key.replace(/\.webp$/, ext);
        manifest[aliasKey] = entry;
      }

      const { size: sourceSize } = await stat(sourcePath);
      let outputSize = 0;
      for (const { path } of entry.srcset) {
        try {
          const { size: s } = await stat(join(ROOT, "public", path));
          outputSize += s;
        } catch {
          // ignore
        }
      }
      console.log(`  ✓ ${basename(sourcePath)} → WebP (${formatBytes(sourceSize)} → ${formatBytes(outputSize)})`);
      total++;
    }
  }

  await mkdir(join(ROOT, ".astro"), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  if (total === 0) {
    console.log("最適化対象の画像はありません (content/articles/{slug}/images/)");
  } else {
    console.log(`${total} 件の画像を WebP に変換しました`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
