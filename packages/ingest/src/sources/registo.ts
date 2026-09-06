import type { Fonte } from "./tipos.ts";
import { fundoAmbientalAac } from "./fundo-ambiental-aac/index.ts";
import { fundoAmbientalNoticias } from "./fundo-ambiental-noticias/index.ts";
import { prrCandidaturas } from "./prr-candidaturas/index.ts";
import { pt2030Avisos } from "./pt2030-avisos/index.ts";
import { pt2030PlanoAnualAvisos } from "./pt2030-plano-anual-avisos/index.ts";

/**
 * Every source the pipeline knows about.
 *
 * Phase 1 shipped exactly one, end to end, because everything genuinely hard here —
 * identity, trust gating, dedup, the eligibility rule — lives in the pipeline rather
 * than in any single adapter. Phase 2 adds breadth on top of that proven spine.
 *
 * A source is `activa` once its extractor has been run against markup captured
 * from the live site; until then it is `em-captura`, visited by
 * capturar-fixtures.yml and skipped by the pipeline. Only `prr-candidaturas` is
 * still in that state, and for a reason that will not resolve itself: its
 * listing is rendered client-side, so there is no markup for a pure extractor
 * to read (see prr-candidaturas/index.ts).
 *
 * The distinction is what lets the health floor work. For a verified source zero
 * candidates means the selectors broke; for an unverified one zero is simply the
 * expected first result.
 */
export const FONTES: readonly Fonte[] = [
  fundoAmbientalAac,
  fundoAmbientalNoticias,
  prrCandidaturas,
  pt2030Avisos,
  pt2030PlanoAnualAvisos,
];

/** The sources the daily pipeline actually ingests. */
export const FONTES_ACTIVAS: readonly Fonte[] = FONTES.filter(
  (f) => f.estado === "activa",
);

export function obterFonte(id: string): Fonte | undefined {
  return FONTES.find((f) => f.id === id);
}
