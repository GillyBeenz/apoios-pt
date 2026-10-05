import { textoDoPdf } from "./pdf.ts";
import { decodificarEntidades, normalizarConteudo } from "../http/normalizar.ts";

/** `%PDF-`, os cinco bytes que a norma obriga a estar no início do ficheiro. */
export function comecaPorPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function textoVisivel(html: string): string {
  return (
    decodificarEntidades(
      normalizarConteudo(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    )
      // Entities are decoded before the whitespace collapse, so a `&#160;` that
      // became a space is folded like any other.
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * The text an evidence quote is checked against, from the stored bytes alone.
 *
 * This exists so there is exactly **one** derivation of that text. The pipeline
 * derived it inline while extracting, and a re-decision pass had no way to get at
 * it, so `redecidir` replayed the verification result written down at the time
 * instead of recomputing it. That was sound while the derivation never changed —
 * and the moment the PDF reader was fixed it stopped being sound, because the
 * stored answer had been computed against text that no longer existed. Two
 * derivations would have the same failure mode in slower motion, so there is one.
 *
 * It decides from the bytes, not from `content_type`: that column has never been
 * written on any snapshot (null on all 353), and the magic bytes are the thing
 * that is actually true. `textoVisivel` runs on everything that is not a PDF
 * because a snapshot holds either the raw body or, for a source whose fetcher
 * returned no bytes, the visible text already derived from it — and running it
 * over its own output changes nothing.
 */
export function textoDoDocumento(bytes: Uint8Array | null): string {
  if (bytes === null || bytes.length === 0) return "";
  if (comecaPorPdf(bytes)) return textoDoPdf(bytes);
  return textoVisivel(new TextDecoder("utf-8").decode(bytes));
}
