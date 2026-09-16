import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerAvisos } from "./resposta.ts";
import { juntarPaginas, paginaTemItens } from "./varredura.ts";

/** A resposta real de 14/09/2026, capturada e não reconstruída. */
const PAGINA_REAL = readFileSync(
  new URL("../comum/fixtures-permanentes/pt2030-avisos-query-resposta.json", import.meta.url),
  "utf8",
);

/**
 * O fim de um varrimento, tal como o endpoint o diz.
 *
 * Observado a 15/09/2026 no `page=46`: **HTTP 200**, e o 404 vai dentro do corpo.
 * É por isto que o fim não se pode detectar pelo estado da resposta.
 */
const SENTINELA_DE_FIM = JSON.stringify({
  code: 404,
  message: "Not found.",
  info: "No data found",
  status: 404,
});

describe("paginaTemItens", () => {
  it("diz que sim a uma página com avisos", () => {
    expect(paginaTemItens(PAGINA_REAL)).toBe(true);
  });

  it("diz que não à sentinela de fim, que vem com HTTP 200", () => {
    // A armadilha desta fonte: quem olhasse para o estado da resposta pedia
    // páginas para sempre, porque o 200 nunca deixa de vir.
    expect(paginaTemItens(SENTINELA_DE_FIM)).toBe(false);
  });

  it("diz que não a um corpo ilegível, em vez de rebentar", () => {
    expect(paginaTemItens("<html>gateway timeout</html>")).toBe(false);
    expect(paginaTemItens("")).toBe(false);
  });

  it("diz que não a uma lista de avisos vazia", () => {
    expect(paginaTemItens(JSON.stringify({ avisos: [], status: 201 }))).toBe(false);
  });
});

describe("juntarPaginas", () => {
  it("devolve um documento que o lerAvisos lê sem saber que houve varrimento", () => {
    // É esta a razão de o documento ter a forma do envelope em vez de uma nova:
    // nem o `lerAvisos` nem o `lerDataset` precisam de aprender uma segunda forma.
    const uma = lerAvisos(PAGINA_REAL);
    const juntas = lerAvisos(juntarPaginas([PAGINA_REAL, PAGINA_REAL]));
    expect(uma.length).toBeGreaterThan(0);
    expect(juntas).toHaveLength(uma.length * 2);
  });

  it("mantém a ordem das páginas", () => {
    const pagina = (codigo: string): string =>
      JSON.stringify({ avisos: [{ aviso: { codigoAviso: codigo, designacaoPT: codigo } }] });
    const lidos = lerAvisos(juntarPaginas([pagina("A-1"), pagina("B-2"), pagina("C-3")]));
    expect(lidos.map((a) => a.codigo)).toEqual(["A-1", "B-2", "C-3"]);
  });

  it("não mete nada no documento que mude sozinho", () => {
    // O documento vai ao hash do portão da mudança. Uma data lá dentro fazia
    // todas as corridas parecerem uma mudança, e o portão deixava de gatear.
    expect(juntarPaginas([PAGINA_REAL])).toBe(juntarPaginas([PAGINA_REAL]));
  });

  it("de zero páginas faz um documento vazio, não um rebentamento", () => {
    expect(lerAvisos(juntarPaginas([]))).toEqual([]);
  });
});
