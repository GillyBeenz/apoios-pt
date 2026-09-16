import { describe, expect, it } from "vitest";
import {
  atingiuOTecto,
  chaveDePagina,
  corpoDaPagina,
  haMaisPaginas,
  type Paginacao,
} from "./paginacao.ts";
import { canonicalizarUrl } from "@apoios/core";

const PT2030: Paginacao = { parametro: "page", primeiraPagina: 0, maxPaginas: 200 };

describe("chaveDePagina", () => {
  it("dá uma chave diferente a cada página do mesmo URL", () => {
    const url = "https://portugal2030.pt/wp-json/avisos/query";
    const chaves = [0, 1, 2].map((n) => chaveDePagina(url, n));
    expect(new Set(chaves).size).toBe(3);
  });

  it("sobrevive à canonicalização, que é o que a torna útil", () => {
    // É esta a razão de ser um parâmetro de query e não um `#fragmento`: o
    // `canonicalizarUrl` apaga o hash, e as 46 páginas colapsariam numa só
    // `url_canonica` — a coluna de que depende a restrição de deduplicação.
    const url = "https://portugal2030.pt/wp-json/avisos/query";
    const a = canonicalizarUrl(chaveDePagina(url, 0));
    const b = canonicalizarUrl(chaveDePagina(url, 1));
    expect(a).not.toBe(b);
  });

  it("não estraga um URL que já tem parâmetros", () => {
    const chave = chaveDePagina("https://exemplo.pt/x?a=1", 3);
    const p = new URL(chave).searchParams;
    expect(p.get("a")).toBe("1");
    expect(p.get("_pagina")).toBe("3");
  });
});

describe("corpoDaPagina", () => {
  it("acrescenta o parâmetro quando ele não existe", () => {
    const corpo = corpoDaPagina("estadoAvisoId=7&order_by_field=publicacao", PT2030, 2);
    const p = new URLSearchParams(corpo);
    expect(p.get("page")).toBe("2");
    expect(p.get("estadoAvisoId")).toBe("7");
  });

  it("substitui em vez de repetir", () => {
    // Um corpo com `page` duas vezes deixa a escolha ao servidor, e um
    // varrimento cujo resultado depende disso não prova nada.
    const corpo = corpoDaPagina("page=9&a=1", PT2030, 2);
    expect(new URLSearchParams(corpo).getAll("page")).toEqual(["2"]);
  });

  it("preserva os parâmetros repetidos que a fonte envia mesmo", () => {
    // `programaId[]` aparece 23 vezes no corpo real; perder as repetições
    // mudaria o pedido sem ninguém dar por isso.
    const base = "programaId%5B%5D=100&programaId%5B%5D=101&programaId%5B%5D=102";
    const p = new URLSearchParams(corpoDaPagina(base, PT2030, 1));
    expect(p.getAll("programaId[]")).toEqual(["100", "101", "102"]);
  });

  it("aceita a primeira página ser o zero", () => {
    expect(new URLSearchParams(corpoDaPagina("a=1", PT2030, 0)).get("page")).toBe("0");
  });
});

describe("haMaisPaginas", () => {
  it("para quando a página não rende nada", () => {
    // É o sentinela do PT2030 visto de dentro: `200` com `{code:404}` e sem
    // `avisos` faz o leitor devolver lista vazia.
    expect(haMaisPaginas(0, 5, PT2030)).toBe(false);
  });

  it("continua enquanto a página render", () => {
    expect(haMaisPaginas(5, 0, PT2030)).toBe(true);
    expect(haMaisPaginas(3, 44, PT2030)).toBe(true);
  });

  it("para no tecto, mesmo com a página a render", () => {
    const curto: Paginacao = { ...PT2030, maxPaginas: 3 };
    expect(haMaisPaginas(5, 0, curto)).toBe(true);
    expect(haMaisPaginas(5, 1, curto)).toBe(true);
    expect(haMaisPaginas(5, 2, curto)).toBe(false);
  });

  it("conta o tecto a partir da primeira página, não do zero absoluto", () => {
    const umIndexado: Paginacao = { parametro: "p", primeiraPagina: 1, maxPaginas: 2 };
    expect(haMaisPaginas(5, 1, umIndexado)).toBe(true);
    expect(haMaisPaginas(5, 2, umIndexado)).toBe(false);
  });
});

describe("atingiuOTecto", () => {
  it("distingue acabar de render de ser cortado", () => {
    const curto: Paginacao = { ...PT2030, maxPaginas: 3 };
    // Acabou porque a fonte acabou: normal, não se diz nada.
    expect(atingiuOTecto(0, 2, curto)).toBe(false);
    // Acabou porque o tecto chegou com a fonte ainda a dar: isso é para gritar.
    expect(atingiuOTecto(5, 2, curto)).toBe(true);
  });
});
