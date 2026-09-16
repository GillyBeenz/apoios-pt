import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { baseEstavel, classificar, codigosDe, variantes } from "./sonda.ts";
import { corpoDoPedido } from "./pedido.ts";

const RESPOSTA = readFileSync(
  new URL("../comum/fixtures-permanentes/pt2030-avisos-query-resposta.json", import.meta.url),
  "utf8",
);

describe("codigosDe", () => {
  it("tira os cinco códigos da resposta real, pela ordem em que vieram", () => {
    // A ordem não é decoração: é `publicacao desc`, e é ela que torna a janela
    // visível. A 15/09 entraram o `ALT2030-2026-45` e o `-46`, publicados nesse
    // dia, e saíram exactamente os dois últimos desta lista — os dois mais
    // antigos. O `NORTE2030-2026-22` fecha a 31/12/2026, por isso não saiu por
    // ter encerrado.
    expect(codigosDe(RESPOSTA)).toEqual([
      "ALT2030-2026-44",
      "PESSOAS-2026-15",
      "CENTRO2030-2026-23",
      "NORTE2030-2026-23",
      "NORTE2030-2026-22",
    ]);
  });

  it("devolve null — e não uma lista vazia — quando a resposta não se lê", () => {
    // A distinção é o que separa «o endpoint disse que não há avisos» de «o
    // endpoint respondeu outra coisa qualquer». A primeira é uma observação, a
    // segunda é uma sonda sem resultado, e classificá-las igual inventaria uma
    // página vazia que ninguém viu.
    expect(codigosDe("não é json")).toBeNull();
    expect(codigosDe("[]")).toBeNull();
    expect(codigosDe('{"status":500}')).toBeNull();
  });

  it("lê uma lista vazia como uma lista vazia", () => {
    expect(codigosDe('{"avisos":[],"status":201}')).toEqual([]);
  });
});

describe("variantes", () => {
  it("leva um controlo positivo", () => {
    // Sem ele, «todos ignorados» não distingue um endpoint sem paginação de uma
    // sonda partida.
    expect(variantes().filter((v) => v.familia === "controlo")).toHaveLength(1);
  });

  it("parte do corpo que a fonte envia mesmo", () => {
    // Uma sonda que interrogasse um corpo diferente do da fonte não provava nada
    // sobre a fonte.
    const base = new URLSearchParams(corpoDoPedido());
    for (const v of variantes()) {
      const p = new URLSearchParams(v.corpo);
      expect(p.getAll("programaId[]")).toEqual(base.getAll("programaId[]"));
      expect(p.get("estadoAvisoId")).toBe("7");
    }
  });

  it("substitui o parâmetro de ordenação em vez de o repetir", () => {
    const controlo = variantes().find((v) => v.familia === "controlo");
    const p = new URLSearchParams(controlo?.corpo ?? "");
    expect(p.getAll("order_by_direction")).toEqual(["asc"]);
  });

  it("não repete nomes", () => {
    const nomes = variantes().map((v) => v.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe("classificar", () => {
  const base = { status: 200, codigos: ["A", "B", "C"] };

  it("a mesma lista é o parâmetro ignorado", () => {
    expect(classificar(base, { status: 200, codigos: ["A", "B", "C"] })).toBe("ignorado");
  });

  it("outra lista é o parâmetro reconhecido", () => {
    expect(classificar(base, { status: 200, codigos: ["D", "E"] })).toBe("reconhecido");
  });

  it("a mesma lista por outra ordem também é reconhecimento", () => {
    // É exactamente o que o controlo positivo deve produzir.
    expect(classificar(base, { status: 200, codigos: ["C", "B", "A"] })).toBe("reconhecido");
  });

  it("uma lista vazia é reconhecimento, não falha", () => {
    // `page=2` sem segunda página é o servidor a perceber a pergunta.
    expect(classificar(base, { status: 200, codigos: [] })).toBe("reconhecido");
  });

  it("um erro do servidor não é uma observação sobre o parâmetro", () => {
    expect(classificar(base, { status: 500, codigos: null })).toBe("quebrou");
    expect(classificar(base, { status: 200, codigos: null })).toBe("quebrou");
  });
});

describe("baseEstavel", () => {
  it("duas bases iguais valem a sonda", () => {
    expect(baseEstavel({ status: 200, codigos: ["A"] }, { status: 200, codigos: ["A"] })).toBe(true);
  });

  it("uma publicação a meio da sonda invalida-a", () => {
    // Sem isto, o aviso novo fazia todas as variantes seguintes parecerem
    // reconhecidas — uma pista falsa que custa a sessão seguinte inteira.
    expect(baseEstavel({ status: 200, codigos: ["A"] }, { status: 200, codigos: ["B", "A"] })).toBe(false);
  });

  it("uma base ilegível invalida-a", () => {
    expect(baseEstavel({ status: 200, codigos: null }, { status: 200, codigos: ["A"] })).toBe(false);
  });
});
