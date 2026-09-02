import { describe, expect, it } from "vitest";
import { extrair } from "./extract.ts";

const CTX = {
  urlBase: "https://portugal2030.pt/plano-anual-de-avisos/",
  agora: new Date("2026-09-02T00:00:00Z"),
};

/**
 * This extractor matches on the href's extension precisely so it does not depend on
 * markup nobody here has seen. These tests pin that property: the surrounding
 * structure varies wildly below and the result must not.
 */
describe("extrair — Plano Anual de Avisos", () => {
  it("encontra a folha independentemente da estrutura à volta", () => {
    const paginas = [
      `<a class="btn" href="/wp-content/uploads/2026/01/PAA_2026_v3.xlsx">Descarregar</a>`,
      `<div><p><span><a href="https://portugal2030.pt/wp-content/uploads/2026/01/PAA_2026_v3.xlsx">
         Plano Anual de Avisos 2026</a></span></p></div>`,
      `<table><tr><td><a href="/wp-content/uploads/2026/01/PAA_2026_v3.xlsx" download>xlsx</a></td></tr></table>`,
    ];
    for (const html of paginas) {
      const c = extrair(html, CTX);
      expect(c).toHaveLength(1);
      expect(c[0]?.urlDetalhe).toBe(
        "https://portugal2030.pt/wp-content/uploads/2026/01/PAA_2026_v3.xlsx",
      );
      expect(c[0]?.tipoDocumento).toBe("folha");
    }
  });

  it("recorre ao nome do ficheiro quando o texto da ligação não diz nada", () => {
    // "Descarregar" identifies nothing; the filename carries the version.
    const c = extrair(`<a href="/uploads/PAA_2026_v3.xlsx">Descarregar</a>`, CTX);
    expect(c[0]?.titulo).toBe("PAA_2026_v3.xlsx");
  });

  it("prefere o texto da ligação quando este é descritivo", () => {
    const c = extrair(`<a href="/uploads/PAA_2026_v3.xlsx">Plano Anual de Avisos 2026</a>`, CTX);
    expect(c[0]?.titulo).toBe("Plano Anual de Avisos 2026");
  });

  it("ignora ligações que não são ficheiros de dados", () => {
    const html = `
      <a href="/plano-anual-de-avisos/">Voltar</a>
      <a href="/wp-content/uploads/aviso.pdf">Aviso em PDF</a>
      <a href="/wp-content/uploads/imagem.png">Imagem</a>`;
    expect(extrair(html, CTX)).toEqual([]);
  });

  it("não duplica a mesma folha ligada de dois sítios", () => {
    const html = `
      <a href="/uploads/PAA_2026.xlsx">Descarregar</a>
      <a href="https://portugal2030.pt/uploads/PAA_2026.xlsx">Descarregar de novo</a>`;
    expect(extrair(html, CTX)).toHaveLength(1);
  });
});
