import { describe, expect, it } from "vitest";
import { decidir, verificarProvas } from "@apoios/extraction";
import { extraccaoSolar, TEXTO_AVISO_SOLAR } from "@apoios/extraction/teste";
import { mudou, redecidir, type ExtraccaoArmazenada } from "./redecidir.ts";

/** Turn a live extraction into the columns `fund_extractions` would hold. */
function comoGuardado(
  e = extraccaoSolar(),
  stopReason: string | null = "end_turn",
): ExtraccaoArmazenada {
  const v = verificarProvas(e, TEXTO_AVISO_SOLAR);
  return {
    fundId: "fund-1",
    bruto: e,
    confiancaCampos: Object.fromEntries(v.confiancaEfectiva),
    evidenciaFalhou: v.provaFalhou,
    stopReason,
  };
}

describe("redecidir", () => {
  /**
   * The test this module exists for.
   *
   * The verification result is rebuilt from two stored columns instead of being
   * recomputed against the document. If that reconstruction is lossy in any way
   * `decidir` can see, the re-decision pass would quietly hand the live catalogue
   * a different answer from the one the pipeline gives — and it writes across
   * every fund at once. So: same extraction, both paths, identical decision.
   */
  it("decide exactamente o mesmo que o caminho ao vivo", () => {
    const e = extraccaoSolar();
    const aoVivo = decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn");

    const r = redecidir(comoGuardado(e));
    expect(r.estado).toBe("decidido");
    if (r.estado !== "decidido") throw new Error("unreachable");
    expect(r.decisao).toEqual(aoVivo);
  });

  it("passa a publicar o que só o dotacao_esgotada travava", () => {
    const e = extraccaoSolar();
    const semSaberDaDotacao = {
      ...e,
      dotacao_esgotada: { ...e.dotacao_esgotada, confianca: "baixa" as const },
    };
    const r = redecidir(comoGuardado(semSaberDaDotacao));
    if (r.estado !== "decidido") throw new Error("unreachable");
    expect(r.decisao.publicado).toBe(true);
  });

  it("continua a não publicar quando é outro campo que está em baixa", () => {
    const e = extraccaoSolar();
    const semSaberDaAbertura = {
      ...e,
      prazos: {
        ...e.prazos,
        abertura: { ...e.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const r = redecidir(comoGuardado(semSaberDaAbertura));
    if (r.estado !== "decidido") throw new Error("unreachable");
    expect(r.decisao.publicado).toBe(false);
  });

  /**
   * A row the current schema cannot read keeps the decision it has. Coercing a
   * stale shape into the current one and publishing the result would be worse
   * than leaving it alone, because nobody would know it happened.
   */
  it("deixa em paz uma extracção que já não valida", () => {
    const r = redecidir({
      fundId: "fund-antigo",
      bruto: { schema_version: "1", isto: "já não é o esquema de hoje" },
      confiancaCampos: {},
      evidenciaFalhou: [],
      stopReason: "end_turn",
    });
    expect(r.estado).toBe("ilegivel");
  });

  /** A confidence we do not recognise is dropped, and the gate reads that as `baixa`. */
  it("falha fechado perante uma confiança que não reconhece", () => {
    const guardado = comoGuardado();
    const corrompido: ExtraccaoArmazenada = {
      ...guardado,
      confiancaCampos: {
        ...guardado.confiancaCampos,
        "beneficiarios.admite_particulares": "muito alta",
      },
    };
    const r = redecidir(corrompido);
    if (r.estado !== "decidido") throw new Error("unreachable");
    expect(r.decisao.alertavel).toBe(false);
  });

  it("respeita uma recusa guardada", () => {
    const r = redecidir(comoGuardado(extraccaoSolar(), "refusal"));
    if (r.estado !== "decidido") throw new Error("unreachable");
    expect(r.decisao.alertavel).toBe(false);
    expect(r.decisao.motivoRevisao).toContain("recusa_do_modelo");
  });
});

describe("mudou", () => {
  const base = {
    publicado: true,
    alertavel: true,
    needsReview: false,
    motivoRevisao: [],
    confiancaGlobal: "alta" as const,
  };

  it("não mexe numa linha cuja visibilidade é a mesma", () => {
    expect(mudou({ publicado: true, alertavel: true }, base)).toBe(false);
  });

  it("apanha uma mudança em qualquer das duas permissões", () => {
    expect(mudou({ publicado: false, alertavel: true }, base)).toBe(true);
    expect(mudou({ publicado: true, alertavel: false }, base)).toBe(true);
  });
});
