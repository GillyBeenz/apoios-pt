import {
  EsquemaExtraccao,
  decidir,
  type Decisao,
} from "@apoios/extraction";

/**
 * Re-run the publication gate over extractions already in the database.
 *
 * `publicado`, `alertavel` and `confianca_global` are decided once, when a
 * document is extracted, and then stored on the fund. The change gate then keeps
 * that document from being looked at again while its content is unchanged — which
 * is correct, and which means a fund goes on carrying a decision taken under a
 * rule that no longer exists.
 *
 * That is exactly what happened when `dotacao_esgotada` left the global
 * confidence: 26 funds stayed invisible, held back by a veto the code had already
 * stopped applying.
 *
 * This exists so the answer to "the gate changed" is never "re-extract everything".
 * Re-extraction would ask the model to re-read documents it has already read, at
 * cost, to arrive at the same extraction — the model's answer did not change, our
 * reading of it did.
 */

/** One stored extraction, as the columns hold it. */
export interface ExtraccaoArmazenada {
  readonly fundId: string;
  readonly bruto: unknown;
  /** `fund_extractions.confianca_campos` — effective confidence per field path. */
  readonly confiancaCampos: Readonly<Record<string, string>>;
  /** `fund_extractions.evidencia_falhou`. */
  readonly evidenciaFalhou: readonly string[];
  readonly stopReason: string | null;
}

export type Redecisao =
  | { readonly estado: "decidido"; readonly fundId: string; readonly decisao: Decisao }
  | { readonly estado: "ilegivel"; readonly fundId: string; readonly motivo: string };

const CONFIANCAS = new Set(["alta", "media", "baixa"]);

/**
 * Decide again from what is stored, without a model call and without the document.
 *
 * The verification result is **rebuilt from the stored columns rather than
 * recomputed**. `verificarProvas` needs the source text, and re-running it here
 * would be re-verifying quotes against a document that has not changed — the same
 * inputs, so the same answer, for the price of holding every snapshot in memory.
 * `confianca_campos` and `evidencia_falhou` *are* that function's output, written
 * down at the time. `decidir` reads only those two fields of the verification, so
 * what it receives here is complete, not a stub.
 *
 * An extraction whose `bruto` no longer parses is returned as `ilegivel` and left
 * alone. That happens when the schema has moved on since the row was written, and
 * the honest response is to leave the old decision standing and say so — not to
 * coerce a stale shape into the current one and publish the result.
 */
export function redecidir(
  linha: ExtraccaoArmazenada,
  /**
   * Today, as YYYY-MM-DD, passed straight through to `decidir`.
   *
   * It matters here more than it looks. The gate publishes a closed fund as
   * history only when it can *check* that the deadline has passed, and without a
   * date it cannot, so it refuses. A re-decision pass that forgot to pass this
   * would quietly decide every historical fund the strict way and report "nothing
   * changed" — the most expensive kind of wrong answer, because it looks like a
   * finished job.
   */
  hoje?: string,
): Redecisao {
  const analise = EsquemaExtraccao.safeParse(linha.bruto);
  if (!analise.success) {
    return {
      estado: "ilegivel",
      fundId: linha.fundId,
      motivo: analise.error.issues[0]?.message ?? "bruto não valida",
    };
  }

  const confiancaEfectiva = new Map<string, "alta" | "media" | "baixa">();
  for (const [campo, valor] of Object.entries(linha.confiancaCampos)) {
    // A confidence we do not recognise is dropped rather than guessed at. The gate
    // reads a missing field as `baixa`, so dropping fails closed; inventing one
    // would fail open.
    if (CONFIANCAS.has(valor)) {
      confiancaEfectiva.set(campo, valor as "alta" | "media" | "baixa");
    }
  }

  return {
    estado: "decidido",
    fundId: linha.fundId,
    decisao: decidir(
      analise.data,
      {
        provaFalhou: linha.evidenciaFalhou,
        // Not read by `decidir`. Empty rather than reconstructed, because a value
        // invented here would be indistinguishable from one that was measured.
        semProva: [],
        confiancaEfectiva,
      },
      linha.stopReason,
      hoje,
    ),
  };
}

/** What one fund's stored decision currently says. */
export interface DecisaoActual {
  readonly publicado: boolean;
  readonly alertavel: boolean;
}

/** True when re-deciding would actually change the fund's visibility. */
export function mudou(actual: DecisaoActual, nova: Decisao): boolean {
  return (
    actual.publicado !== nova.publicado || actual.alertavel !== nova.alertavel
  );
}
