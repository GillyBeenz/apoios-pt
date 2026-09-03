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

export { ehPaginaDeErro };

/**
 * The news feed is the EARLY-SIGNAL source.
 *
 * A notice's own page under `apoios-2026/` is updated when the programme changes,
 * but the change that matters most to a homeowner — a republication that moves the
 * deadline, or a reinforcement of an exhausted budget that reopens it — is announced
 * here first, sometimes days earlier. `fundo-ambiental-aac` is the authority on what
 * a notice says; this source is the tripwire that says go and look.
 *
 * Same identification strategy as the notice listings, for the same reason: every
 * page on this site carries the same ~550-link navigation tree, so no CSS container
 * is trustworthy, while the path shape is unambiguous:
 *
 *   listagem-noticias/aviso-de-abertura-de-concurso-n-02-2026-....aspx
 *   listagem-noticias/programa-de-apoio-a-edificios-mais-sustentaveis-2023-....aspx
 *
 * i.e. `listagem-noticias/<slug>.aspx` — exactly two segments. The listing page
 * itself is `listagem-noticias.aspx`, which has one segment and so cannot match
 * itself.
 */
const RE_CAMINHO_NOTICIA = /^listagem-noticias\/[^/]+\.aspx$/i;

/**
 * Pagination, not a notice.
 *
 * The real listing links to `listagem-noticias/0.aspx`, which has exactly the shape
 * of a notice URL and is the "next page" control. Followed, it costs a detail fetch
 * and — once this source goes live — a paid extraction of a listing page, whose
 * output could only be nonsense.
 *
 * A notice slug is derived from its title and is never just a number.
 */
const RE_SLUG_PAGINACAO = /^\d+$/;

/**
 * Recurring administrative posts that are never a funding notice.
 *
 * Deliberately a NEGATIVE list, not a positive keyword allowlist. A title we fail to
 * recognise as a notice still becomes a candidate and costs one extraction; a real
 * notice dropped by an allowlist that did not anticipate its wording is a homeowner
 * who never hears about it. The asymmetry is roughly €0.20 against the entire point
 * of the product, so this filter fails open by construction.
 *
 * It only has to catch the high-volume repeats — the fund publishes payment reports
 * monthly and quarterly, which would otherwise be the single largest line on the bill.
 */
const RE_TITULO_ADMINISTRATIVO =
  /^(pagamentos|relatorio|relatório|balanco|balanço|contas|recrutamento|nomeacao|nomeação|aviso de recrutamento)\b/i;

export function extrair(html: string, ctx: ContextoExtraccao): Candidato[] {
  if (ehPaginaDeErro(html, ctx.urlBase)) return [];

  const raiz = parse(html);
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];

  for (const ancora of raiz.querySelectorAll("a[href]")) {
    const href = ancora.getAttribute("href");
    if (hrefInutil(href)) continue;

    const caminho = caminhoRelativo(href, ctx.urlBase);
    if (caminho === null || !RE_CAMINHO_NOTICIA.test(caminho)) continue;

    const slug = caminho.slice("listagem-noticias/".length).replace(/\.aspx$/i, "");
    if (RE_SLUG_PAGINACAO.test(slug)) continue;

    const url = new URL(href, ctx.urlBase).toString();
    const chave = canonicalizarUrl(url);
    if (vistos.has(chave)) continue;

    const titulo = textoLimpo(ancora);
    if (titulo.length < 8) continue;
    if (RE_TITULO_ADMINISTRATIVO.test(titulo)) continue;

    const contexto = ancora.parentNode ?? ancora;
    const textoContexto = textoLimpo(contexto);

    vistos.add(chave);
    candidatos.push({
      titulo,
      urlDetalhe: url,
      urlCanonica: chave,
      referenciaLegalBruta: titulo.match(PADRAO_REFERENCIA)?.[0] ?? null,
      // News items carry a publication date in their surrounding block. That is the
      // date of the announcement, not of the deadline — the pipeline treats it as a
      // hint only, and the deadline still comes from the notice itself.
      dataBruta: textoContexto.match(PADRAO_DATA)?.[0] ?? null,
      tipoDocumento: /\.pdf($|\?)/i.test(url) ? "pdf" : "html",
    });
  }

  return candidatos;
}
