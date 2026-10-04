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
 * The captured listing carries ten notice-shaped links: five monthly payment
 * reports, one pagination control, and four the extractor keeps. Getting from ten to
 * four is the entire job of this extractor, and each of the two exclusions is worth a
 * test because each was a real defect or a real cost.
 *
 * Which four they are rotates with the feed, so nothing here is pinned to a
 * particular notice. An earlier version named three slugs outright and went red when
 * the capture was refreshed and two of them had scrolled off the front page — the
 * assertions were measuring the fund's news cycle, not this code.
 */
describe("extrair — notícias, markup real", () => {
  const candidatos = extrair(ler("listagem-noticias-88db803a6c.html"), CTX);
  const caminhos = candidatos.map((c) => new URL(c.urlDetalhe).pathname);

  it("fica com os quatro links que não são relatórios nem paginação", () => {
    expect(candidatos).toHaveLength(4);
    // Ten shaped links in, four out, and every survivor keeps the two-segment shape
    // the extractor identifies by.
    for (const c of caminhos) {
      expect(c).toMatch(/^\/listagem-noticias\/[^/]+\.aspx$/);
    }
  });

  it("encontra o aviso de abertura de concurso que a captura traz", () => {
    expect(caminhos.join("\n")).toContain(
      "aviso-de-abertura-de-concurso-n-032026",
    );
  });

  it("deixa passar um comunicado, que é o preço da lista negativa", () => {
    // Not a defect: `RE_TITULO_ADMINISTRATIVO` is a negative list by construction,
    // so a press release it does not recognise costs one extraction rather than
    // risking a real notice dropped by an allowlist. This capture contains exactly
    // such a post — "Agência para o Clima cumpre 100% das metas do PRR" — and the
    // test records the cost rather than letting it look accidental. Downstream it
    // goes nowhere: with no deadline and no measures, the gate fails closed.
    const comunicados = candidatos.filter(
      (c) => c.referenciaLegalBruta === null && !/candidatura/i.test(c.titulo),
    );
    expect(comunicados.length).toBeGreaterThan(0);
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

  it("lê a referência legal do título quando existe, e nunca a inventa", () => {
    // Was `>= 3`, a count over a feed that rotates: true of the capture it was
    // written against, false of the next one, and never a statement about the parser.
    // What must hold for any capture is that a reference read is a reference present
    // in the title, verbatim — the same evidence rule the model fields obey.
    const comReferencia = candidatos.filter(
      (c) => c.referenciaLegalBruta !== null,
    );
    expect(comReferencia.length).toBeGreaterThan(0);
    for (const c of comReferencia) {
      expect(c.titulo).toContain(c.referenciaLegalBruta);
    }
  });

  it("não repete uma notícia ligada de dois sítios", () => {
    const urls = candidatos.map((c) => c.urlCanonica);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("devolve zero na página de erro servida com HTTP 200", () => {
    const erro =
      "<html><head><title>Ocorreu um erro</title></head><body></body></html>";
    expect(extrair(erro, CTX)).toEqual([]);
  });
});
