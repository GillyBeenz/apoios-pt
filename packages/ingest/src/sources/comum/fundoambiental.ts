import { type HTMLElement } from "node-html-parser";
import { normalizarEspacos } from "@apoios/core";

/**
 * Shared between the two fundoambiental.pt sources — the notice listings and the
 * news feed. They are one site behind one ASP.NET CMS, so the soft-404 detector in
 * particular must not exist twice: a copy that drifts turns a dead entry URL back
 * into a permanently healthy-looking source, which is the failure this whole file
 * is here to prevent.
 */

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

/** e.g. "02/2026", "09/C08-i01.01/2026" */
export const PADRAO_REFERENCIA =
  /\b\d{1,2}\s*\/\s*[\dA-Za-z][\dA-Za-z.\-]*(?:\s*\/\s*\d{4})?/;

export const PADRAO_DATA =
  /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b|\b\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4}\b/i;

export function textoLimpo(el: HTMLElement): string {
  return normalizarEspacos(el.text ?? "");
}

/**
 * The link's path relative to the site root, or null when it points somewhere else.
 * Both sources identify their documents by path shape rather than by any CSS
 * container, so this is the first step of every match.
 */
export function caminhoRelativo(href: string, urlBase: string): string | null {
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

/** Anchors that can never be a document link. */
export function hrefInutil(href: string | undefined): href is undefined {
  return !href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href);
}
