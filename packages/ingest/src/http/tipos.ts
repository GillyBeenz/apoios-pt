export interface PedidoCondicional {
  readonly url: string;
  readonly etag?: string | null;
  readonly lastModified?: string | null;
}

export interface RespostaHttp {
  readonly url: string;
  readonly status: number;
  /** True when the server answered 304 and there is nothing to re-process. */
  readonly naoModificado: boolean;
  readonly corpo: string | null;
  readonly bytes: Uint8Array | null;
  readonly contentType: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly erro: string | null;
}

/**
 * The single seam through which anything reaches the network.
 *
 * Two implementations: the real fetcher, and a fixture-backed replay. Every test
 * and the whole pipeline are written against this interface, which is what lets
 * the pipeline be exercised end to end in a sandbox that cannot reach a single
 * Portuguese government domain.
 */
export interface Buscador {
  buscar(pedido: PedidoCondicional): Promise<RespostaHttp>;
}

export const USER_AGENT =
  "ApoiosBot/1.0 (+https://apoios.pt/sobre; contacto@apoios.pt)";

/** Minimum gap between requests to the same host. Government infrastructure. */
export const ATRASO_ENTRE_PEDIDOS_MS = 2_000;
