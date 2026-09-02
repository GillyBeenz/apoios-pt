import { parse, type HTMLElement } from "node-html-parser";
import { canonicalizarUrl, normalizarEspacos, type Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

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

const PADRAO_REFERENCIA =
  /\b\d{1,2}\s*\/\s*[\dA-Za-z][\dA-Za-z.\-]*(?:\s*\/\s*\d{4})?/;

const PADRAO_DATA =
  /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b|\b\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4}\b/i;

/**
 * The site serves its error page with HTTP 200.
 *
 * A request for a page that does not exist lands on
 * `/wwwbase/raiz/Erro.aspx?aspxerrorpath=/avisos-2026.aspx` — status 200, 433 bytes,
 * "Ocorreu um erro". Status-code checks therefore cannot detect a dead entry URL,
 * and the content hash of that page is perfectly stable, so the change gate would
 * treat it as a healthy unchanged source for ever. This is how a source silently
 * dies while every run reports success.
 */
export function ehPaginaDeErro(html: string, urlFinal: string): boolean {
  if (/aspxerrorpath=|\/Erro\.aspx/i.test(urlFinal)) return true;
  return /<title>\s*Ocorreu um erro\s*<\/title>/i.test(html);
}

function textoLimpo(el: HTMLElement): string {
  return normalizarEspacos(el.text ?? "");
}

function caminhoRelativo(href: string, urlBase: string): string | null {
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
  // A dead entry URL must yield nothing rather than a plausible-looking zero, so the
  // health floor fires instead of the source appearing quietly healthy.
  if (ehPaginaDeErro(html, ctx.urlBase)) return [];

  const raiz = parse(html);
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];

  for (const ancora of raiz.querySelectorAll("a[href]")) {
    const href = ancora.getAttribute("href");
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue;

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
