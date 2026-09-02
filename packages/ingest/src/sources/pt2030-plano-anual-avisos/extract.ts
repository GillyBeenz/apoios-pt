import { parse } from "node-html-parser";
import { canonicalizarUrl, normalizarEspacos, type Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

/**
 * The Plano Anual de Avisos is the one source that answers "what is COMING", not
 * "what is open".
 *
 * Every other source can only report a notice once it exists, by which point the
 * application window has already started running down. This plan lists roughly 400
 * notices scheduled for the next twelve months, and it is published as a
 * spreadsheet — already structured, so reading it costs nothing per row and needs no
 * model call at all.
 *
 * This extractor's only job is to find the file. It matches on the href's EXTENSION
 * rather than on any surrounding markup, which is what makes it safe to write before
 * the page has ever been captured: a WordPress theme can move the download button
 * anywhere, but the link still has to end in `.xlsx`.
 */
const RE_FICHEIRO_DADOS = /\.(xlsx|xls|ods|csv)(?:$|\?)/i;

/**
 * Link text that names an action rather than a document.
 *
 * Length is no guide here — "Descarregar" is longer than "PAA 2026" and says far
 * less. What matters is whether the text identifies WHICH file this is, because two
 * revisions of the plan differ only by version and both sit behind a button reading
 * "Descarregar".
 */
const RE_ROTULO_GENERICO =
  /^(descarregar|download|aceder|consultar|ver|abrir|ficheiro|documento|aqui|xlsx|excel)\b/i;

export function extrair(html: string, ctx: ContextoExtraccao): Candidato[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const candidatos: Candidato[] = [];

  for (const ancora of raiz.querySelectorAll("a[href]")) {
    const href = ancora.getAttribute("href");
    if (!href || !RE_FICHEIRO_DADOS.test(href)) continue;

    let url: string;
    try {
      url = new URL(href, ctx.urlBase).toString();
    } catch {
      continue;
    }

    const chave = canonicalizarUrl(url);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    // The link text is often just "Descarregar", so fall back to the filename —
    // which on this site carries the version, e.g. "PAA_2026_v3.xlsx".
    const rotulo = normalizarEspacos(ancora.text ?? "");
    const ficheiro = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const rotuloUtil = rotulo.length >= 4 && !RE_ROTULO_GENERICO.test(rotulo);
    const titulo = rotuloUtil ? rotulo : ficheiro;

    candidatos.push({
      titulo: titulo.length > 0 ? titulo : "Plano Anual de Avisos",
      urlDetalhe: url,
      urlCanonica: chave,
      referenciaLegalBruta: null,
      dataBruta: null,
      tipoDocumento: "folha",
    });
  }

  return candidatos;
}
