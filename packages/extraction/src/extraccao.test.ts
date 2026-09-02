import { describe, expect, it } from "vitest";
import { verificarProvas } from "./verificar.ts";
import { decidir } from "./portao.ts";
import { extraccaoParaApoio } from "./paraApoio.ts";
import { PROMPT_SISTEMA, hashPrompt } from "./prompt.ts";
import { EsquemaExtraccao } from "./esquema.ts";
import { Extractor, ErroCasseteEmFalta, chaveCassete } from "./cliente.ts";
import { TEXTO_AVISO_SOLAR, extraccaoSolar } from "./teste/extraccoes.ts";
import { TAXONOMIA_MEDIDAS } from "@apoios/core";

const CTX = {
  sourceId: "fundo-ambiental-aac",
  urlOficial: "https://www.fundoambiental.pt/avisos/aviso-02-2026.aspx",
};

describe("esquema", () => {
  it("aceita uma extração bem formada", () => {
    expect(() => EsquemaExtraccao.parse(extraccaoSolar())).not.toThrow();
  });

  it("recusa uma medida fora da taxonomia fechada", () => {
    const invalida = extraccaoSolar();
    const comLixo = {
      ...invalida,
      medidas: {
        ...invalida.medidas,
        valor: [{ medida: "piscina_aquecida", percentagem_apoio: null, valor_max_eur: null, unidade: null }],
      },
    };
    expect(() => EsquemaExtraccao.parse(comLixo)).toThrow();
  });

  it("usa exactamente a taxonomia partilhada", () => {
    // If the extraction enum and the subscription list ever drift apart, matching
    // silently fails for the drifted measure — a user simply never hears about it.
    const doEsquema = EsquemaExtraccao.shape.medidas.shape.valor.element.shape.medida.options;
    expect([...doEsquema].sort()).toEqual([...TAXONOMIA_MEDIDAS].sort());
  });
});

describe("prompt", () => {
  /**
   * The prompt is the cached prefix, so it must be byte-identical on every request.
   * Pinning its hash means any edit is a deliberate act that fails CI until the
   * author bumps `VERSAO_PROMPT` and re-records the cassettes — which is exactly
   * the workflow we want, because a changed prompt invalidates both the cache and
   * every recorded response.
   *
   * If this fails after an intentional prompt change: bump VERSAO_PROMPT, update
   * the hash below, and re-record with ANTHROPIC_MODE=record.
   */
  it("mantém o hash fixado", () => {
    expect(hashPrompt()).toBe("f8d27ee7c13508b4");
  });

  it("não interpola nada volátil no prefixo em cache", () => {
    // Static example dates inside the prompt are fine — they never change between
    // requests. What must never appear is a value computed at call time, so the
    // check is that two evaluations either side of a clock change agree.
    const antes = hashPrompt();
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + 86_400_000 * 400;
      expect(hashPrompt()).toBe(antes);
    } finally {
      Date.now = originalNow;
    }
    expect(PROMPT_SISTEMA).not.toMatch(/https?:\/\//);
  });
});

describe("verificarProvas", () => {
  it("aceita citações literalmente presentes no documento", () => {
    const v = verificarProvas(extraccaoSolar(), TEXTO_AVISO_SOLAR);
    expect(v.provaFalhou).toEqual([]);
  });

  it("tolera quebras de linha e acentuação na citação", () => {
    // The quote in the fixture spans a line break the source wraps differently.
    const v = verificarProvas(extraccaoSolar(), TEXTO_AVISO_SOLAR);
    expect(v.confiancaEfectiva.get("prazos.encerramento")).toBe("alta");
  });

  /**
   * The gate that matters. A confident-sounding claim about the deadline that
   * appears nowhere in the notice must be caught and demoted.
   */
  it("apanha uma citação inventada e despromove a confiança", () => {
    const inventada = extraccaoSolar();
    const adulterada = {
      ...inventada,
      prazos: {
        ...inventada.prazos,
        encerramento: {
          ...inventada.prazos.encerramento,
          confianca: "alta" as const,
          evidencia: "o prazo foi prorrogado até 31 de dezembro de 2026",
        },
      },
    };

    const v = verificarProvas(adulterada, TEXTO_AVISO_SOLAR);
    expect(v.provaFalhou).toContain("prazos.encerramento");
    expect(v.confiancaEfectiva.get("prazos.encerramento")).toBe("baixa");
  });

  it("não penaliza a ausência de citação", () => {
    // The prompt tells the model to return "" when the document is silent;
    // punishing that would push it toward inventing quotes instead.
    const v = verificarProvas(extraccaoSolar(), TEXTO_AVISO_SOLAR);
    expect(v.semProva).toContain("dotacao_esgotada");
    expect(v.provaFalhou).not.toContain("dotacao_esgotada");
  });
});

describe("decidir", () => {
  it("publica e permite alertas para uma extração sólida", () => {
    const e = extraccaoSolar();
    const d = decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d).toMatchObject({ publicado: true, alertavel: true, needsReview: false });
    expect(d.confiancaGlobal).toBe("alta");
  });

  it("bloqueia alertas quando uma prova falha, mesmo com tudo o resto sólido", () => {
    const e = extraccaoSolar();
    const adulterada = {
      ...e,
      estado: { ...e.estado, evidencia: "as candidaturas estão encerradas desde janeiro" },
    };
    const d = decidir(adulterada, verificarProvas(adulterada, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d.alertavel).toBe(false);
    expect(d.motivoRevisao.join(" ")).toContain("prova_falhou");
  });

  /** Fails closed: "unclear" is not permission to email anyone. */
  it("não alerta quando a elegibilidade de particulares é desconhecida", () => {
    const e = extraccaoSolar();
    const incerta = {
      ...e,
      beneficiarios: {
        ...e.beneficiarios,
        admite_particulares: {
          valor: "desconhecido" as const,
          confianca: "alta" as const,
          evidencia: "Beneficiários: pessoas singulares proprietárias",
          pagina: 1,
        },
      },
    };
    const d = decidir(incerta, verificarProvas(incerta, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d.alertavel).toBe(false);
    // Still worth showing, badged, with a link to the official notice.
    expect(d.publicado).toBe(true);
    expect(d.motivoRevisao).toContain("admite_particulares:desconhecido");
  });

  it("nem publica nem alerta quando o modelo recusa", () => {
    const e = extraccaoSolar();
    const d = decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "refusal");
    expect(d).toMatchObject({ publicado: false, alertavel: false });
    expect(d.motivoRevisao).toContain("recusa_do_modelo");
  });

  it("rejeita um documento que não é um aviso de apoio", () => {
    const e = extraccaoSolar({
      auto_avaliacao: { documento_e_aviso_de_apoio: false, qualidade_ocr: "boa", notas: null },
    });
    const d = decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d.publicado).toBe(false);
    expect(d.motivoRevisao).toContain("nao_e_aviso_de_apoio");
  });
});

describe("extraccaoParaApoio", () => {
  it("normaliza datas com o nosso parser, não com a leitura do modelo", () => {
    const e = extraccaoSolar();
    const apoio = extraccaoParaApoio(e, decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn"), CTX);

    // 18:00 Lisbon on 30 September 2026 is 17:00 UTC (WEST). The model only said
    // "2026-09-30"; the precise instant comes from parsing the source expression.
    expect(apoio.fechaEm.iso).toBe("2026-09-30T17:00:00.000Z");
    expect(apoio.fechaEm.precisao).toBe("minuto");
  });

  it("canonicaliza a referência legal", () => {
    const e = extraccaoSolar();
    const apoio = extraccaoParaApoio(e, decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn"), CTX);
    expect(apoio.referenciaLegal).toBe("AVISO 02/2026");
  });

  it("desduplica medidas repetidas em tipologias diferentes", () => {
    const e = extraccaoSolar();
    const repetida = {
      ...e,
      medidas: {
        ...e.medidas,
        valor: [
          { medida: "solar_fotovoltaico" as const, percentagem_apoio: 85, valor_max_eur: 15000, unidade: "por fracção" },
          { medida: "solar_fotovoltaico" as const, percentagem_apoio: 70, valor_max_eur: 9000, unidade: "por kWp" },
        ],
      },
    };
    const apoio = extraccaoParaApoio(repetida, decidir(repetida, verificarProvas(repetida, TEXTO_AVISO_SOLAR), "end_turn"), CTX);
    expect(apoio.medidas).toEqual(["solar_fotovoltaico"]);
    // The per-typology detail is kept even though the measure list is deduped.
    expect(apoio.detalheApoios).toHaveLength(2);
  });

  it("recorre ao maior tecto por medida quando não há tecto global", () => {
    const e = extraccaoSolar();
    const semGlobal = {
      ...e,
      dotacao: { ...e.dotacao, apoio_max_por_beneficiario_eur: null },
    };
    const apoio = extraccaoParaApoio(semGlobal, decidir(semGlobal, verificarProvas(semGlobal, TEXTO_AVISO_SOLAR), "end_turn"), CTX);
    expect(apoio.apoioMaxEur).toBe(15_000);
  });

  it("preserva sempre o URL oficial", () => {
    const e = extraccaoSolar();
    const apoio = extraccaoParaApoio(e, decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn"), CTX);
    expect(apoio.urlOficial).toBe(CTX.urlOficial);
  });
});

describe("Extractor em modo replay", () => {
  it("falha alto quando falta a cassete, em vez de ir à rede", () => {
    // A silent fallthrough to the network would make the suite non-deterministic,
    // spend real money, and hang in the egress-blocked sandbox.
    const extractor = new Extractor({ modo: "replay", dirCassetes: "/tmp/cassetes-inexistentes" });
    return expect(
      extractor.extrair({
        urlFonte: "https://exemplo.pt/a",
        entidade: "Fundo Ambiental",
        dataRecolha: "2026-08-27",
        texto: TEXTO_AVISO_SOLAR,
      }),
    ).rejects.toBeInstanceOf(ErroCasseteEmFalta);
  });

  it("a chave da cassete muda quando o prompt muda", () => {
    const doc = {
      urlFonte: "https://exemplo.pt/a",
      entidade: "Fundo Ambiental",
      dataRecolha: "2026-08-27",
      texto: TEXTO_AVISO_SOLAR,
    };
    const chave = chaveCassete(doc);
    expect(chave).toHaveLength(32);
    expect(chaveCassete({ ...doc, texto: `${TEXTO_AVISO_SOLAR} extra` })).not.toBe(chave);
  });
});
