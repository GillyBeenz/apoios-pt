import type { Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

/**
 * Not yet written — deliberately.
 *
 * recuperarportugal.gov.pt is WordPress, so nothing about its markup can be inferred
 * from the ASP.NET sources already handled here, and this sandbox cannot reach the
 * domain to look. Phase 1 taught the cost of guessing: selectors written against
 * invented HTML followed a video gallery and a 2017 archive on the real site, and
 * the whole first pass had to be thrown away.
 *
 * So this returns nothing until `capturar-fixtures.yml` has brought the real markup
 * back, and the source is marked `em-captura` so the pipeline skips it rather than
 * reading that emptiness as a broken selector.
 *
 * What IS confirmed is where to look:
 *   - https://recuperarportugal.gov.pt/candidaturas-prr/   the notices listing
 *   - https://recuperarportugal.gov.pt/wp-content/uploads/ap/plano-de-avisos.pdf
 *     a stable path holding the forward plan of notices — the PRR's counterpart to
 *     the Portugal 2030 annual plan, and the same "expected to open" signal.
 */
export function extrair(_html: string, _ctx: ContextoExtraccao): Candidato[] {
  return [];
}
