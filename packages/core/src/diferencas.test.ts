import { describe, expect, it } from "vitest";
import { diferenciar, impressaoEvento, jsonCanonico } from "./diferencas.ts";
import { analisarDataPt } from "./normalizar/data.ts";
import { apoioDe } from "./teste/construtores.ts";

const QUANDO = "2026-03-01T08:00:00.000Z";

describe("jsonCanonico", () => {
  it("ordena as chaves para o mesmo objeto produzir sempre o mesmo texto", () => {
    expect(jsonCanonico({ b: 1, a: 2 })).toBe(jsonCanonico({ a: 2, b: 1 }));
  });
});

describe("impressaoEvento", () => {
  it("não depende do instante em que corre", () => {
    // The property that makes replaying the whole pipeline emit zero duplicates.
    const a = impressaoEvento("fund-1", "abriu", { de: "previsto" });
    const b = impressaoEvento("fund-1", "abriu", { de: "previsto" });
    expect(a).toBe(b);
  });

  it("distingue limiares diferentes do mesmo tipo de evento", () => {
    expect(impressaoEvento("fund-1", "fecha_em_breve", { limiarDias: 7 })).not.toBe(
      impressaoEvento("fund-1", "fecha_em_breve", { limiarDias: 3 }),
    );
  });
});

describe("diferenciar", () => {
  it("anuncia um aviso visto pela primeira vez", () => {
    const eventos = diferenciar(null, apoioDe(), QUANDO);
    expect(eventos.map((e) => e.tipo)).toEqual(["programa_novo"]);
  });

  it("não anuncia um aviso que nasce já encerrado", () => {
    const eventos = diferenciar(null, apoioDe({ estado: "encerrado" }), QUANDO);
    expect(eventos).toEqual([]);
  });

  it("ignora alterações cosméticas", () => {
    // The test that proves diffing normalised records beats diffing page text:
    // a reworded summary and a new contact detail must produce total silence.
    const antes = apoioDe();
    const depois = apoioDe({
      resumo: "Apoio à instalação de sistemas solares para autoconsumo. Contacto: 210 000 000.",
      entidadeGestora: "Fundo Ambiental (FA)",
    });
    expect(diferenciar(antes, depois, QUANDO)).toEqual([]);
  });

  it("distingue reabrir de abrir pela primeira vez", () => {
    const reaberto = diferenciar(
      apoioDe({ estado: "encerrado" }),
      apoioDe({ estado: "aberto" }),
      QUANDO,
    );
    expect(reaberto.map((e) => e.tipo)).toEqual(["reaberto"]);

    const abriu = diferenciar(
      apoioDe({ estado: "previsto" }),
      apoioDe({ estado: "aberto" }),
      QUANDO,
    );
    expect(abriu.map((e) => e.tipo)).toEqual(["abriu"]);
  });

  it("assinala um prazo prolongado", () => {
    const eventos = diferenciar(
      apoioDe(),
      apoioDe({ fechaEm: analisarDataPt("31/10/2026", { papel: "encerramento" }) }),
      QUANDO,
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.tipo).toBe("prazo_alterado");
    expect(eventos[0]!.payload.prolongado).toBe(true);
  });

  it("não assinala mudanças entre prazos vagos", () => {
    // Moving from one imprecise month to another is not actionable.
    const antes = apoioDe({ fechaEm: analisarDataPt("setembro de 2026", { papel: "encerramento" }) });
    const depois = apoioDe({ fechaEm: analisarDataPt("outubro de 2026", { papel: "encerramento" }) });
    expect(diferenciar(antes, depois, QUANDO).map((e) => e.tipo)).toEqual([]);
  });

  it("trata a dotação esgotada como um evento próprio e urgente", () => {
    const eventos = diferenciar(apoioDe(), apoioDe({ dotacaoEsgotada: true }), QUANDO);
    expect(eventos.map((e) => e.tipo)).toEqual(["dotacao_esgotada"]);
    expect(eventos[0]!.alertavel).toBe(true);
  });

  it("assinala o reforço de dotação mas não a sua redução", () => {
    const reforco = diferenciar(apoioDe(), apoioDe({ dotacaoTotalEur: 20_000_000 }), QUANDO);
    expect(reforco.map((e) => e.tipo)).toEqual(["reforco_dotacao"]);

    const corte = diferenciar(apoioDe(), apoioDe({ dotacaoTotalEur: 10_000_000 }), QUANDO);
    expect(corte.map((e) => e.tipo)).toEqual([]);
  });

  it("alerta quando um aviso passa a admitir particulares", () => {
    const eventos = diferenciar(
      apoioDe({ admiteParticulares: "nao", beneficiarios: ["municipio"] }),
      apoioDe({ admiteParticulares: "sim", beneficiarios: ["municipio", "particular"] }),
      QUANDO,
    );
    expect(eventos.map((e) => e.tipo)).toEqual(["elegibilidade_alterada"]);
    expect(eventos[0]!.payload.abriuAParticulares).toBe(true);
    expect(eventos[0]!.alertavel).toBe(true);
  });

  it("regista, mas não alerta, quando um aviso deixa de admitir particulares", () => {
    const eventos = diferenciar(
      apoioDe({ admiteParticulares: "sim" }),
      apoioDe({ admiteParticulares: "nao", beneficiarios: ["municipio"] }),
      QUANDO,
    );
    expect(eventos.map((e) => e.tipo)).toEqual(["elegibilidade_alterada"]);
    expect(eventos[0]!.alertavel).toBe(false);
  });

  it("é idempotente: repetir a comparação não produz eventos novos", () => {
    const antes = apoioDe();
    const depois = apoioDe({ estado: "encerrado" });
    const primeira = diferenciar(antes, depois, QUANDO);
    const segunda = diferenciar(antes, depois, "2026-06-01T08:00:00.000Z");
    expect(segunda.map((e) => e.impressao)).toEqual(primeira.map((e) => e.impressao));
  });
});
