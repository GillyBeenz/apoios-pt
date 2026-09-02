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
 * Only `fundo-ambiental-aac` is `activa`. The rest are `em-captura`: their entry
 * URLs are confirmed, but no extractor here has met their real markup, and this
 * sandbox cannot reach the domains to look. They are visited by
 * capturar-fixtures.yml and skipped by the pipeline until that has happened.
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
