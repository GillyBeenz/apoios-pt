import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extrair } from "./extract.ts";

const CTX = {
  urlBase: "https://www.fundoambiental.pt/listagem-noticias.aspx",
  agora: new Date("2026-09-02T00:00:00Z"),
};

/**
 * The news listing template has NOT been captured yet — the notice pages already in
 * fixtures link to `listagem-noticias.aspx` and nowhere below it. So these tests
 * exercise the identification rule rather than claiming to exercise real markup.
 *
 * That is worth doing because the rule is deliberately template-independent: it keys
 * on the shape of the href, which a CMS reskin does not change. The URLs below are
 * real ones from the live site, not invented.
 */
const PAGINA = `
<html><body>
  <nav>
    <a href="/index.aspx">Início</a>
    <a href="https://www.fundoambiental.pt/listagem-noticias.aspx">Notícias</a>
    <a href="/apoios-2026/transicao-energetica1/032026-reforco.aspx">Aviso 03/2026</a>
  </nav>
  <ul>
    <li><a href="/listagem-noticias/aviso-de-abertura-de-concurso-n-02-2026-apoio-a-realizacao-de-investimentos.aspx">
      Aviso de Abertura de Concurso N.º 02 /2026 - «Apoio à realização de investimentos» - Segunda Republicação</a>
      <span>02-09-2026</span></li>
    <li><a href="/listagem-noticias/programa-de-apoio-a-edificios-mais-sustentaveis-2023-1-aviso-1-republicacao-.aspx">
      Programa de Apoio a Edifícios mais Sustentáveis 2023 (1º AVISO) - 1ª Republicação</a></li>
    <li><a href="/listagem-noticias/pagamentos-do-fundo-ambiental-abril-de-2025.aspx">
      Pagamentos do Fundo Ambiental - Abril de 2025</a></li>
    <li><a href="/listagem-noticias/pagamentos-do-fundo-ambiental-1-trimestre-de-2025.aspx">
      Pagamentos do Fundo Ambiental - 1.º Trimestre de 2025</a></li>
    <li><a href="/listagem-noticias/aviso-de-abertura-de-concurso-n-02-2026-apoio-a-realizacao-de-investimentos.aspx">
      Aviso de Abertura de Concurso N.º 02 /2026 - duplicado na paginação</a></li>
  </ul>
</body></html>`;

describe("extrair — notícias do Fundo Ambiental", () => {
  const candidatos = extrair(PAGINA, CTX);

  it("segue apenas ligações com a forma de notícia", () => {
    // The listing page links to itself and to notice pages; neither has the shape
    // `listagem-noticias/<slug>.aspx`, so neither may be followed.
    for (const c of candidatos) {
      expect(new URL(c.urlDetalhe).pathname).toMatch(/^\/listagem-noticias\/[^/]+\.aspx$/);
    }
    expect(candidatos.map((c) => c.titulo)).toEqual([
      expect.stringContaining("Aviso de Abertura de Concurso N.º 02 /2026"),
      expect.stringContaining("Edifícios mais Sustentáveis"),
    ]);
  });

  it("descarta os relatórios de pagamentos", () => {
    // Published monthly and quarterly, and never a funding opportunity. Left in,
    // they would be the largest single line on the extraction bill.
    expect(candidatos.some((c) => /pagamentos/i.test(c.titulo))).toBe(false);
  });

  it("não repete uma notícia ligada duas vezes", () => {
    const urls = candidatos.map((c) => c.urlCanonica);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("lê a referência legal a partir do título", () => {
    expect(candidatos[0]?.referenciaLegalBruta).toContain("02");
  });

  it("devolve zero na página de erro servida com HTTP 200", () => {
    const erro = "<html><head><title>Ocorreu um erro</title></head><body></body></html>";
    expect(extrair(erro, CTX)).toEqual([]);
  });
});
