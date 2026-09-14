import { parse } from "node-html-parser";
import {
  canonicalizarUrl,
  normalizarEspacos,
  type Candidato,
} from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

/**
 * `portugal2030.pt/avisos/` — the real notice listing.
 *
 * Not to be confused with `pt2030-avisos`, which reads `/category/avisos/`: that
 * is the WordPress **news** category. It carries articles *about* notices, six per
 * page with no pagination, which is why that source has produced exactly six funds
 * since it was added and why every one of them has empty `medidas` — a press
 * release does not say what work a programme pays for.
 *
 * This URL was found in the captured markup of that very category page, sitting in
 * the site navigation the whole time.
 *
 * **The markup here is guessed.** Nothing in this repository has yet seen what
 * `/avisos/` serves; the sandbox cannot reach portugal2030.pt at all. That is what
 * `em-captura` is for, and why `candidatosMin` is 0: until a capture has run, zero
 * candidates is the expected result and means nothing.
 */

/** WordPress date permalinks, as used across this site: `/YYYY/MM/DD/<slug>/`. */
const RE_PERMALINK_DATA = /^\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;

/** A notice may also hang off a flat path, e.g. `/avisos/<slug>/`. */
const RE_CAMINHO_AVISO = /^avisos\/[^/]+\/?$/;

function caminhoDe(href: string, urlBase: string): string | null {
  try {
    const u = new URL(href, urlBase);
    if (
      u.hostname.replace(/^www\./, "") !==
      new URL(urlBase).hostname.replace(/^www\./, "")
    ) {
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

  for (const a of raiz.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (href === undefined || href === null) continue;

    const caminho = caminhoDe(href, ctx.urlBase);
    if (caminho === null) continue;

    const ehPdf = /\.pdf$/i.test(caminho);
    if (
      !ehPdf &&
      !RE_PERMALINK_DATA.test(caminho) &&
      !RE_CAMINHO_AVISO.test(caminho)
    ) {
      continue;
    }

    // The listing page itself matches `avisos/` shapes; it is not a notice.
    if (/^avisos\/?$/.test(caminho)) continue;

    const url = new URL(href, ctx.urlBase).toString();
    const canonica = canonicalizarUrl(url);
    if (vistos.has(canonica)) continue;
    vistos.add(canonica);

    const titulo = normalizarEspacos(a.text ?? "");
    // A link with no text is navigation furniture — an icon, a spacer. Extracting
    // it would send the model a document we cannot even name.
    if (titulo.length === 0) continue;

    candidatos.push({
      titulo,
      urlDetalhe: url,
      urlCanonica: canonica,
      referenciaLegalBruta: null,
      // Deliberately null rather than the wrong date. The listing's dates are not
      // yet known to be deadlines, and a publication date worn as a deadline is
      // exactly the confident wrongness this product must not produce.
      dataBruta: null,
      tipoDocumento: ehPdf ? "pdf" : "html",
    });
  }

  return candidatos;
}
