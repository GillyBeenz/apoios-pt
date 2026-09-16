import { describe, expect, it } from "vitest";
import { analisarDataPt, civilLisboaParaUtc, diasAte } from "./data.ts";
import { analisarMontanteEur, analisarPercentagem } from "./montante.ts";
import {
  canonicalizarReferenciaLegal,
  normalizarTitulo,
  prefixoPerdidoNaReferencia,
  removerAcentos,
} from "./texto.ts";

/**
 * Every real date string in this table was harvested from the way Portuguese
 * funding notices actually write deadlines. Every parsing bug found in production
 * should become a permanent row here.
 */
describe("analisarDataPt — encerramento", () => {
  const enc = { papel: "encerramento" } as const;

  it.each([
    ["até às 18:00 do dia 30 de setembro de 2026", "2026-09-30T17:00:00.000Z", "minuto"],
    ["30 de setembro de 2026", "2026-09-30T22:59:59.000Z", "dia"],
    ["31/12/2025", "2025-12-31T23:59:59.000Z", "dia"],
    ["31-12-2025", "2025-12-31T23:59:59.000Z", "dia"],
    ["2026-03-15", "2026-03-15T23:59:59.000Z", "dia"],
    ["30 set. 2026", "2026-09-30T22:59:59.000Z", "dia"],
  ])("lê %s", (entrada, esperado, precisao) => {
    const d = analisarDataPt(entrada, enc);
    expect(d.iso).toBe(esperado);
    expect(d.precisao).toBe(precisao);
    expect(d.textoFonte).toBe(entrada);
  });

  it("ancora precisão de mês ao fim do mês quando é um prazo", () => {
    const d = analisarDataPt("durante o mês de outubro de 2026", enc);
    expect(d.precisao).toBe("mes");
    // 31 October 2026, 23:59:59 Lisbon. DST ends on the 25th, so the month's last
    // day is already back on WET (UTC+0) even though the 1st was WEST — the exact
    // case a fixed offset would get wrong.
    expect(d.iso).toBe("2026-10-31T23:59:59.000Z");
  });

  it("ancora precisão de mês ao início do mês quando é uma abertura", () => {
    const d = analisarDataPt("outubro de 2026", { papel: "abertura" });
    expect(d.precisao).toBe("mes");
    expect(d.iso).toBe("2026-09-30T23:00:00.000Z"); // 1 Oct 00:00 WEST
  });

  it("usa o ano predefinido quando o aviso o omite", () => {
    const d = analisarDataPt("até 30 de junho", { ...enc, anoPredefinido: 2026 });
    expect(d.iso).toBe("2026-06-30T22:59:59.000Z");
  });

  it("admite não saber, guardando o texto original", () => {
    const d = analisarDataPt("logo que a dotação o permita", enc);
    expect(d.iso).toBeNull();
    expect(d.precisao).toBe("desconhecida");
    expect(d.textoFonte).toBe("logo que a dotação o permita");
  });

  it("lê trimestres do Plano Anual de Avisos", () => {
    const d = analisarDataPt("2.º trimestre de 2026", { papel: "abertura" });
    expect(d.precisao).toBe("mes");
    expect(d.iso).toBe("2026-03-31T23:00:00.000Z"); // 1 Apr 00:00 WEST
  });
});

describe("civilLisboaParaUtc — fronteiras de horário de verão", () => {
  it("trata WET no inverno como UTC+0", () => {
    expect(civilLisboaParaUtc(2026, 1, 15, 12, 0).toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("trata WEST no verão como UTC+1", () => {
    expect(civilLisboaParaUtc(2026, 7, 15, 12, 0).toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });

  it("resolve a noite da transição de março", () => {
    // DST starts 29 March 2026; 23:59:59 that day is already WEST.
    expect(civilLisboaParaUtc(2026, 3, 29, 23, 59, 59).toISOString()).toBe(
      "2026-03-29T22:59:59.000Z",
    );
  });
});

describe("analisarMontanteEur", () => {
  it.each([
    ["1.500.000,00 €", 1_500_000],
    ["€ 15.000", 15_000],
    ["15 000 EUR", 15_000],
    ["15000", 15_000],
    ["até 15.000,00€", 15_000],
    ["2 milhões de euros", 2_000_000],
    ["1,5 M€", 1_500_000],
    ["850,50 €", 850.5],
  ])("lê %s como %d", (entrada, esperado) => {
    expect(analisarMontanteEur(entrada)).toBe(esperado);
  });

  it("devolve null quando não há montante", () => {
    expect(analisarMontanteEur("a definir em regulamento")).toBeNull();
    expect(analisarMontanteEur(null)).toBeNull();
  });

  it("não confunde o separador de milhares português com um decimal", () => {
    // The failure that would put €1.5 in an email instead of €1,500,000.
    expect(analisarMontanteEur("1.500.000")).toBe(1_500_000);
    expect(analisarMontanteEur("1,50")).toBe(1.5);
  });
});

describe("analisarPercentagem", () => {
  it.each([
    ["85%", 85],
    ["até 85 %", 85],
    ["comparticipação de 85 por cento", 85],
    ["sem comparticipação indicada", null],
    ["250%", null],
  ])("lê %s", (entrada, esperado) => {
    expect(analisarPercentagem(entrada)).toBe(esperado);
  });
});

describe("canonicalizarReferenciaLegal", () => {
  it("colapsa as várias grafias da mesma referência", () => {
    const variantes = [
      "Aviso n.º 03/C13-i01/2024",
      "AVISO No 03/C13-I01/2024",
      "aviso nº 03/c13-i01/2024",
      "Aviso n.o 3/C13-I01/2024",
    ];
    const canonicas = new Set(variantes.map(canonicalizarReferenciaLegal));
    expect(canonicas.size).toBe(1);
    expect([...canonicas][0]).toBe("AVISO 03/C13-I01/2024");
  });

  it("distingue tipos de documento com o mesmo número", () => {
    expect(canonicalizarReferenciaLegal("Aviso n.º 01/2026")).not.toBe(
      canonicalizarReferenciaLegal("Despacho n.º 01/2026"),
    );
  });

  it("devolve null quando não há referência, em vez de inventar uma", () => {
    expect(canonicalizarReferenciaLegal("Apoio a edifícios mais sustentáveis")).toBeNull();
    expect(canonicalizarReferenciaLegal(null)).toBeNull();
  });

  // O prefixo alfanumérico dos códigos do Portugal 2030 **é** a parte que
  // distingue: nomeia a região. Guardá-lo não é um detalhe de formatação — é a
  // diferença entre dois avisos e um só.
  //
  // Este caso custou um apoio. A 15/09/2026 o `CENTRO2030-2026-23` e o
  // `NORTE2030-2026-23` canonicalizavam os dois para `2026-23`, com força 100, e
  // o do Centro substituiu o do Norte — saúde, cuidados de saúde primários — que
  // saiu do catálogo sem deixar rasto.
  it("guarda o prefixo regional, que é o que distingue dois códigos do PT2030", () => {
    expect(canonicalizarReferenciaLegal("CENTRO2030-2026-23")).toBe("CENTRO2030-2026-23");
    expect(canonicalizarReferenciaLegal("NORTE2030-2026-23")).toBe("NORTE2030-2026-23");
  });

  it("não funde dois avisos de regiões diferentes com o mesmo número", () => {
    expect(canonicalizarReferenciaLegal("CENTRO2030-2026-23")).not.toBe(
      canonicalizarReferenciaLegal("NORTE2030-2026-23"),
    );
  });

  // A armadilha que fez isto falhar de duas maneiras independentes, e que uma
  // correcção só à regex do corpo não teria apanhado: o removedor do «n.º» tem um
  // `[.ºO°]*` para o `O` de «N.o 3», e sem exigir um dígito a seguir ele comia o
  // `NO` de **NORTE**. O código chegava ao resto da função já sem a região.
  it("não confunde o «N.º» com o primeiro N de uma palavra", () => {
    expect(canonicalizarReferenciaLegal("NORTE2030-2026-22")).toBe("NORTE2030-2026-22");
    // E o marcador a sério continua a cair.
    expect(canonicalizarReferenciaLegal("Aviso N.º 03/2026")).toBe("AVISO 03/2026");
  });

  // Letras separadas por um hífen são um corpo válido para a forma nova, por isso
  // `AVISO-CONVITE` casa — e devolveria o tipo de documento no lugar da
  // referência se o primeiro candidato fosse aceite sem mais nada.
  it("não toma o tipo de documento por referência", () => {
    expect(canonicalizarReferenciaLegal("AVISO-CONVITE 02/C08-I05.02/2022")).toBe(
      "AVISO-CONVITE 02/C08-I05.02/2022",
    );
    expect(canonicalizarReferenciaLegal("Aviso-Convite n.º 01/FAZ/2026")).toBe(
      "AVISO-CONVITE 01/FAZ/2026",
    );
  });
});

describe("prefixoPerdidoNaReferencia", () => {
  // O texto tal como os artigos do PT2030 o escrevem mesmo. Copiado das fixtures
  // de `pt2030-avisos`, não inventado: é sobre estes bytes que a guarda corre.
  const ARTIGO_NORTE =
    "Rotas do Norte. O Aviso NORTE2030-2026-24 visa apoiar operações de gestão.";
  const ARTIGO_CENTRO =
    "abrangem toda a região: Centro2030-2024-47 - ITI CIM da Região da Beira";

  it("apanha a cauda que o modelo devolveu em vez do código inteiro", () => {
    expect(prefixoPerdidoNaReferencia("AVISO 2026-24", ARTIGO_NORTE)).toBe(
      "NORTE2030-2026-24",
    );
    expect(prefixoPerdidoNaReferencia("2024-47", ARTIGO_CENTRO)).toBe(
      "Centro2030-2024-47",
    );
  });

  // O ponto todo: sem o prefixo, dois avisos de regiões diferentes com o mesmo
  // número dão a mesma chave de força 100, e um come o outro em silêncio.
  it("o que ela evita é a colisão entre regiões", () => {
    expect(canonicalizarReferenciaLegal("2026-24")).toBe(
      canonicalizarReferenciaLegal("2026-24"),
    );
    expect(canonicalizarReferenciaLegal("NORTE2030-2026-24")).not.toBe(
      canonicalizarReferenciaLegal("CENTRO2030-2026-24"),
    );
  });

  it("cala-se quando a referência está inteira", () => {
    const texto = "Aviso n.º 03/C13-I01/2024 e ainda o Despacho 6119/2025.";
    expect(prefixoPerdidoNaReferencia("AVISO 03/C13-I01/2024", texto)).toBeNull();
    expect(prefixoPerdidoNaReferencia("DESPACHO 6119/2025", texto)).toBeNull();
  });

  // Um prefixo tem de misturar letras e dígitos para ser código de programa.
  // Sem isso, qualquer palavra agarrada por um hífen — num URL, tipicamente —
  // fazia a guarda disparar e tirava a referência a quem a tinha certa.
  it("não confunde prosa agarrada por um hífen com um código de programa", () => {
    expect(
      prefixoPerdidoNaReferencia("2024-11", "ver pagina-2024-11 do relatório"),
    ).toBeNull();
    expect(
      prefixoPerdidoNaReferencia("2024-11", "o Aviso ACORES2030-2024-11 abre"),
    ).toBe("ACORES2030-2024-11");
  });

  it("não inventa nada quando não há texto, referência, ou código no meio", () => {
    expect(prefixoPerdidoNaReferencia(null, ARTIGO_NORTE)).toBeNull();
    expect(prefixoPerdidoNaReferencia("AVISO 2026-24", "")).toBeNull();
    expect(prefixoPerdidoNaReferencia("sem referência", ARTIGO_NORTE)).toBeNull();
  });
});

describe("normalizarTitulo", () => {
  it("ignora marcas de republicação para o mesmo aviso não se duplicar", () => {
    const a = normalizarTitulo("Aviso de Abertura de Concurso N.º 02/2026 — Eficiência Energética", 2026);
    const b = normalizarTitulo(
      "Aviso de Abertura de Concurso N.º 02/2026 — Eficiência Energética — Segunda Republicação",
      2026,
    );
    expect(a).toBe(b);
  });

  it("separa avisos de anos diferentes com o mesmo título", () => {
    expect(normalizarTitulo("Apoio a painéis solares", 2025)).not.toBe(
      normalizarTitulo("Apoio a painéis solares", 2026),
    );
  });
});

describe("removerAcentos", () => {
  it("normaliza caracteres portugueses", () => {
    expect(removerAcentos("Março, Município, ação, coração")).toBe(
      "Marco, Municipio, acao, coracao",
    );
  });
});

describe("diasAte", () => {
  it("conta dias inteiros até ao prazo", () => {
    const d = analisarDataPt("30/09/2026", { papel: "encerramento" });
    expect(diasAte(d, new Date("2026-09-23T09:00:00Z"))).toBe(7);
  });
});
