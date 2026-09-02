import type { Confianca } from "@apoios/core";
import type { Extraccao } from "./esquema.ts";
import { CAMPOS_CRITICOS } from "./esquema.ts";
import type { ResultadoVerificacao } from "./verificar.ts";

export interface Decisao {
  /** Visible in the public catalogue. */
  readonly publicado: boolean;
  /** May generate email. Strictly stronger than `publicado`. */
  readonly alertavel: boolean;
  readonly needsReview: boolean;
  readonly motivoRevisao: readonly string[];
  readonly confiancaGlobal: Confianca;
}

/**
 * Decide what a given extraction is allowed to do.
 *
 * Two separate permissions, deliberately: a fund we are unsure about is still worth
 * *showing* — badged "elegibilidade por confirmar", with a link to the official
 * notice, so a curious user can check for themselves — but it must never be *pushed*
 * into someone's inbox as though we were confident.
 *
 * Every condition fails closed. That costs some recall, and that is the intended
 * trade: a missed alert is a missed opportunity, while a wrong one can send someone
 * to spend ten thousand euros on the strength of a grant they were never eligible for.
 */
export function decidir(
  e: Extraccao,
  v: ResultadoVerificacao,
  stopReason: string | null,
): Decisao {
  const motivos: string[] = [];

  if (stopReason === "refusal") motivos.push("recusa_do_modelo");

  if (!e.auto_avaliacao.documento_e_aviso_de_apoio) {
    motivos.push("nao_e_aviso_de_apoio");
  }

  if (v.provaFalhou.length > 0) {
    // The model quoted text that is not in the document. Whatever else is true,
    // this extraction does not get to send email.
    motivos.push(`prova_falhou:${v.provaFalhou.join(",")}`);
  }

  const criticosFracos = CAMPOS_CRITICOS.filter(
    (c) => (v.confiancaEfectiva.get(c) ?? "baixa") !== "alta",
  );
  if (criticosFracos.length > 0) {
    motivos.push(`confianca_insuficiente:${criticosFracos.join(",")}`);
  }

  if (e.auto_avaliacao.qualidade_ocr === "ma") {
    motivos.push("ocr_ma");
  }

  // Worth stating separately from the confidence check: even a high-confidence
  // `desconhecido` is not permission to email a homeowner. The matcher enforces
  // this again per-user, but blocking it here keeps it out of every digest at once.
  const admite = e.beneficiarios.admite_particulares.valor;
  if (admite !== "sim") {
    motivos.push(`admite_particulares:${admite}`);
  }

  const confiancas = [...v.confiancaEfectiva.values()];
  const confiancaGlobal: Confianca = confiancas.includes("baixa")
    ? "baixa"
    : confiancas.includes("media")
      ? "media"
      : "alta";

  const bloqueiaPublicacao =
    stopReason === "refusal" ||
    !e.auto_avaliacao.documento_e_aviso_de_apoio ||
    confiancaGlobal === "baixa";

  return {
    publicado: !bloqueiaPublicacao,
    alertavel: motivos.length === 0,
    needsReview: motivos.length > 0,
    motivoRevisao: motivos,
    confiancaGlobal,
  };
}
