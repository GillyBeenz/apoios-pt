/**
 * Renders apps/web/public/icone.svg to the PNGs the manifest and iOS need.
 *
 *   node scripts/gerar-icones.mjs
 *
 * Run it only when the SVG changes; the PNGs are committed, so a normal build and
 * deploy never needs sharp.
 *
 * Two families, deliberately, because they are not the same picture:
 *
 *   * `icone-*.png` are the icon as drawn, for anywhere it is shown whole.
 *   * `icone-maskable-*.png` inset the glyph to ~72% and bleed the background to
 *     the edge. Android applies its own mask — a circle, a squircle, a rounded
 *     square, depending on the launcher — and crops to roughly the central 80%.
 *     The manifest previously declared one unpadded file as `"any maskable"`,
 *     which is the standard way to get the roof of the house sliced off on half
 *     the phones in the country.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";


const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ_MODULOS = join(RAIZ, "apps", "web");
const PUBLICO = join(RAIZ, "apps", "web", "public");
const FUNDO = "#2b7a55";

// sharp arrives with Next rather than as a direct dependency, so it is resolved
// through Next rather than from here. Keeping it out of the app's own
// dependencies is the point: the PNGs are committed, so a build or a deploy never
// needs a rasteriser — only regenerating the icons does.
const require = createRequire(import.meta.url);
let sharp;
try {
  const daRaiz = createRequire(require.resolve("next/package.json", { paths: [RAIZ_MODULOS] }));
  sharp = daRaiz("sharp");
} catch {
  console.error(
    "sharp não foi encontrado. Vem com o Next, por isso normalmente basta " +
      "`pnpm install`. Os PNGs estão commitados: só é preciso correr isto se o " +
      "icone.svg mudar.",
  );
  process.exit(1);
}

const svg = await readFile(join(PUBLICO, "icone.svg"));

async function normal(tamanho) {
  const png = await sharp(svg, { density: 384 }).resize(tamanho, tamanho).png().toBuffer();
  await writeFile(join(PUBLICO, `icone-${tamanho}.png`), png);
}

async function mascaravel(tamanho) {
  const interior = Math.round(tamanho * 0.72);
  const margem = Math.round((tamanho - interior) / 2);
  const glifo = await sharp(svg, { density: 384 }).resize(interior, interior).toBuffer();
  const png = await sharp({
    create: {
      width: tamanho,
      height: tamanho,
      channels: 4,
      background: FUNDO,
    },
  })
    .composite([{ input: glifo, top: margem, left: margem }])
    .png()
    .toBuffer();
  await writeFile(join(PUBLICO, `icone-maskable-${tamanho}.png`), png);
}

async function apple() {
  // iOS applies its own rounding and does not composite transparency, so this one
  // is flattened onto the brand colour rather than left with an alpha channel.
  const png = await sharp(svg, { density: 384 })
    .resize(180, 180)
    .flatten({ background: FUNDO })
    .png()
    .toBuffer();
  await writeFile(join(PUBLICO, "apple-touch-icon.png"), png);
}

await mkdir(PUBLICO, { recursive: true });
await Promise.all([normal(192), normal(512), mascaravel(192), mascaravel(512), apple()]);
console.log("ícones gerados em apps/web/public");
