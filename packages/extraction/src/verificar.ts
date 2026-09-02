import { formaComparavel } from "@apoios/core";
import type { Extraccao } from "./esquema.ts";

export interface CampoComProva {
  readonly caminho: string;
  readonly confianca: "alta" | "media" | "baixa";
  readonly evidencia: string;
}

/** Pull every evidence-bearing field out of an extraction, with its dotted path. */
export function camposComProva(e: Extraccao): CampoComProva[] {
  return [
    { caminho: "identificacao.referencia_legal", ...e.identificacao.referencia_legal },
    { caminho: "estado", ...e.estado },
    { caminho: "dotacao_esgotada", ...e.dotacao_esgotada },
    { caminho: "prazos.abertura", ...e.prazos.abertura },
    { caminho: "prazos.encerramento", ...e.prazos.encerramento },
    { caminho: "beneficiarios.tipos", ...e.beneficiarios.tipos },
    { caminho: "beneficiarios.admite_particulares", ...e.beneficiarios.admite_particulares },
    { caminho: "medidas", ...e.medidas },
  ].map(({ caminho, confianca, evidencia }) => ({ caminho, confianca, evidencia }));
}

export interface ResultadoVerificacao {
  /** Paths whose quote could not be found verbatim in the source document. */
  readonly provaFalhou: readonly string[];
  /** Paths that supplied no quote at all. Expected and allowed; not a failure. */
  readonly semProva: readonly string[];
  /** Confidence per path, downgraded to `baixa` wherever verification failed. */
  readonly confiancaEfectiva: ReadonlyMap<string, "alta" | "media" | "baixa">;
}

/**
 * Check every evidence quote is literally present in the source text.
 *
 * This is the primary hallucination gate, and it is deliberately dumb: a substring
 * test after whitespace and diacritic normalisation. It cannot be fooled by a
 * confident tone, it costs nothing, it runs offline, and it fails in the one
 * direction that matters — a claim the document does not actually make gets its
 * confidence forced down to `baixa`, which in turn blocks the alert.
 *
 * A field with no quote is *not* treated as a failure: the prompt explicitly tells
 * the model to return an empty quote when the document is silent, and punishing
 * that would push it toward inventing quotes instead.
 */
export function verificarProvas(e: Extraccao, textoFonte: string): ResultadoVerificacao {
  const fonte = formaComparavel(textoFonte);
  const provaFalhou: string[] = [];
  const semProva: string[] = [];
  const confiancaEfectiva = new Map<string, "alta" | "media" | "baixa">();

  for (const campo of camposComProva(e)) {
    const citacao = campo.evidencia.trim();

    if (citacao.length === 0) {
      semProva.push(campo.caminho);
      confiancaEfectiva.set(campo.caminho, campo.confianca);
      continue;
    }

    if (fonte.includes(formaComparavel(citacao))) {
      confiancaEfectiva.set(campo.caminho, campo.confianca);
    } else {
      provaFalhou.push(campo.caminho);
      confiancaEfectiva.set(campo.caminho, "baixa");
    }
  }

  return { provaFalhou, semProva, confiancaEfectiva };
}
