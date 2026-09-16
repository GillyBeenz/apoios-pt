import { describe, expect, it } from "vitest";
import type { Buscador, PedidoCondicional, RespostaHttp } from "../http/tipos.ts";
import type { PedidoDeEntrada, Varredura } from "../sources/tipos.ts";
import { varrerPaginas } from "./varrer.ts";

const PEDIDO: PedidoDeEntrada = {
  url: "https://exemplo.pt/query",
  metodo: "POST",
  corpo: "a=1&b=",
  tipoConteudo: "application/x-www-form-urlencoded",
};

const VARREDURA: Varredura = { parametro: "page", primeiraPagina: 0, maxPaginas: 10 };

function resposta(parcial: Partial<RespostaHttp>): RespostaHttp {
  return {
    url: PEDIDO.url,
    status: 200,
    naoModificado: false,
    corpo: null,
    bytes: null,
    contentType: "application/json",
    etag: null,
    lastModified: null,
    erro: null,
    ...parcial,
  };
}

/** Um buscador de mentira que devolve o que lhe mandarem, e regista os corpos. */
function buscadorDe(respostas: RespostaHttp[]): Buscador & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    pedidos,
    async buscar(p: PedidoCondicional): Promise<RespostaHttp> {
      pedidos.push(p.corpo ?? "");
      return respostas[pedidos.length - 1] ?? resposta({ corpo: FIM });
    },
  };
}

const pagina = (n: number): string => JSON.stringify({ itens: [n] });
const FIM = JSON.stringify({ code: 404, info: "No data found" });

const temItens = (corpo: string): boolean => {
  try {
    return Array.isArray(JSON.parse(corpo).itens);
  } catch {
    return false;
  }
};
const juntar = (corpos: readonly string[]): string =>
  JSON.stringify({ itens: corpos.flatMap((c) => JSON.parse(c).itens) });

describe("varrerPaginas", () => {
  it("anda até à sentinela e junta o que leu", async () => {
    const b = buscadorDe([
      resposta({ corpo: pagina(0) }),
      resposta({ corpo: pagina(1) }),
      resposta({ corpo: pagina(2) }),
      resposta({ corpo: FIM }),
    ]);

    const r = await varrerPaginas(b, PEDIDO, VARREDURA, temItens, juntar);

    expect(r.erro).toBeNull();
    expect(JSON.parse(r.corpo ?? "").itens).toEqual([0, 1, 2]);
  });

  it("começa na página que a fonte declara e acrescenta o parâmetro ao corpo", async () => {
    // O `page` do PT2030 é 0-indexado. Começar no 1 salta a segunda página do
    // conjunto sem dar erro nenhum — foi o que já aconteceu uma vez.
    const b = buscadorDe([resposta({ corpo: pagina(0) }), resposta({ corpo: FIM })]);
    await varrerPaginas(b, PEDIDO, VARREDURA, temItens, juntar);
    expect(b.pedidos).toEqual(["a=1&b=&page=0", "a=1&b=&page=1"]);
  });

  it("respeita uma fonte que conte a partir de um", async () => {
    const b = buscadorDe([resposta({ corpo: pagina(1) }), resposta({ corpo: FIM })]);
    await varrerPaginas(b, PEDIDO, { ...VARREDURA, primeiraPagina: 1 }, temItens, juntar);
    expect(b.pedidos[0]).toBe("a=1&b=&page=1");
  });

  it("não devolve documento nenhum quando uma página falha a meio", async () => {
    // A regra que mais importa neste ficheiro. Um varrimento que morre na página 2
    // de 46 leu uma fracção do conjunto; guardá-la como se fosse a resposta lia-se
    // a jusante como os outros avisos terem desaparecido todos de um dia para o
    // outro, que é um acontecimento sobre o qual este pipeline age.
    const b = buscadorDe([
      resposta({ corpo: pagina(0) }),
      resposta({ status: 503, erro: "HTTP 503" }),
      resposta({ status: 503, erro: "HTTP 503" }),
    ]);

    const r = await varrerPaginas(b, PEDIDO, VARREDURA, temItens, juntar);

    expect(r.corpo).toBeNull();
    expect(r.erro).toContain("página 1");
    expect(r.erro).toContain("503");
  });

  it("repete uma página que falhou uma vez, em vez de deitar fora o varrimento", async () => {
    // Medido, não suposto: o primeiro varrimento a sério deste endpoint morreu na
    // página 44 de 46 com um `timeout`, depois de sete minutos de páginas boas.
    // Falhar fechado continua a ser a regra; desistir à primeira falha passageira
    // era uma fonte que nunca chegava ao fim.
    const b = buscadorDe([
      resposta({ corpo: pagina(0) }),
      resposta({ status: 0, erro: "The operation was aborted due to timeout" }),
      resposta({ corpo: pagina(1) }),
      resposta({ corpo: FIM }),
    ]);

    const r = await varrerPaginas(b, PEDIDO, VARREDURA, temItens, juntar);

    expect(r.erro).toBeNull();
    expect(JSON.parse(r.corpo ?? "").itens).toEqual([0, 1]);
    // A repetição é do mesmo número de página, não da seguinte.
    expect(b.pedidos.slice(0, 3)).toEqual(["a=1&b=&page=0", "a=1&b=&page=1", "a=1&b=&page=1"]);
  });

  it("falha quando o endpoint deixa de dizer onde acaba", async () => {
    const semFim: Buscador = {
      async buscar(): Promise<RespostaHttp> {
        return resposta({ corpo: pagina(7) });
      },
    };

    const r = await varrerPaginas(semFim, PEDIDO, { ...VARREDURA, maxPaginas: 3 }, temItens, juntar);

    expect(r.corpo).toBeNull();
    expect(r.erro).toContain("3 páginas");
  });

  it("trata uma resposta sem corpo como falha, não como fim", async () => {
    // Um 304 ou um corpo binário não são «acabou»: são «não sei», e a diferença
    // entre as duas é o conjunto inteiro.
    const b = buscadorDe([resposta({ corpo: pagina(0) }), resposta({ corpo: null })]);
    const r = await varrerPaginas(b, PEDIDO, VARREDURA, temItens, juntar);
    expect(r.corpo).toBeNull();
    expect(r.erro).toContain("sem corpo");
  });
});
