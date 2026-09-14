import { afterEach, describe, expect, it, vi } from "vitest";
import { BuscadorHttp } from "./buscador.ts";

/**
 * O `fetch` global, substituído.
 *
 * O que interessa provar aqui não é o que um servidor responde — é o que o
 * `BuscadorHttp` põe no pedido. Um POST cujo corpo não sai, ou que leva um
 * `if-none-match` a reboque, falha de maneiras que só se veem contra o servidor
 * verdadeiro, e esse está fora do alcance deste ambiente.
 */
function espiar(): { chamadas: { url: string; init: RequestInit }[] } {
  const chamadas: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { chamadas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BuscadorHttp com pedidos que não são GET", () => {
  it("envia o método e o corpo declarados", async () => {
    const espia = espiar();
    await new BuscadorHttp().buscar({
      url: "https://exemplo.pt/api",
      metodo: "POST",
      corpo: "estadoAvisoId=7",
      tipoConteudo: "application/x-www-form-urlencoded",
    });

    const [chamada] = espia.chamadas;
    expect(chamada?.init.method).toBe("POST");
    expect(chamada?.init.body).toBe("estadoAvisoId=7");
    expect(
      (chamada?.init.headers as Record<string, string>)["content-type"],
    ).toBe("application/x-www-form-urlencoded");
  });

  /**
   * `if-none-match` é uma pergunta sobre a versão de um recurso que se lê. A
   * resposta de um POST depende do corpo enviado, não de uma versão guardada, por
   * isso a pergunta não faz sentido — e um 304 a uma pergunta que ninguém fez
   * daria uma corrida sem dados que se lia como «nada mudou».
   */
  it("não manda validadores condicionais num POST", async () => {
    const espia = espiar();
    await new BuscadorHttp().buscar({
      url: "https://exemplo.pt/api",
      metodo: "POST",
      corpo: "a=1",
      etag: '"abc"',
      lastModified: "Mon, 14 Sep 2026 10:00:00 GMT",
    });

    const cabecalhos = espia.chamadas[0]?.init.headers as Record<string, string>;
    expect(cabecalhos["if-none-match"]).toBeUndefined();
    expect(cabecalhos["if-modified-since"]).toBeUndefined();
  });

  /** O caminho de sempre não muda: um GET continua a levar os condicionais. */
  it("continua a mandar validadores num GET", async () => {
    const espia = espiar();
    await new BuscadorHttp().buscar({
      url: "https://exemplo.pt/pagina",
      etag: '"abc"',
    });

    const chamada = espia.chamadas[0];
    expect(chamada?.init.method).toBe("GET");
    expect(chamada?.init.body).toBeUndefined();
    expect(
      (chamada?.init.headers as Record<string, string>)["if-none-match"],
    ).toBe('"abc"');
  });
});
