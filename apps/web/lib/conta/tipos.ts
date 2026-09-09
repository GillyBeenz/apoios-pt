/**
 * Constants and types shared by the account forms and their server actions.
 *
 * Separate from `accoes.ts` because a `"use server"` module may export nothing but
 * async functions — the build rejects a constant there outright, which is how this
 * file came to exist.
 */

/**
 * The version of the privacy policy a signup consents to.
 *
 * RGPD art. 7.º(1) puts the burden of *demonstrating* consent on the controller, and
 * "they ticked a box once" is not demonstrable if the text has since changed. Bump
 * this whenever /privacidade changes materially; `profiles.consentimento_versao`
 * then records which wording each person actually agreed to.
 */
export const VERSAO_CONSENTIMENTO = "2026-09-09";

export const FREQUENCIAS = ["imediata", "diaria", "semanal"] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

export interface EstadoFormulario {
  readonly erro?: string;
  readonly guardado?: boolean;
}
