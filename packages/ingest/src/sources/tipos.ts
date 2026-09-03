import type { Candidato } from "@apoios/core";

export interface ContextoExtraccao {
  /** Base URL for resolving relative links. */
  readonly urlBase: string;
  /** Injected so extractors never read the wall clock and stay deterministic. */
  readonly agora: Date;
}

export interface Fonte {
  readonly id: string;
  readonly nome: string;
  readonly entidade: string;
  readonly urlBase: string;
  readonly urlsEntrada: readonly string[];
  readonly tipo: "listagem" | "noticias" | "legal" | "dataset";
  /**
   * Has this source's extractor been verified against markup captured from the
   * live site? `activa` yes, `em-captura` not yet.
   *
   * The pipeline ingests only `activa` sources; the fixture-capture workflow visits
   * both, since capture is precisely how a source stops being `em-captura`.
   *
   * The distinction earns its place because of what a zero-candidate run means. For
   * a verified source, zero means the selectors broke and the health floor must
   * fire. For an unverified one, zero is the expected first result and means
   * nothing. Collapsing the two would either bury real breakage in noise or fill
   * the run log with alarms nobody can act on — and an alarm people learn to
   * ignore is worse than no alarm.
   */
  readonly estado: "activa" | "em-captura";
  /** Hours between fetches. */
  readonly cadenciaHoras: number;
  /**
   * Health floor. A run returning fewer candidates than this is treated as a
   * broken selector rather than a quiet week — the failure mode where a site
   * redesign silently stops all alerts while every run still reports success.
   */
  readonly candidatosMin: number;
  /**
   * Detect a page the server returned with HTTP 200 that is actually an error.
   *
   * fundoambiental.pt does exactly this: a missing page lands on `Erro.aspx` with
   * status 200 and stable content, so neither the status check nor the content-hash
   * change gate would ever notice. Without this the source looks permanently healthy
   * while producing nothing. Optional — sources that fail honestly can omit it.
   */
  ehPaginaDeErro?(html: string, urlFinal: string): boolean;

  /**
   * Pure. No fetch, no fs, no Date.now — everything time-dependent arrives via
   * `ctx`. This is what makes every extractor unit-testable against a committed
   * fixture in an environment with no network at all.
   */
  extrair(html: string, ctx: ContextoExtraccao): Candidato[];
}
