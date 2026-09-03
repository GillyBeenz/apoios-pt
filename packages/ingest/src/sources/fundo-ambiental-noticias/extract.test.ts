import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extrair } from "./extract.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const ler = (f: string): string => readFileSync(join(FIXTURES, f), "utf8");

const CTX = {
  urlBase: "https://www.fundoambiental.pt/listagem-noticias.aspx",
  agora: new Date("2026-09-03T00:00:00Z"),
};

/**
 * Against markup captured from the live site, not anything invented.
 *
 * The captured listing carries ten notice-shaped links: four real notices, five
 * monthly payment reports, and one pagination control. Getting from ten to four is
 * the entire job of this extractor, and each of the two exclusions is worth a test
 * because each was a real defect or a real cost.
 */
describe("extrair — notícias, markup real", () => {
  const candidatos = extrair(ler("listagem-noticias-88db803a6c.html"), CTX);
  const caminhos = candidatos.map((c) => new URL(c.urlDetalhe).pathname);

  it("encontra as notícias de avisos reais", () => {
    expect(candidatos).toHaveLength(4);
    expect(caminhos.join("\n")).toContain("aviso-de-abertura-de-concurso-n-032026");
    expect(caminhos.join("\n")).toContain("fundo-azul-aviso-convite-n-01faz2026");
    expect(caminhos.join("\n")).toContain("aviso-convite-n-09c08-i01012026");
  });

  it("não segue a paginação", () => {
    // `listagem-noticias/0.aspx` has exactly the shape of a notice URL. Followed, it
    // would spend a paid extraction on a listing page.
    expect(caminhos).not.toContain("/listagem-noticias/0.aspx");
  });

  it("descarta os relatórios de pagamentos", () => {
    // Five of the ten links on this page — published monthly, never a funding
    // opportunity, and the single largest avoidable line on the extraction bill.
    expect(caminhos.join("\n")).not.toMatch(/pagamentos/i);
  });

  it("lê a referência legal do título quando existe", () => {
    const comReferencia = candidatos.filter((c) => c.referenciaLegalBruta !== null);
    expect(comReferencia.length).toBeGreaterThanOrEqual(3);
  });

  it("não repete uma notícia ligada de dois sítios", () => {
    const urls = candidatos.map((c) => c.urlCanonica);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("devolve zero na página de erro servida com HTTP 200", () => {
    const erro = "<html><head><title>Ocorreu um erro</title></head><body></body></html>";
    expect(extrair(erro, CTX)).toEqual([]);
  });
});
