import { parse } from "node-html-parser";
import { canonicalizarUrl, type Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";
import {
  caminhoRelativo,
  ehPaginaDeErro,
  hrefInutil,
  PADRAO_DATA,
  PADRAO_REFERENCIA,
  textoLimpo,
} from "../comum/fundoambiental.ts";

// Re-exported because it is part of this source's public surface: index.ts wires it
// into the Fonte, and the pipeline calls it before hashing.
export { ehPaginaDeErro };

/**
 * Notices are identified by the SHAPE OF THEIR URL, not by any CSS container.
 *
 * This was rewritten after seeing the real site for the first time. fundoambiental.pt
 * has no listing page in the usual sense: every page carries the same ~550-link
 * navigation tree, and the notices are entries within it. An earlier version looked
 * for article/li containers and keyword-matched link text, which on the real markup
 * happily followed a video gallery, the forms page and the 2017 archive.
 *
 * The path shape, by contrast, is unambiguous and stable:
 *
 *   apoios-2026/transicao-energetica1/032026-reforco-da-resiliencia-....aspx
 *   apoios-prr/c13-eficiencia-energetica-em-edificios/09c13-i012025.aspx
 *
 * i.e. `apoios-<year>|apoios-prr` / <section> / <notice>.aspx — exactly three
 * segments. On the captured page this takes 546 anchors down to 47 notices.
 */
const RE_CAMINHO_AVISO = /^apoios-(?:\d{4}|prr)\/[^/]+\/[^/]+\.aspx$/i;

/**
 * Sections that sit at the notice path depth but are documentation, not notices.
 * Kept deliberately short: the path rule already does the heavy lifting.
 */
const SECCOES_IGNORADAS = /^(documentos|documentacao|formularios|faq|legislacao)/i;

export function extrair(html: string, ctx: ContextoExtraccao): Candidato[] {
  // A dead entry URL must yield nothing rather than a plausible-looking zero, so the
  // health floor fires instead of the source appearing quietly healthy.
  if (ehPaginaDeErro(html, ctx.urlBase)) return [];

  const raiz = parse(html);
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];

  for (const ancora of raiz.querySelectorAll("a[href]")) {
    const href = ancora.getAttribute("href");
    if (hrefInutil(href)) continue;

    const caminho = caminhoRelativo(href, ctx.urlBase);
    if (caminho === null || !RE_CAMINHO_AVISO.test(caminho)) continue;

    const seccao = caminho.split("/")[1] ?? "";
    if (SECCOES_IGNORADAS.test(seccao)) continue;

    const url = new URL(href, ctx.urlBase).toString();
    const chave = canonicalizarUrl(url);
    if (vistos.has(chave)) continue;

    // The link text is the notice title and usually carries its reference, e.g.
    // "09/C08-i01.01/2026 - Criação de Novas OIGP 2.0".
    const titulo = textoLimpo(ancora);
    if (titulo.length < 8) continue;

    const contexto = ancora.parentNode ?? ancora;
    const textoContexto = textoLimpo(contexto);

    vistos.add(chave);
    candidatos.push({
      titulo,
      urlDetalhe: url,
      urlCanonica: chave,
      referenciaLegalBruta: titulo.match(PADRAO_REFERENCIA)?.[0] ?? null,
      dataBruta: textoContexto.match(PADRAO_DATA)?.[0] ?? null,
      tipoDocumento: /\.pdf($|\?)/i.test(url) ? "pdf" : "html",
    });
  }

  return candidatos;
}
