import { parse, type HTMLElement } from "node-html-parser";
import { canonicalizarUrl, normalizarEspacos, type Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

/**
 * Words that mark a link as an actual funding notice rather than site furniture.
 * Accent-free because they are matched against the diacritic-stripped form.
 */
const PADRAO_AVISO =
  /\b(aviso|avisos|aac|concurso|candidatura|candidaturas|edital|apoio|despacho)\b/i;

/**
 * A document kind followed, within a short span, by a reference number.
 *
 * The span is matched with an explicit "not a newline" class rather than a negated
 * letter class: under the `i` flag, `[^\dA-Z]` also excludes `a-z`, which would
 * reject the "n.º" that sits between the words and the number in virtually every
 * Portuguese notice title. `canonicalizarReferenciaLegal` reduces whatever span
 * matches here to its canonical form, so over-capturing is harmless.
 */
const PADRAO_REFERENCIA =
  /\b(?:aviso|aac|concurso|despacho|edital|portaria)\b[^\n]{0,40}?\b\d[\dA-Za-z]*(?:[/-][\dA-Za-z.]+)+/i;

const PADRAO_DATA =
  /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b|\b\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4}\b/i;

function textoLimpo(el: HTMLElement): string {
  return normalizarEspacos(el.text ?? "");
}

function resolverUrl(href: string, urlBase: string): string | null {
  try {
    return new URL(href, urlBase).toString();
  } catch {
    return null;
  }
}

function tipoDocumento(url: string): Candidato["tipoDocumento"] {
  const semQuery = url.split("?")[0] ?? url;
  if (/\.pdf$/i.test(semQuery)) return "pdf";
  if (/\.(aspx|html?|php)$/i.test(semQuery)) return "html";
  return "desconhecido";
}

/**
 * Extract candidate notices from a Fundo Ambiental listing page.
 *
 * NOTE ON CORRECTNESS: this environment cannot reach fundoambiental.pt — the egress
 * proxy blocks every Portuguese government domain — so the selectors here have not
 * yet been checked against the site's real markup. They are therefore written
 * defensively, in layers: try the structured containers a CMS listing usually
 * produces, and fall back to scanning anchors whose text looks like a notice. Once
 * `capturar-fixtures.yml` commits real HTML, `extract.test.ts` gains a fixture case
 * and these selectors get tightened against it. The health floor (`candidatosMin`)
 * is what stops a wrong guess here from failing silently in production.
 */
export function extrair(html: string, ctx: ContextoExtraccao): Candidato[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];

  const adicionar = (ancora: HTMLElement, contexto: HTMLElement): void => {
    const href = ancora.getAttribute("href");
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) return;

    const url = resolverUrl(href, ctx.urlBase);
    if (!url) return;

    // Stay on the source's own domain; listings link out to unrelated portals.
    try {
      if (new URL(url).hostname.replace(/^www\./, "") !== new URL(ctx.urlBase).hostname.replace(/^www\./, "")) {
        return;
      }
    } catch {
      return;
    }

    const titulo = textoLimpo(ancora) || textoLimpo(contexto);
    if (titulo.length < 12) return;

    const chave = canonicalizarUrl(url);
    if (vistos.has(chave)) return;

    const textoContexto = textoLimpo(contexto);
    if (!PADRAO_AVISO.test(titulo) && !PADRAO_AVISO.test(textoContexto)) return;

    vistos.add(chave);
    candidatos.push({
      titulo,
      urlDetalhe: url,
      urlCanonica: chave,
      referenciaLegalBruta:
        titulo.match(PADRAO_REFERENCIA)?.[0] ?? textoContexto.match(PADRAO_REFERENCIA)?.[0] ?? null,
      dataBruta: textoContexto.match(PADRAO_DATA)?.[0] ?? null,
      tipoDocumento: tipoDocumento(url),
    });
  };

  // Layer 1: structured listing containers, which give us a per-item context block
  // (title plus dates) rather than a bare link.
  const contentores = raiz.querySelectorAll(
    [
      "article",
      "li.aviso",
      "div.aviso",
      "div.listagem-item",
      "div.item-listagem",
      "div.news-item",
      "div.noticia",
      "tr",
    ].join(","),
  );

  for (const contentor of contentores) {
    for (const ancora of contentor.querySelectorAll("a[href]")) {
      adicionar(ancora, contentor);
    }
  }

  // Layer 2: if the structured pass found nothing, the page uses markup we did not
  // anticipate. Fall back to every anchor that reads like a notice, using its
  // nearest block ancestor as context.
  if (candidatos.length === 0) {
    for (const ancora of raiz.querySelectorAll("a[href]")) {
      adicionar(ancora, ancora.parentNode ?? ancora);
    }
  }

  return candidatos;
}
