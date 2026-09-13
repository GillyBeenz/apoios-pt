/**
 * What a model call costs, in US dollars.
 *
 * `fund_extractions.custo_usd` has existed since migration 0001 and nothing ever
 * wrote to it. The column was not the hard part: the price table was missing, and
 * so was one of the four token counts it needs.
 *
 * Prices are per million tokens, from Anthropic's published rates. They are pinned
 * per model id rather than assumed, because a model swap that silently keeps the
 * old prices produces a cost figure that looks right and is wrong — worse than the
 * null it replaces.
 */
export interface PrecoModelo {
  /** Uncached input. */
  readonly entradaPorMTok: number;
  readonly saidaPorMTok: number;
  /** Writing the cached prefix: 1.25x uncached input. */
  readonly cacheEscritaPorMTok: number;
  /** Reading it back: 0.1x uncached input. This is where the saving lives. */
  readonly cacheLeituraPorMTok: number;
}

export const PRECOS: Readonly<Record<string, PrecoModelo>> = {
  "claude-opus-5": {
    entradaPorMTok: 5,
    saidaPorMTok: 25,
    cacheEscritaPorMTok: 6.25,
    cacheLeituraPorMTok: 0.5,
  },
};

export interface ContagemTokens {
  /** Uncached input only. The API reports cache reads separately, not inside this. */
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly tokensCacheLidos: number;
  readonly tokensCacheEscritos: number;
}

/**
 * Cost of one call, or `null` for a model with no pinned price.
 *
 * Null rather than zero, and null rather than a guess. A zero would sum silently
 * into a total that understates the bill; a guessed price would be worse still. A
 * null says "not priced here", which is a thing you can go and fix.
 */
export function custoDaChamada(
  modelo: string,
  t: ContagemTokens,
): number | null {
  const p = PRECOS[modelo];
  if (!p) return null;

  const usd =
    (t.tokensEntrada * p.entradaPorMTok +
      t.tokensSaida * p.saidaPorMTok +
      t.tokensCacheLidos * p.cacheLeituraPorMTok +
      t.tokensCacheEscritos * p.cacheEscritaPorMTok) /
    1_000_000;

  // `numeric(10, 6)` in the schema. Rounding here keeps the stored value and the
  // value we computed identical, instead of letting Postgres round differently.
  return Math.round(usd * 1_000_000) / 1_000_000;
}
