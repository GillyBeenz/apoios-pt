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
        valor: [
          {
            medida: "piscina_aquecida",
            percentagem_apoio: null,
            valor_max_eur: null,
            unidade: null,
          },
        ],
      },
    };
    expect(() => EsquemaExtraccao.parse(comLixo)).toThrow();
  });

  it("usa exactamente a taxonomia partilhada", () => {
    // If the extraction enum and the subscription list ever drift apart, matching
    // silently fails for the drifted measure — a user simply never hears about it.
    const doEsquema =
      EsquemaExtraccao.shape.medidas.shape.valor.element.shape.medida.options;
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
    expect(hashPrompt()).toBe("f3d371479cff8200");
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
    expect(d).toMatchObject({
      publicado: true,
      alertavel: true,
      needsReview: false,
    });
    expect(d.confiancaGlobal).toBe("alta");
  });

  /**
   * A execução #36 publicou 2 de 56 apoios. Todos os outros 54 foram travados por
   * `confianca_global = baixa`, e em 15 das 17 extracções o campo que a puxou para
   * baixo foi o `dotacao_esgotada` — uma pergunta que os avisos não respondem.
   */
  it("publica mesmo sem saber se a dotação se esgotou", () => {
    const e = extraccaoSolar();
    const semSaberDaDotacao = {
      ...e,
      dotacao_esgotada: { ...e.dotacao_esgotada, confianca: "baixa" as const },
    };
    const d = decidir(
      semSaberDaDotacao,
      verificarProvas(semSaberDaDotacao, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.confiancaGlobal).toBe("alta");
    expect(d.publicado).toBe(true);
  });

  /**
   * O par do teste acima, e o mais importante dos dois: a excepção é de um campo
   * só. Se isto passar a verde, a excepção deixou de ser uma excepção e o portão
   * deixou de falhar fechado.
   */
  it("continua a não publicar quando é outro campo que está em baixa", () => {
    const e = extraccaoSolar();
    const semSaberDaAbertura = {
      ...e,
      prazos: {
        ...e.prazos,
        abertura: { ...e.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      semSaberDaAbertura,
      verificarProvas(semSaberDaAbertura, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.confiancaGlobal).toBe("baixa");
    expect(d.publicado).toBe(false);
  });

  /**
   * Encontrado em produção: `fecha_em = 2026-09-23` numa linha marcada
   * `encerrado`, a 14 de setembro de 2026. Um apoio dado por fechado sai do
   * catálogo, e ali faltavam nove dias para o prazo — havia uma candidatura por
   * fazer que ninguém veria.
   */
  it("assinala um encerrado cujo prazo ainda não chegou", () => {
    const e = extraccaoSolar();
    const d = decidir(
      e,
      verificarProvas(e, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2020-01-01",
    );
    // A fixture fecha em 2026; visto de 2020 ainda não fechou.
    expect(
      d.motivoRevisao.some((m) => m.startsWith("estado_incoerente:")),
    ).toBe(e.estado.valor === "encerrado");
  });

  it("não assinala nada quando não lhe dão uma data de referência", () => {
    const e = { ...extraccaoSolar(), estado: { ...extraccaoSolar().estado, valor: "encerrado" as const } };
    const d = decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d.motivoRevisao.some((m) => m.startsWith("estado_incoerente:"))).toBe(false);
  });

  it("apanha a incoerência quando o estado é mesmo encerrado", () => {
    const base = extraccaoSolar();
    const encerradoCedo = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const },
    };
    const d = decidir(
      encerradoCedo,
      verificarProvas(encerradoCedo, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2020-01-01",
    );
    expect(
      d.motivoRevisao.some((m) => m.startsWith("estado_incoerente:")),
    ).toBe(true);
    expect(d.alertavel).toBe(false);
  });

  /**
   * A regra do histórico: 29 apoios encerrados estavam invisíveis por confiança
   * `baixa` em campos que já não podem magoar ninguém — a data de abertura (16) e
   * as medidas (13). Num aviso fechado não há candidatura a fazer, e esconder a
   * linha só apaga a resposta a "isto já existiu?".
   */
  it("publica um encerrado de prazo vencido apesar de a abertura estar em baixa", () => {
    const base = extraccaoSolar();
    const historico = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const },
      prazos: {
        ...base.prazos,
        abertura: { ...base.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      historico,
      verificarProvas(historico, TEXTO_AVISO_SOLAR),
      "end_turn",
      // A fixture fecha em 2026-09-30; visto de 2027 já fechou mesmo.
      "2027-01-01",
    );
    expect(d.confiancaGlobal).toBe("baixa");
    expect(d.publicado).toBe(true);
    // Publicar não é confiar. Aparecer no catálogo com a fonte oficial ao lado é
    // uma coisa; entrar no email de alguém é outra, e a confiança global em
    // `baixa` fecha essa porta mesmo sem nenhum motivo de revisão.
    expect(d.alertavel).toBe(false);
  });

  /**
   * A invariante que o próprio ficheiro afirma — `alertavel` é estritamente mais
   * forte do que `publicado` — e que não era verdade. `motivos` cobre os campos
   * críticos, a recusa, o OCR e a prova, mas nunca olhou para a confiança global,
   * por isso um apoio retido por um campo não-crítico ficava invisível no
   * catálogo e continuava com direito a email.
   *
   * Estava em produção: `C13-i01; 02; 03 — Comunidades de Energia Renovável`,
   * `publicado = false`, `alertavel = true`, zero motivos de revisão.
   */
  it("nunca deixa alertar o que não publica", () => {
    const base = extraccaoSolar();
    const naoCritico = {
      ...base,
      prazos: {
        ...base.prazos,
        abertura: { ...base.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      naoCritico,
      verificarProvas(naoCritico, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.motivoRevisao).toEqual([]);
    expect(d.confiancaGlobal).toBe("baixa");
    expect(d.publicado).toBe(false);
    expect(d.alertavel).toBe(false);
  });

  /**
   * Quem testemunha o fecho é a data, não a palavra. Nove apoios em produção
   * tinham prazo `alta` já vencido e `estado` em `media`, e ficavam de fora se a
   * regra exigisse `alta` nos dois — sem que isso tornasse nenhum deles mais
   * verdadeiro.
   */
  it("aceita estado em média quando a data de fecho é firme e já passou", () => {
    const base = extraccaoSolar();
    const palavraIncerta = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const, confianca: "media" as const },
      prazos: {
        ...base.prazos,
        abertura: { ...base.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      palavraIncerta,
      verificarProvas(palavraIncerta, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2027-01-01",
    );
    expect(d.publicado).toBe(true);
    expect(d.alertavel).toBe(false);
  });

  /** Mas `baixa` no estado não: aí não há leitura nenhuma em que assentar a etiqueta. */
  it("recusa o histórico quando nem o estado se consegue ler", () => {
    const base = extraccaoSolar();
    const semLeitura = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const, confianca: "baixa" as const },
    };
    const d = decidir(
      semLeitura,
      verificarProvas(semLeitura, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2027-01-01",
    );
    expect(d.publicado).toBe(false);
  });

  /**
   * O contrapeso, e o teste que interessa: a condição é a data de fecho. Sem ela
   * com confiança `alta`, um encerrado não tem por onde provar que fechou, e a
   * excepção não se aplica.
   */
  it("não publica um encerrado cuja própria data de fecho está em baixa", () => {
    const base = extraccaoSolar();
    const semDataFiavel = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const },
      prazos: {
        ...base.prazos,
        encerramento: { ...base.prazos.encerramento, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      semDataFiavel,
      verificarProvas(semDataFiavel, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2027-01-01",
    );
    expect(d.publicado).toBe(false);
  });

  /**
   * Um prazo que ainda não chegou não prova que fechou — prova que há uma
   * incoerência. A excepção do histórico não pode ser a porta por onde essa
   * incoerência entra no catálogo.
   */
  it("não publica como histórico um encerrado cujo prazo ainda não passou", () => {
    const base = extraccaoSolar();
    const incoerente = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const },
      prazos: {
        ...base.prazos,
        abertura: { ...base.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      incoerente,
      verificarProvas(incoerente, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2020-01-01",
    );
    expect(d.publicado).toBe(false);
    expect(
      d.motivoRevisao.some((m) => m.startsWith("estado_incoerente:")),
    ).toBe(true);
  });

  /**
   * Sem data de referência não há como verificar que o prazo passou. A
   * alternativa seria acreditar no campo `estado` sozinho, que é exactamente o
   * que a condição existe para não fazer.
   */
  it("sem data de referência, o histórico não se aplica", () => {
    const base = extraccaoSolar();
    const historico = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const },
      prazos: {
        ...base.prazos,
        abertura: { ...base.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(historico, verificarProvas(historico, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d.publicado).toBe(false);
  });

  /** Um aberto em baixa continua fora. A excepção é dos encerrados, e só. */
  it("não estende o histórico a um aviso aberto", () => {
    const base = extraccaoSolar();
    const aberto = {
      ...base,
      estado: { ...base.estado, valor: "aberto" as const },
      prazos: {
        ...base.prazos,
        abertura: { ...base.prazos.abertura, confianca: "baixa" as const },
      },
    };
    const d = decidir(
      aberto,
      verificarProvas(aberto, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2027-01-01",
    );
    expect(d.publicado).toBe(false);
  });

  /** Um encerrado cujo prazo já passou é coerente, e não deve ser assinalado. */
  it("deixa em paz um encerrado cujo prazo já passou", () => {
    const base = extraccaoSolar();
    const encerrado = {
      ...base,
      estado: { ...base.estado, valor: "encerrado" as const },
    };
    const d = decidir(
      encerrado,
      verificarProvas(encerrado, TEXTO_AVISO_SOLAR),
      "end_turn",
      "2099-01-01",
    );
    expect(
      d.motivoRevisao.some((m) => m.startsWith("estado_incoerente:")),
    ).toBe(false);
  });

  it("bloqueia alertas quando uma prova falha, mesmo com tudo o resto sólido", () => {
    const e = extraccaoSolar();
    const adulterada = {
      ...e,
      estado: {
        ...e.estado,
        evidencia: "as candidaturas estão encerradas desde janeiro",
      },
    };
    const d = decidir(
      adulterada,
      verificarProvas(adulterada, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.alertavel).toBe(false);
    expect(d.motivoRevisao.join(" ")).toContain("prova_falhou");
  });

  /**
   * The condomínio door.
   *
   * `04/C13-i01 — Programa de Apoio a Condomínios Residenciais` is a real Fundo
   * Ambiental programme: closed to pessoas singulares, open to the building. This
   * gate used to call that not-alertable, so it could never reach an inbox — even
   * the inbox of someone who had explicitly asked for condomínio alerts.
   *
   * Both sides stay explicit. The notice must NAME condomínios, and `corresponde()`
   * still requires the person to have asked. `desconhecido` opens neither door.
   */
  it("alerta um aviso fechado a singulares mas aberto a condomínios", () => {
    const e = extraccaoSolar();
    const paraCondominios = {
      ...e,
      beneficiarios: {
        ...e.beneficiarios,
        tipos: { ...e.beneficiarios.tipos, valor: ["condominio" as const] },
        admite_particulares: {
          ...e.beneficiarios.admite_particulares,
          valor: "nao" as const,
        },
      },
    };
    const d = decidir(
      paraCondominios,
      verificarProvas(paraCondominios, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.alertavel).toBe(true);
    expect(d.motivoRevisao).toEqual([]);
  });

  it("continua a não alertar quando não admite nem singulares nem condomínios", () => {
    // Nem singulares nem condomínios: para um proprietário não há porta nenhuma,
    // por via nenhuma.
    const e = extraccaoSolar();
    const soEntidades = {
      ...e,
      beneficiarios: {
        ...e.beneficiarios,
        tipos: {
          ...e.beneficiarios.tipos,
          valor: ["municipio" as const, "ipss" as const],
        },
        admite_particulares: {
          ...e.beneficiarios.admite_particulares,
          valor: "nao" as const,
        },
      },
    };
    const d = decidir(
      soEntidades,
      verificarProvas(soEntidades, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.alertavel).toBe(false);
    expect(d.motivoRevisao.join(" ")).toContain("admite_particulares:nao");
  });

  it("não abre a porta do condomínio com elegibilidade desconhecida", () => {
    // A porta exige uma afirmação positiva nos dois lados. `desconhecido` no
    // `admite_particulares` com `condominio` nos tipos continua a ser incerteza,
    // e incerteza nunca é permissão para enviar email.
    const e = extraccaoSolar();
    const incerta = {
      ...e,
      beneficiarios: {
        ...e.beneficiarios,
        tipos: { ...e.beneficiarios.tipos, valor: ["condominio" as const] },
        admite_particulares: {
          ...e.beneficiarios.admite_particulares,
          valor: "desconhecido" as const,
        },
      },
    };
    const d = decidir(
      incerta,
      verificarProvas(incerta, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
    expect(d.alertavel).toBe(false);
    expect(d.motivoRevisao.join(" ")).toContain("admite_particulares:desconhecido");
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
        },
      },
    };
    const d = decidir(
      incerta,
      verificarProvas(incerta, TEXTO_AVISO_SOLAR),
      "end_turn",
    );
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
      auto_avaliacao: {
        documento_e_aviso_de_apoio: false,
        qualidade_ocr: "boa",
        notas: "",
      },
    });
    const d = decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn");
    expect(d.publicado).toBe(false);
    expect(d.motivoRevisao).toContain("nao_e_aviso_de_apoio");
  });
});

describe("extraccaoParaApoio", () => {
  it("normaliza datas com o nosso parser, não com a leitura do modelo", () => {
    const e = extraccaoSolar();
    const apoio = extraccaoParaApoio(
      e,
      decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn"),
      CTX,
    );

    // 18:00 Lisbon on 30 September 2026 is 17:00 UTC (WEST). The model only said
    // "2026-09-30"; the precise instant comes from parsing the source expression.
    expect(apoio.fechaEm.iso).toBe("2026-09-30T17:00:00.000Z");
    expect(apoio.fechaEm.precisao).toBe("minuto");
  });

  it("canonicaliza a referência legal", () => {
    const e = extraccaoSolar();
    const apoio = extraccaoParaApoio(
      e,
      decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn"),
      CTX,
    );
    expect(apoio.referenciaLegal).toBe("AVISO 02/2026");
  });

  it("desduplica medidas repetidas em tipologias diferentes", () => {
    const e = extraccaoSolar();
    const repetida = {
      ...e,
      medidas: {
        ...e.medidas,
        valor: [
          {
            medida: "solar_fotovoltaico" as const,
            percentagem_apoio: 85,
            valor_max_eur: 15000,
            unidade: "por fracção",
          },
          {
            medida: "solar_fotovoltaico" as const,
            percentagem_apoio: 70,
            valor_max_eur: 9000,
            unidade: "por kWp",
          },
        ],
      },
    };
    const apoio = extraccaoParaApoio(
      repetida,
      decidir(
        repetida,
        verificarProvas(repetida, TEXTO_AVISO_SOLAR),
        "end_turn",
      ),
      CTX,
    );
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
    const apoio = extraccaoParaApoio(
      semGlobal,
      decidir(
        semGlobal,
        verificarProvas(semGlobal, TEXTO_AVISO_SOLAR),
        "end_turn",
      ),
      CTX,
    );
    expect(apoio.apoioMaxEur).toBe(15_000);
  });

  it("preserva sempre o URL oficial", () => {
    const e = extraccaoSolar();
    const apoio = extraccaoParaApoio(
      e,
      decidir(e, verificarProvas(e, TEXTO_AVISO_SOLAR), "end_turn"),
      CTX,
    );
    expect(apoio.urlOficial).toBe(CTX.urlOficial);
  });
});

describe("Extractor em modo replay", () => {
  it("falha alto quando falta a cassete, em vez de ir à rede", () => {
    // A silent fallthrough to the network would make the suite non-deterministic,
    // spend real money, and hang in the egress-blocked sandbox.
    const extractor = new Extractor({
      modo: "replay",
      dirCassetes: "/tmp/cassetes-inexistentes",
    });
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
    expect(
      chaveCassete({ ...doc, texto: `${TEXTO_AVISO_SOLAR} extra` }),
    ).not.toBe(chave);
  });
});
