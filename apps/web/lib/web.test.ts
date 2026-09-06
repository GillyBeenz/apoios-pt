import { describe, expect, it } from "vitest";
import {
  ETIQUETAS_MEDIDAS,
  TAXONOMIA_MEDIDAS,
  analisarDataPt,
  relogioFixo,
} from "@apoios/core";
import { apoioDe, apoioSoParaEntidades } from "@apoios/core/teste";
import {
  FILTROS_PREDEFINIDOS,
  alternar,
  correspondeAosFiltros,
  ehPredefinicao,
  filtrosDaQuery,
  ordenarApoios,
  queryDosFiltros,
  urlDosFiltros,
} from "./dados/filtros.ts";
import { elegibilidade } from "./elegibilidade.ts";
import { diasRestantes, etiquetaPrecisao, formatarEuros, formatarPrazo } from "./formatar.ts";
import { RepositorioSeed, APOIOS_SEED } from "./dados/seed.ts";

describe("elegibilidade", () => {
  it("mostra verde quando o aviso admite particulares", () => {
    expect(elegibilidade(apoioDe()).estado).toBe("aberto");
  });

  /** The E-Lar case: real, and closed to individuals. */
  it("mostra vermelho e nomeia os beneficiários reais", () => {
    const e = elegibilidade(apoioSoParaEntidades());
    expect(e.estado).toBe("fechado");
    expect(e.titulo).toContain("NÃO");
    expect(e.detalhe).toContain("Municípios");
  });

  it("mostra âmbar sem sugerir que provavelmente serve", () => {
    const e = elegibilidade(apoioDe({ admiteParticulares: "desconhecido" }));
    expect(e.estado).toBe("por_confirmar");
    // The amber copy must direct the reader to the official notice rather than
    // leaving "por confirmar" to be skimmed as a soft yes.
    expect(e.detalhe).toContain("aviso oficial");
  });
});

describe("formatarPrazo", () => {
  it("mostra a hora quando o aviso a indica", () => {
    const d = analisarDataPt("até às 18:00 do dia 30 de setembro de 2026", {
      papel: "encerramento",
    });
    expect(formatarPrazo(d)).toBe("30/09/2026, 18:00");
  });

  it("mostra o dia quando só o dia é conhecido", () => {
    const d = analisarDataPt("30/09/2026", { papel: "encerramento" });
    expect(formatarPrazo(d)).toBe("30/09/2026");
  });

  /**
   * The rule that keeps the UI honest: a month-precision deadline must never be
   * rendered as an exact date, because a reader will plan around what they see.
   */
  it("nunca inventa um dia para um prazo conhecido só ao mês", () => {
    const d = analisarDataPt("outubro de 2026", { papel: "encerramento" });
    const texto = formatarPrazo(d);
    expect(texto).toContain("durante");
    expect(texto).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(etiquetaPrecisao(d)).toBe("data aproximada");
  });

  it("admite não saber, mantendo o texto original do aviso", () => {
    const d = analisarDataPt("logo que a dotação o permita", { papel: "encerramento" });
    expect(formatarPrazo(d)).toContain("por confirmar");
  });
});

describe("diasRestantes", () => {
  it("conta quando o prazo é preciso", () => {
    const d = analisarDataPt("30/09/2026", { papel: "encerramento" });
    expect(diasRestantes(d, new Date("2026-09-23T09:00:00Z"))).toBe(7);
  });

  it("recusa contar contra um prazo vago", () => {
    const d = analisarDataPt("setembro de 2026", { papel: "encerramento" });
    expect(diasRestantes(d, new Date("2026-09-23T09:00:00Z"))).toBeNull();
  });
});

describe("formatarEuros", () => {
  it("formata em português", () => {
    expect(formatarEuros(15_000)?.replace(/ /g, " ")).toBe("15 000 €");
  });
  it("devolve null quando não há valor", () => {
    expect(formatarEuros(null)).toBeNull();
  });
});

describe("correspondeAosFiltros", () => {
  it("aceita um apoio nacional aberto a particulares", () => {
    expect(correspondeAosFiltros(apoioDe(), FILTROS_PREDEFINIDOS)).toBe(true);
  });

  it("esconde por omissão os avisos por rever", () => {
    const porRever = apoioDe({ needsReview: true });
    expect(correspondeAosFiltros(porRever, FILTROS_PREDEFINIDOS)).toBe(false);
    expect(
      correspondeAosFiltros(porRever, { ...FILTROS_PREDEFINIDOS, incluirPorRever: true }),
    ).toBe(true);
  });

  it("não mostra a um particular um aviso só para entidades", () => {
    expect(correspondeAosFiltros(apoioSoParaEntidades(), FILTROS_PREDEFINIDOS)).toBe(false);
  });

  it("um filtro vazio não significa esconder tudo", () => {
    const semRestricao = { ...FILTROS_PREDEFINIDOS, estados: [], beneficiarios: [] };
    expect(correspondeAosFiltros(apoioSoParaEntidades(), semRestricao)).toBe(true);
  });

  it("respeita o concelho em avisos municipais", () => {
    const municipal = apoioDe({ ambito: "municipio", municipios: ["1106"] });
    expect(
      correspondeAosFiltros(municipal, { ...FILTROS_PREDEFINIDOS, concelho: "1106" }),
    ).toBe(true);
    expect(
      correspondeAosFiltros(municipal, { ...FILTROS_PREDEFINIDOS, concelho: "1312" }),
    ).toBe(false);
  });
});

describe("ordenarApoios", () => {
  it("põe primeiro o que se pode fazer mais cedo", () => {
    const ordenados = ordenarApoios([
      apoioDe({ id: "c", estado: "encerrado" }),
      apoioDe({ id: "b", estado: "previsto" }),
      apoioDe({ id: "a", estado: "aberto" }),
    ]);
    expect(ordenados.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
});

describe("filtrosDaQuery", () => {
  it("assume a vista de um proprietário quando nada é pedido", () => {
    const f = filtrosDaQuery({});
    expect(f.beneficiarios).toEqual(["particular", "condominio"]);
    expect(f.estados).toEqual(["aberto", "previsto"]);
  });

  it("permite alargar explicitamente a todos os beneficiários", () => {
    // `beneficiario=` (vazio) tem de limpar o filtro, não reaplicar o predefinido —
    // caso contrário "mostrar tudo" seria inalcançável.
    expect(filtrosDaQuery({ beneficiario: "" }).beneficiarios).toEqual([]);
  });

  it("lê listas separadas por vírgulas", () => {
    const f = filtrosDaQuery({ medida: "janelas,bomba_calor" });
    expect(f.medidas).toEqual(["janelas", "bomba_calor"]);
  });

  /**
   * A GET form with checkboxes repeats the key — `estado=aberto&estado=previsto` —
   * and Next hands that over as an array. Reading only the first element dropped
   * every box after the first, so ticking three states filtered by one.
   */
  it("lê o mesmo parâmetro repetido, como um formulário o envia", () => {
    const f = filtrosDaQuery({ estado: ["aberto", "previsto", "encerrado"] });
    expect(f.estados).toEqual(["aberto", "previsto", "encerrado"]);
  });

  it("aceita a forma mista, repetida e com vírgulas", () => {
    const f = filtrosDaQuery({ medida: ["janelas,bomba_calor", "isolamento"] });
    expect(f.medidas).toEqual(["janelas", "bomba_calor", "isolamento"]);
  });

  /**
   * The bug this is here for: `estado=` (present, empty) used to fall through to
   * the default, so unticking the last state restored "aberto, previsto" and the
   * checkbox looked broken. Absent still means default; present-but-empty means
   * the user cleared it.
   */
  it("distingue um estado por definir de um estado limpo", () => {
    expect(filtrosDaQuery({}).estados).toEqual(["aberto", "previsto"]);
    expect(filtrosDaQuery({ estado: "" }).estados).toEqual([]);
  });

  it("um concelho só de espaços não é um filtro", () => {
    expect(filtrosDaQuery({ concelho: "   " }).concelho).toBeNull();
  });

  /**
   * `Apoio.municipios` holds DICOFRE codes, not names, so the parameter only ever
   * matches a code — which is what the alerting path passes off the user profile.
   * There is deliberately no concelho box in the UI until a code-to-name table
   * exists: a text field here would match nothing anyone would type, and an empty
   * catalogue reads as "no funding for me" rather than "wrong kind of value".
   *
   * This pins that as a known limit rather than a silent one.
   */
  it("o concelho é um código DICOFRE, não um nome", () => {
    const porCodigo = { ...FILTROS_PREDEFINIDOS, concelho: "1106" };
    const porNome = { ...FILTROS_PREDEFINIDOS, concelho: "Lisboa" };
    const municipal = apoioDe({ ambito: "municipio", municipios: ["1106"] });

    expect(correspondeAosFiltros(municipal, porCodigo)).toBe(true);
    expect(correspondeAosFiltros(municipal, porNome)).toBe(false);
  });

  it("ignora um valor vazio no meio de uma lista", () => {
    expect(filtrosDaQuery({ estado: "aberto,,previsto" }).estados).toEqual([
      "aberto",
      "previsto",
    ]);
  });
});

describe("ida e volta dos filtros", () => {
  /**
   * Serialising has to keep `estado` and `beneficiario` even when empty. Dropping
   * an empty key would be read back as "never set" and silently restore the
   * default, which is the same defect from the other direction.
   */
  it("um filtro limpo sobrevive à serialização", () => {
    const limpo = { ...FILTROS_PREDEFINIDOS, estados: [], beneficiarios: [] };
    const q = Object.fromEntries(new URLSearchParams(queryDosFiltros(limpo)));
    expect(filtrosDaQuery(q).estados).toEqual([]);
    expect(filtrosDaQuery(q).beneficiarios).toEqual([]);
  });

  it("os filtros predefinidos dão a volta inalterados", () => {
    const q = Object.fromEntries(new URLSearchParams(queryDosFiltros(FILTROS_PREDEFINIDOS)));
    expect(filtrosDaQuery(q)).toEqual(FILTROS_PREDEFINIDOS);
  });

  it("reconhece a vista predefinida, venha ela do URL ou não", () => {
    expect(ehPredefinicao(FILTROS_PREDEFINIDOS)).toBe(true);
    expect(ehPredefinicao(filtrosDaQuery({}))).toBe(true);
    expect(ehPredefinicao({ ...FILTROS_PREDEFINIDOS, incluirPorRever: true })).toBe(false);
  });

  it("uma alteração preserva tudo o resto", () => {
    // A ligação "mostrar todos os beneficiários" apontava para /apoios?beneficiario=
    // fixo, deitando fora medidas, estados, concelho e o "por rever" de quem lá
    // chegasse com filtros postos.
    const postos = {
      ...FILTROS_PREDEFINIDOS,
      medidas: ["janelas"] as const,
      concelho: "Braga",
      incluirPorRever: true,
    };
    const url = urlDosFiltros({ ...postos, beneficiarios: [] });
    const q = Object.fromEntries(new URLSearchParams(url.split("?")[1]));
    const lido = filtrosDaQuery(q);
    expect(lido.beneficiarios).toEqual([]);
    expect(lido.medidas).toEqual(["janelas"]);
    expect(lido.concelho).toBe("Braga");
    expect(lido.incluirPorRever).toBe(true);
  });

  it("alternar liga e desliga sem tocar no resto", () => {
    expect(alternar(["aberto", "previsto"], "previsto")).toEqual(["aberto"]);
    expect(alternar(["aberto"], "previsto")).toEqual(["aberto", "previsto"]);
  });
});

describe("taxonomia partilhada", () => {
  /**
   * The subscription UI is the second consumer of TAXONOMIA_MEDIDAS. If a measure
   * ever lacks a label the UI silently cannot offer it, and a user who would have
   * subscribed never hears about that funding.
   */
  it("toda a medida tem etiqueta para a UI", () => {
    for (const m of TAXONOMIA_MEDIDAS) {
      expect(ETIQUETAS_MEDIDAS[m], `sem etiqueta: ${m}`).toBeTruthy();
    }
  });
});

describe("RepositorioSeed", () => {
  it("serve o catálogo predefinido sem credenciais nenhumas", async () => {
    const apoios = await new RepositorioSeed().listar(FILTROS_PREDEFINIDOS);
    expect(apoios.length).toBeGreaterThan(0);
  });

  it("o E-Lar está no catálogo mas fora da vista do proprietário", async () => {
    const repo = new RepositorioSeed();
    expect(await repo.obterPorSlug("programa-e-lar-3")).not.toBeNull();

    const vistaProprietario = await repo.listar(FILTROS_PREDEFINIDOS);
    expect(vistaProprietario.some((a) => a.slug === "programa-e-lar-3")).toBe(false);
  });

  it("cada apoio do seed liga a uma fonte oficial", () => {
    for (const a of APOIOS_SEED) {
      expect(a.urlOficial, a.slug).toMatch(/^https:\/\//);
    }
  });

  it("o seed cobre as formas difíceis de apresentar", () => {
    expect(APOIOS_SEED.some((a) => a.admiteParticulares === "nao")).toBe(true);
    expect(APOIOS_SEED.some((a) => a.admiteParticulares === "desconhecido")).toBe(true);
    expect(APOIOS_SEED.some((a) => a.needsReview)).toBe(true);
    expect(APOIOS_SEED.some((a) => a.fechaEm.precisao === "mes")).toBe(true);
    expect(APOIOS_SEED.some((a) => a.ambito === "municipio")).toBe(true);
    expect(APOIOS_SEED.some((a) => a.dotacaoEsgotada)).toBe(true);
  });

  it("nenhum apoio por rever é alertável", () => {
    // Mirrors the pipeline's gate: the catalogue may show it, email may not.
    for (const a of APOIOS_SEED) {
      if (a.needsReview) expect(a.alertavel, a.slug).toBe(false);
    }
  });
});

describe("relógio injetado", () => {
  it("continua disponível para testes de tempo", () => {
    expect(relogioFixo("2026-09-23T09:00:00Z").agora().toISOString()).toBe(
      "2026-09-23T09:00:00.000Z",
    );
  });
});
