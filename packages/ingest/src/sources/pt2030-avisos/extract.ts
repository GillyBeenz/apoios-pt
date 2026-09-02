import type { Candidato } from "@apoios/core";
import type { ContextoExtraccao } from "../tipos.ts";

/**
 * Not yet written — same reasoning as `prr-candidaturas`: WordPress markup this
 * sandbox cannot reach, and guessing it is what cost Phase 1 a full pass.
 *
 * Confirmed entry point: https://portugal2030.pt/category/avisos/ — a WordPress
 * category archive, which means pagination at `/category/avisos/page/N/` almost
 * certainly matters here in a way it did not for the ASP.NET sources. That is the
 * first thing to check against the captured page.
 */
export function extrair(_html: string, _ctx: ContextoExtraccao): Candidato[] {
  return [];
}
