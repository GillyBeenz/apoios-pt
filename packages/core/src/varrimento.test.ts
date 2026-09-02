import { describe, expect, it } from "vitest";
import { varrerEventosTemporais } from "./varrimento.ts";
import { analisarDataPt } from "./normalizar/data.ts";
import { relogioFixo } from "./tipos.ts";
import { apoioDe } from "./teste/construtores.ts";

const FECHA = analisarDataPt("30/09/2026", { papel: "encerramento" });

describe("varrerEventosTemporais — fecha_em_breve", () => {
  it("dispara uma vez em cada limiar e nunca repete", () => {
    const apoio = apoioDe({ fechaEm: FECHA });
    const vistos = new Set<string>();

    // Sweep every day for a month, as the real daily job would.
    for (let dia = 30; dia >= 0; dia--) {
      const instante = new Date(new Date(FECHA.iso!).getTime() - dia * 86_400_000);
      for (const e of varrerEventosTemporais([apoio], relogioFixo(instante))) {
        if (e.tipo === "fecha_em_breve") vistos.add(e.impressao);
      }
    }

    // Exactly four distinct alerts across the whole run-up: 14, 7, 3 and 1 days.
    expect(vistos.size).toBe(4);
  });

  it("não conta regressiva contra um prazo conhecido só ao mês", () => {
    const apoio = apoioDe({
      fechaEm: analisarDataPt("setembro de 2026", { papel: "encerramento" }),
    });
    const eventos = varrerEventosTemporais([apoio], relogioFixo("2026-09-25T09:00:00Z"));
    expect(eventos.filter((e) => e.tipo === "fecha_em_breve")).toEqual([]);
  });

  it("cala-se quando a dotação já está esgotada", () => {
    // Counting down to a deadline nobody can still meet is worse than silence.
    const apoio = apoioDe({ fechaEm: FECHA, dotacaoEsgotada: true });
    const eventos = varrerEventosTemporais([apoio], relogioFixo("2026-09-27T09:00:00Z"));
    expect(eventos.filter((e) => e.tipo === "fecha_em_breve")).toEqual([]);
  });

  it("não conta regressiva para avisos por rever", () => {
    const apoio = apoioDe({ fechaEm: FECHA, alertavel: false, needsReview: true });
    const eventos = varrerEventosTemporais([apoio], relogioFixo("2026-09-27T09:00:00Z"));
    expect(eventos.filter((e) => e.tipo === "fecha_em_breve")).toEqual([]);
  });

  it("escolhe o limiar mais apertado já cruzado", () => {
    const apoio = apoioDe({ fechaEm: FECHA });
    const eventos = varrerEventosTemporais([apoio], relogioFixo("2026-09-29T09:00:00Z"));
    const breve = eventos.filter((e) => e.tipo === "fecha_em_breve");
    expect(breve).toHaveLength(1);
    expect(breve[0]!.payload.limiarDias).toBe(1);
  });
});

describe("varrerEventosTemporais — abertura prevista", () => {
  it("anuncia como previsão, não como facto", () => {
    // Portuguese programmes slip their announced opening dates routinely, so the
    // clock alone can never justify claiming a fund is actually open.
    const apoio = apoioDe({
      estado: "previsto",
      abreEm: analisarDataPt("01/03/2026", { papel: "abertura" }),
    });
    const eventos = varrerEventosTemporais([apoio], relogioFixo("2026-03-01T09:00:00Z"));
    const abriu = eventos.filter((e) => e.tipo === "abriu");
    expect(abriu).toHaveLength(1);
    expect(abriu[0]!.payload.confirmado).toBe(false);
  });
});

describe("varrerEventosTemporais — encerramento por relógio", () => {
  it("corrige o catálogo sem enviar email", () => {
    const apoio = apoioDe({ fechaEm: FECHA });
    const eventos = varrerEventosTemporais([apoio], relogioFixo("2026-10-05T09:00:00Z"));
    const encerrou = eventos.filter((e) => e.tipo === "encerrou");
    expect(encerrou).toHaveLength(1);
    // Nobody wants an email telling them they missed it.
    expect(encerrou[0]!.alertavel).toBe(false);
  });

  it("ignora avisos não publicados", () => {
    const apoio = apoioDe({ fechaEm: FECHA, publicado: false });
    expect(varrerEventosTemporais([apoio], relogioFixo("2026-09-27T09:00:00Z"))).toEqual([]);
  });
});
