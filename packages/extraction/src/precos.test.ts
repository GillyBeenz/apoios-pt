import { describe, expect, it } from "vitest";
import { custoDaChamada, PRECOS } from "./precos.ts";
import { MODELO } from "./cliente.ts";

describe("custoDaChamada", () => {
  it("cobra cada um dos quatro contadores à sua tarifa", () => {
    // 1M de cada, para que o total seja a soma das tarifas e um erro de fator
    // salte à vista em vez de se esconder numa dízima.
    const usd = custoDaChamada("claude-opus-5", {
      tokensEntrada: 1_000_000,
      tokensSaida: 1_000_000,
      tokensCacheLidos: 1_000_000,
      tokensCacheEscritos: 1_000_000,
    });
    expect(usd).toBe(5 + 25 + 0.5 + 6.25);
  });

  /**
   * A leitura de cache é a razão de existir do prefixo fixo: o mesmo milhão de
   * tokens custa dez vezes menos vindo da cache. Se esta relação se partir, a
   * conta continua a dar um número — só deixa de ser este.
   */
  it("cobra a leitura de cache a um décimo da entrada", () => {
    const p = PRECOS["claude-opus-5"]!;
    expect(p.cacheLeituraPorMTok).toBeCloseTo(p.entradaPorMTok * 0.1, 10);
    expect(p.cacheEscritaPorMTok).toBeCloseTo(p.entradaPorMTok * 1.25, 10);
  });

  /**
   * Null, e não zero. Um zero somava-se em silêncio a um total que ficaria abaixo
   * da fatura real; o null diz "isto não está tarifado aqui", que é uma coisa que
   * se pode ir corrigir.
   */
  it("devolve null para um modelo sem preço fixado", () => {
    expect(
      custoDaChamada("um-modelo-que-ainda-nao-existe", {
        tokensEntrada: 1_000_000,
        tokensSaida: 1_000_000,
        tokensCacheLidos: 0,
        tokensCacheEscritos: 0,
      }),
    ).toBeNull();
  });

  /** O modelo que corremos todas as noites tem de ter preço. */
  it("tem preço para o modelo que o cliente usa", () => {
    expect(PRECOS[MODELO]).toBeDefined();
  });

  it("arredonda ao que a coluna numeric(10, 6) consegue guardar", () => {
    const usd = custoDaChamada("claude-opus-5", {
      tokensEntrada: 1,
      tokensSaida: 0,
      tokensCacheLidos: 0,
      tokensCacheEscritos: 0,
    });
    // 5 / 1e6 = 0,000005 — cabe exactamente em seis casas decimais.
    expect(usd).toBe(0.000005);
  });
});
