import {
  EsquemaExtraccao,
  decidir,
  verificarProvas,
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
 *
 * ## Why the verification is recomputed when it can be
 *
 * This used to rebuild the verification from the stored columns and say so: that
 * recomputing would be "re-verifying quotes against a document that has not
 * changed — the same inputs, so the same answer". The document had not changed.
 * **The reader had**, and that was the hole in the reasoning: the inputs to
 * `verificarProvas` are the extraction *and the derived text*, and a fix to the
 * PDF reader changes the second one without touching a single byte of the first.
 *
 * It cost 123 of 123 extractions their evidence. The reader inserted a space at
 * every text-positioning operator, so `LISBOA2030-2023-12` reached the gate as
 * `LISBOA2030 - 2023 - 1 2`; the model had quoted the code whole, as it should,
 * and every quote carrying a code or a date failed verbatim. A pass that replayed
 * the stored verdict would have reproduced that failure faithfully, for free, for
 * ever.
 *
 * So: given the text, the quotes are checked again. Without it — a row whose
 * `snapshot_id` predates the backfill — the stored verdict stands, and the result
 * says which of the two happened rather than letting the caller assume.
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
  /**
   * The document's text, when the extraction can name its snapshot.
   *
   * Given, the quotes are checked again; absent, the stored verdict stands. The
   * difference travels in the result, so a run can say how many rows it actually
   * re-verified instead of implying it re-verified them all.
   */
  readonly texto?: string | null;
}

export type Redecisao =
  | {
      readonly estado: "decidido";
      readonly fundId: string;
      readonly decisao: Decisao;
      /**
       * `recalculada` when the quotes were checked against the document again,
       * `do_registo` when the verdict stored at extraction time was reused.
       */
      readonly verificacao: "recalculada" | "do_registo";
    }
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

  // Com o texto do documento, as citações voltam a ser conferidas: é a única
  // forma de uma correcção ao leitor chegar a uma extracção já guardada.
  if (linha.texto !== undefined && linha.texto !== null && linha.texto !== "") {
    const verificacao = verificarProvas(analise.data, linha.texto);
    return {
      estado: "decidido",
      fundId: linha.fundId,
      verificacao: "recalculada",
      decisao: decidir(analise.data, verificacao, linha.stopReason, hoje),
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
    verificacao: "do_registo",
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
