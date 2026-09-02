import type { Fonte } from "./tipos.ts";
import { fundoAmbientalAac } from "./fundo-ambiental-aac/index.ts";

/**
 * Every source the pipeline knows about.
 *
 * Phase 1 ships exactly one, end to end. One source done properly beats five done
 * halfway, because everything genuinely hard here — identity, trust gating, dedup,
 * the eligibility rule — lives in the pipeline rather than in any single adapter.
 * Adding source #2 afterwards is a day's work against a proven spine.
 */
export const FONTES: readonly Fonte[] = [fundoAmbientalAac];

export function obterFonte(id: string): Fonte | undefined {
  return FONTES.find((f) => f.id === id);
}
