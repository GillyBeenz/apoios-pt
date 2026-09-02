import { describe, expect, it } from "vitest";
import { corresponde } from "./correspondencia.ts";
import { diferenciar } from "./diferencas.ts";
import { apoioDe, apoioSoParaEntidades, perfilDe } from "./teste/construtores.ts";
import type { EventoApoio } from "./tipos.ts";

const VAZIO = new Set<string>();

function eventoAbertura(apoio = apoioDe()): EventoApoio {
  const eventos = diferenciar(null, apoio, "2026-03-01T08:00:00.000Z");
  return eventos[0]!;
}

describe("corresponde", () => {
  it("entrega um aviso nacional a quem subscreveu a medida", () => {
    const r = corresponde(eventoAbertura(), apoioDe(), perfilDe(), VAZIO);
    expect(r.corresponde).toBe(true);
  });

  it("cala-se quando nenhuma medida coincide", () => {
    const r = corresponde(eventoAbertura(), apoioDe(), perfilDe({ medidas: ["janelas"] }), VAZIO);
    expect(r.corresponde).toBe(false);
    if (r.corresponde) throw new Error("unreachable");
    expect(r.razao.regra).toBe("sem_medida_comum");
  });

  /**
   * The rule this whole product turns on. E-Lar is real and excludes individuals;
   * a homeowner who hears about it wastes an afternoon on a notice they can never
   * use, and stops trusting the next alert.
   */
  it("nunca entrega a um particular um aviso destinado só a entidades", () => {
    const elar = apoioSoParaEntidades();
    const r = corresponde(eventoAbertura(elar), elar, perfilDe(), VAZIO);
    expect(r.corresponde).toBe(false);
    if (r.corresponde) throw new Error("unreachable");
    expect(r.razao.regra).toBe("beneficiario_incompativel");
  });

  it("falha fechado quando a elegibilidade de particulares está por confirmar", () => {
    // `desconhecido` is treated exactly like `nao`: we would rather miss an alert
    // than send someone after money they may not be able to claim.
    const incerto = apoioDe({ admiteParticulares: "desconhecido" });
    const r = corresponde(eventoAbertura(incerto), incerto, perfilDe(), VAZIO);
    expect(r.corresponde).toBe(false);
    if (r.corresponde) throw new Error("unreachable");
    expect(r.razao.regra).toBe("nao_admite_particulares");
  });

  it("entrega ao condomínio um aviso que exclui particulares mas inclui condomínios", () => {
    const apoio = apoioDe({
      beneficiarios: ["condominio", "municipio"],
      admiteParticulares: "nao",
    });
    const r = corresponde(
      eventoAbertura(apoio),
      apoio,
      perfilDe({ tiposBeneficiario: ["particular", "condominio"] }),
      VAZIO,
    );
    expect(r.corresponde).toBe(true);
  });

  it("retém avisos por rever", () => {
    const porRever = apoioDe({ alertavel: false, needsReview: true, motivoRevisao: ["prova_falhou"] });
    const r = corresponde(eventoAbertura(porRever), porRever, perfilDe(), VAZIO);
    expect(r.corresponde).toBe(false);
    if (r.corresponde) throw new Error("unreachable");
    expect(r.razao.regra).toBe("nao_alertavel");
    expect(r.razao.detalhe).toContain("prova_falhou");
  });

  it("só envia avisos municipais a quem vive no concelho", () => {
    const municipal = apoioDe({ ambito: "municipio", municipios: ["1106"] });

    const deLisboa = corresponde(
      eventoAbertura(municipal),
      municipal,
      perfilDe({ concelho: "1106" }),
      VAZIO,
    );
    expect(deLisboa.corresponde).toBe(true);

    const doPorto = corresponde(
      eventoAbertura(municipal),
      municipal,
      perfilDe({ concelho: "1312" }),
      VAZIO,
    );
    expect(doPorto.corresponde).toBe(false);

    // A user who has not said where they live gets national programmes only,
    // rather than every municipal scheme in the country.
    const semConcelho = corresponde(eventoAbertura(municipal), municipal, perfilDe(), VAZIO);
    expect(semConcelho.corresponde).toBe(false);
  });

  it("respeita o registo de deduplicação", () => {
    const evento = eventoAbertura();
    const r = corresponde(evento, apoioDe(), perfilDe(), new Set([evento.impressao]));
    expect(r.corresponde).toBe(false);
    if (r.corresponde) throw new Error("unreachable");
    expect(r.razao.regra).toBe("ja_enviado");
  });

  it("respeita o cancelamento global", () => {
    const r = corresponde(
      eventoAbertura(),
      apoioDe(),
      perfilDe({ cancelouEm: "2026-02-01T00:00:00.000Z" }),
      VAZIO,
    );
    expect(r.corresponde).toBe(false);
    if (r.corresponde) throw new Error("unreachable");
    expect(r.razao.regra).toBe("utilizador_cancelou");
  });
});
