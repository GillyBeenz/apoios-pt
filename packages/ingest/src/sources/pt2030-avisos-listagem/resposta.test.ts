import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerAvisos } from "./resposta.ts";
import { avisoAbertoParaApoio, urlDoAviso } from "./paraApoio.ts";

/**
 * A resposta real do endpoint, de 14/09/2026, tal como a página a recebeu.
 *
 * Não é uma reconstrução: foi gravada por uma captura com Chromium que registou o
 * corpo da resposta. É contra isto que o leitor é escrito, e é por isto que ele
 * corre sem rede.
 */
const RESPOSTA = readFileSync(
  new URL("../comum/fixtures-permanentes/pt2030-avisos-query-resposta.json", import.meta.url),
  "utf8",
);

const LISTAGEM = "https://portugal2030.pt/avisos/";

describe("lerAvisos", () => {
  it("lê os cinco avisos da resposta real", () => {
    expect(lerAvisos(RESPOSTA)).toHaveLength(5);
  });

  it("tira o código, o título e as datas de cada um", () => {
    const a = lerAvisos(RESPOSTA).find((x) => x.codigo === "ALT2030-2026-44");
    expect(a).toBeDefined();
    expect(a?.titulo).toBe("Produtos turísticos sub-regionais e locais (IT)");
    expect(a?.abreEm).toBe("2026-09-14");
    expect(a?.fechaEm).toBe("2027-09-30");
    expect(a?.publicadoEm).toBe("2026-09-11");
    expect(a?.programa).toBe("Programa Regional do Alentejo 2021-2027");
  });

  it("soma a dotação de todas as linhas de estrutura", () => {
    const a = lerAvisos(RESPOSTA).find((x) => x.codigo === "ALT2030-2026-44");
    // Quatro linhas: 24999.85 + 50036 + 256669 + 87174.15.
    expect(a?.dotacaoEur).toBe(418879);
  });

  /**
   * Dois dos cinco avisos reais trazem `dotacao: 0` em todas as linhas. Um aviso
   * com candidaturas abertas não tem orçamento de zero euros — o campo não foi
   * preenchido. Deixar passar o 0 punha «0 €» num cartão como afirmação de facto.
   */
  it("trata um total de zero como desconhecido, não como zero euros", () => {
    const zeros = lerAvisos(RESPOSTA).filter((a) => a.codigo.startsWith("NORTE2030"));
    expect(zeros).toHaveLength(2);
    expect(zeros.every((a) => a.dotacaoEur === null)).toBe(true);
  });

  /**
   * Isto é a API de outra pessoa, não documentada, aprendida a ver um browser.
   * Uma mudança de forma tem de deixar cair o aviso que afecta, não rebentar a
   * corrida inteira.
   */
  it("devolve lista vazia em vez de rebentar com JSON inválido", () => {
    expect(lerAvisos("isto não é json")).toEqual([]);
    expect(lerAvisos("null")).toEqual([]);
    expect(lerAvisos('{"avisos":"não é lista"}')).toEqual([]);
  });

  it("deixa cair um aviso sem código ou sem título, e guarda os outros", () => {
    const corpo = JSON.stringify({
      avisos: [
        { aviso: { designacaoPT: "Sem código" }, estrutura: [], calendario: {} },
        { aviso: { codigoAviso: "X-1" }, estrutura: [], calendario: {} },
        {
          aviso: { codigoAviso: "X-2", designacaoPT: "Completo" },
          estrutura: [],
          calendario: {},
        },
      ],
    });
    const lidos = lerAvisos(corpo);
    expect(lidos.map((a) => a.codigo)).toEqual(["X-2"]);
  });

  /** Quando um aviso é prorrogado, `dataFimAtual` é a que muda e a que vale. */
  it("prefere dataFimAtual a dataFim", () => {
    const corpo = JSON.stringify({
      avisos: [
        {
          aviso: { codigoAviso: "X-1", designacaoPT: "Prorrogado" },
          estrutura: [],
          calendario: {
            dataFim: "2026-01-31T18:00:00",
            dataFimAtual: "2026-06-30T18:00:00",
          },
        },
      ],
    });
    expect(lerAvisos(corpo)[0]?.fechaEm).toBe("2026-06-30");
  });

  /** Zero euros é uma afirmação; «o campo não veio» não é essa afirmação. */
  it("devolve dotação nula quando nenhuma linha traz um número", () => {
    const corpo = JSON.stringify({
      avisos: [
        {
          aviso: { codigoAviso: "X-1", designacaoPT: "Sem dotação" },
          estrutura: [{ programaOperacionalDesignacao: "P" }],
          calendario: {},
        },
      ],
    });
    expect(lerAvisos(corpo)[0]?.dotacaoEur).toBeNull();
  });
});

describe("avisoAbertoParaApoio", () => {
  const apoios = lerAvisos(RESPOSTA).map((a) =>
    avisoAbertoParaApoio(a, { urlListagem: LISTAGEM, entidade: "AD&C" }),
  );

  it("marca todos como abertos — é a razão de ser desta fonte", () => {
    expect(apoios.every((a) => a.estado === "aberto")).toBe(true);
  });

  /**
   * O endpoint não tem campo nenhum de beneficiários, e `tipologiaOperacao` diz
   * que tipo de operação é financiada, não que obras alguém pode pagar. Inventar
   * qualquer um dos dois é exactamente o que este produto não pode fazer.
   */
  it("nunca inventa elegibilidade nem medidas", () => {
    for (const a of apoios) {
      expect(a.admiteParticulares).toBe("desconhecido");
      expect(a.medidas).toEqual([]);
      expect(a.beneficiarios).toEqual([]);
      expect(a.alertavel).toBe(false);
      expect(a.motivoRevisao).toContain("admite_particulares:desconhecido");
      expect(a.motivoRevisao).toContain("sem_medidas");
    }
  });

  /**
   * Sem um parâmetro que os distinga, os cinco avisos vinham do mesmo endpoint e
   * resolviam todos para o mesmo apoio — quatro desapareciam.
   */
  it("dá a cada aviso o seu próprio URL", () => {
    const urls = new Set(apoios.map((a) => a.urlOficial));
    expect(urls.size).toBe(apoios.length);
    expect([...urls].every((u) => u.startsWith(LISTAGEM))).toBe(true);
  });

  it("manda o leitor para a página humana, nunca para o wp-json", () => {
    expect(apoios.every((a) => !a.urlOficial.includes("wp-json"))).toBe(true);
  });

  /** `ALT2030-2026-44` tem separador, ao contrário do id nu do plano anual. */
  it("usa o código do aviso como referência legal", () => {
    expect(apoios.map((a) => a.referenciaLegal)).toContain("ALT2030-2026-44");
  });

  it("não lista documentos que não consegue endereçar", () => {
    expect(apoios.every((a) => a.documentos.length === 0)).toBe(true);
  });

  it("constrói o URL com o código como parâmetro", () => {
    expect(urlDoAviso(LISTAGEM, "ALT2030-2026-44")).toBe(
      "https://portugal2030.pt/avisos/?aviso=ALT2030-2026-44",
    );
  });
});
