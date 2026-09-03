import { parse } from "node-html-parser";
import { canonicalizarUrl, normalizarEspacos, type Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

/**
 * Portugal 2030 is WordPress, and here — unlike the fundoambiental.pt sources — the
 * URL shape alone is NOT enough.
 *
 * Notices use date permalinks, `/YYYY/MM/DD/<slug>/`. But so does every other post on
 * the site, and the captured archive page carries two sets of them:
 *
 *   <article class="et_pb_post post-255417 ...">   ← the archive itself, 6 notices
 *   <ul class="wp-block-latest-posts__list">       ← a sidebar of 5 unrelated news
 *
 * "Portugal consolida a sua posição no panorama europeu da inovação" sits in that
 * sidebar. It is not a notice, and no path rule can tell it from one — only the
 * container can. So this extractor scopes to the archive container and then still
 * checks the URL shape, which means a theme change that renames the container yields
 * ZERO candidates and trips the health floor, rather than quietly harvesting the
 * sidebar and spending real money extracting press releases.
 */
const SELECTOR_ARTIGO = "article.et_pb_post";

/** `/YYYY/MM/DD/<slug>/` — WordPress date permalinks. */
const RE_CAMINHO_AVISO = /^\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;

/**
 * Publication date as the archive renders it: "Ago 10, 2026".
 *
 * This is when the notice was ANNOUNCED, not when it closes. It travels as a hint
 * only — the deadline comes from the notice itself, and treating a publication date
 * as a deadline is exactly the kind of confident wrongness this product must not
 * produce.
 */
const PADRAO_DATA_PUBLICACAO =
  /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\.?\s+\d{1,2},?\s+\d{4}\b/i;

function caminhoDe(href: string, urlBase: string): string | null {
  try {
    const u = new URL(href, urlBase);
    if (u.hostname.replace(/^www\./, "") !== new URL(urlBase).hostname.replace(/^www\./, "")) {
      return null;
    }
    return u.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

export function extrair(html: string, ctx: ContextoExtraccao): Candidato[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];

  for (const artigo of raiz.querySelectorAll(SELECTOR_ARTIGO)) {
    // The title link, not the featured image: the same notice is linked twice, and
    // only the heading carries usable text.
    const ancora =
      artigo.querySelector("h2.entry-title a") ??
      artigo.querySelector("h1.entry-title a") ??
      artigo.querySelector("a[href]");
    const href = ancora?.getAttribute("href");
    if (!ancora || !href) continue;

    const caminho = caminhoDe(href, ctx.urlBase);
    if (caminho === null || !RE_CAMINHO_AVISO.test(caminho)) continue;

    const url = new URL(href, ctx.urlBase).toString();
    const chave = canonicalizarUrl(url);
    if (vistos.has(chave)) continue;

    const titulo = normalizarEspacos(ancora.text ?? "");
    if (titulo.length < 8) continue;

    const publicado = normalizarEspacos(artigo.querySelector(".published")?.text ?? "");

    vistos.add(chave);
    candidatos.push({
      titulo,
      urlDetalhe: url,
      urlCanonica: chave,
      // Portugal 2030 notices carry their reference inside the notice, not the
      // archive title, so there is nothing honest to read here.
      referenciaLegalBruta: null,
      dataBruta: publicado.match(PADRAO_DATA_PUBLICACAO)?.[0] ?? null,
      tipoDocumento: "html",
    });
  }

  return candidatos;
}
