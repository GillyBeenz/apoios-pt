import { describe, expect, it } from "vitest";

import { avaliarSaude, type MetricasFonte } from "./saude.ts";

const SEM_HISTORICO = {
  candidatosRecentes: [] as number[],
  falhasConsecutivas: 0,
  horasDesdeMudancaConteudo: null,
};

function metricas(parcial: Partial<MetricasFonte> = {}): MetricasFonte {
  return {
    sourceId: "fonte-x",
    httpStatus: 200,
    bytes: 1000,
    duracaoMs: 100,
    candidatos: 10,
    candidatosComData: 10,
    extraccoesOk: 0,
    extraccoesRevisao: 0,
    extraccoesFalhadas: 0,
    errosExtraccao: [],
    provasFalhadas: 0,
    tokensCacheLidos: 5000,
    chamadasModelo: 0,
    erro: null,
    ...parcial,
  };
}

const regras = (m: MetricasFonte): string[] =>
  avaliarSaude(m, SEM_HISTORICO, 1, 24).map((a) => a.regra);

const alarme = (m: MetricasFonte, regra: string) =>
  avaliarSaude(m, SEM_HISTORICO, 1, 24).find((a) => a.regra === regra);

/**
 * The run this file exists for.
 *
 * Execução #19 called the model 34 times, every call came back with nothing
 * usable, no fund was written, and the job exited 0. The only signal was
 * `muitas_revisoes` — a warning that reads as "these notices were hard to parse"
 * when the truth was "not one request succeeded". Money spent, nothing produced,
 * green tick.
 */
describe("chamadas ao modelo que não produzem nada", () => {
  it("é crítico quando falham todas — o trabalho não é ambíguo, é inexistente", () => {
    const a = alarme(
      metricas({ chamadasModelo: 34, extraccoesFalhadas: 34 }),
      "extraccoes_falhadas",
    );
    expect(a?.gravidade).toBe("critico");
  });

  it("é aviso quando falham algumas — aí o conteúdo ainda pode ser a causa", () => {
    const a = alarme(
      metricas({ chamadasModelo: 10, extraccoesFalhadas: 3, extraccoesOk: 7 }),
      "extraccoes_falhadas",
    );
    expect(a?.gravidade).toBe("aviso");
  });

  it("diz porque falharam, em vez de só quantas", () => {
    const a = alarme(
      metricas({
        chamadasModelo: 2,
        extraccoesFalhadas: 2,
        errosExtraccao: ["resposta sem output estruturado"],
      }),
      "extraccoes_falhadas",
    );
    expect(a?.mensagem).toContain("resposta sem output estruturado");
    expect(a?.mensagem).toContain("2/2");
  });

  it("não confunde uma chamada falhada com uma extracção por rever", () => {
    // This is the regression. A failure counted as a review inflates the review
    // ratio, trips `muitas_revisoes`, and hides itself behind a warning that
    // blames the source's formatting.
    const so_falhas = metricas({ chamadasModelo: 5, extraccoesFalhadas: 5 });
    expect(regras(so_falhas)).toContain("extraccoes_falhadas");
    expect(regras(so_falhas)).not.toContain("muitas_revisoes");

    // And a genuine review rate still trips its own rule, unchanged.
    const so_revisoes = metricas({
      chamadasModelo: 5,
      extraccoesOk: 1,
      extraccoesRevisao: 4,
    });
    expect(regras(so_revisoes)).toContain("muitas_revisoes");
    expect(regras(so_revisoes)).not.toContain("extraccoes_falhadas");
  });

  it("cala-se quando todas as chamadas correm bem", () => {
    const m = metricas({ chamadasModelo: 5, extraccoesOk: 5 });
    expect(regras(m)).not.toContain("extraccoes_falhadas");
  });
});
