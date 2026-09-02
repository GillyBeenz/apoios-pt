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
