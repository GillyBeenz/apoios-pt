import type { Confianca } from "@apoios/core";
import type { Extraccao } from "./esquema.ts";
import { CAMPOS_CRITICOS } from "./esquema.ts";
import type { ResultadoVerificacao } from "./verificar.ts";

/**
 * Fields whose confidence does not count towards `confiancaGlobal`.
 *
 * Only for fields a notice structurally cannot state. Adding to this set weakens a
 * fail-closed gate, so each entry needs the reason written down next to it.
 */
const CAMPOS_FORA_DA_CONFIANCA_GLOBAL: ReadonlySet<string> = new Set([
  // Notices announce a dotação; they do not announce that it has run out.
  "dotacao_esgotada",
]);

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
  //
  // The exception is a notice that names condomínios explicitly. A homeowner does
  // roof, façade, lift and collective-solar work *through* their condomínio, never
  // as a pessoa singular — `BENEFICIARIOS_PROPRIETARIO` in the taxonomy has said
  // "directly or collectively" since the beginning, and this gate simply never
  // agreed with it. `Programa de Apoio a Condomínios Residenciais` is a real Fundo
  // Ambiental programme that this line alone would have kept out of every inbox.
  //
  // It is not a loosening. Both sides must be explicit: the notice has to *name*
  // condomínios as beneficiaries — a positive extraction from the document, not an
  // inference — and `corresponde()` then still requires the person to have asked
  // for condomínio alerts. `desconhecido` is admitted by neither branch.
  const admite = e.beneficiarios.admite_particulares.valor;
  // `=== "nao"` and not `!== "sim"`. The door needs a positive determination that
  // individuals are excluded, alongside a positive naming of condomínios. Written
  // the loose way first, it let a `desconhecido` notice through whenever it
  // happened to mention condomínios — fail-open, in the one gate whose entire
  // purpose is to fail closed. The pre-existing `desconhecido` test caught it.
  const portaDoCondominio =
    admite === "nao" && e.beneficiarios.tipos.valor.includes("condominio");
  if (admite !== "sim" && !portaDoCondominio) {
    motivos.push(`admite_particulares:${admite}`);
  }

  // `dotacao_esgotada` está fora da confiança global, de propósito.
  //
  // A pergunta é "a dotação já se esgotou?", e um aviso quase nunca o diz — a
  // resposta honesta é `baixa`, e é a resposta certa. Mas a confiança global é o
  // mínimo de todos os campos e bloqueia a publicação, por isso um campo que por
  // natureza não se consegue saber estava a vetar o catálogo inteiro: na execução
  // #36 saiu `baixa` em 15 de 17 extracções, e 54 dos 56 apoios ficaram por
  // publicar.
  //
  // Não é um afrouxamento do portão da elegibilidade. `CAMPOS_CRITICOS` continua a
  // exigir `alta` em estado, prazo de encerramento e admite_particulares para
  // *alertar*, e este campo nunca lá esteve. O que muda é só o direito a aparecer
  // no catálogo, com a fonte oficial ao lado, que é melhor do que não aparecer.
  const confiancas = [...v.confiancaEfectiva.entries()]
    .filter(([campo]) => !CAMPOS_FORA_DA_CONFIANCA_GLOBAL.has(campo))
    .map(([, confianca]) => confianca);
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
