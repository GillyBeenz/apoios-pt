import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ehPaginaDeErro, extrair } from "./extract.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const PERMANENTES = join(import.meta.dirname, "..", "comum", "fixtures-permanentes");
const ler = (f: string): string => readFileSync(join(FIXTURES, f), "utf8");
/**
 * Kept outside `fixtures/`, which the capture workflow wipes on every run. The site
 * only served this page while an entry URL was wrong; once that was fixed the next
 * capture deleted it, taking with it the only proof that the soft-404 detector works.
 */
const lerPermanente = (f: string): string => readFileSync(join(PERMANENTES, f), "utf8");

const CTX = {
  urlBase: "https://www.fundoambiental.pt/apoios-prr.aspx",
  agora: new Date("2026-09-02T00:00:00Z"),
};

/**
 * These run against markup captured from the live site by capturar-fixtures.yml,
 * not against anything invented. The first capture is what showed that the site has
 * no listing page at all — every page carries the same navigation tree — and that
 * the original selectors happily followed a video gallery and the 2017 archive.
 */
describe("extrair — markup real do Fundo Ambiental", () => {
  const html = ler("apoios-prr-bd213819af.html");
  const candidatos = extrair(html, CTX);

  it("reduz a árvore de navegação a avisos reais", () => {
    // ~546 anchors on the page; only the notice-shaped paths survive.
    expect(candidatos.length).toBeGreaterThanOrEqual(40);
    expect(candidatos.length).toBeLessThan(80);
  });

  it("encontra avisos do PRR e dos apoios do ano", () => {
    const caminhos = candidatos.map((c) => new URL(c.urlDetalhe).pathname);
    expect(caminhos.some((p) => p.includes("/apoios-prr/c13-eficiencia-energetica"))).toBe(true);
    expect(caminhos.some((p) => p.includes("/apoios-2026/"))).toBe(true);
  });

  /** The precise false positives the previous, keyword-based version followed. */
  it("já não segue galerias, formulários nem o arquivo de 2017", () => {
    const urls = candidatos.map((c) => c.urlDetalhe);
    expect(urls.some((u) => u.includes("/comunicacao/"))).toBe(false);
    expect(urls.some((u) => u.includes("/candidaturas/formularios"))).toBe(false);
    expect(urls.some((u) => u.includes("/avisos-anteriores/"))).toBe(false);
    expect(urls.some((u) => u.includes("/balanco-fa/"))).toBe(false);
    expect(urls.some((u) => u.includes("/quem-somos/"))).toBe(false);
  });

  it("apanha a referência legal do texto da ligação", () => {
    const comRef = candidatos.filter((c) => c.referenciaLegalBruta !== null);
    // On the captured page 39 of 47 titles carry a reference; the rest are named
    // programmes with no notice number, which is legitimate.
    expect(comRef.length / candidatos.length).toBeGreaterThan(0.7);

    const oigp = candidatos.find((c) => c.titulo.includes("Criação de Novas OIGP"));
    expect(oigp?.referenciaLegalBruta).toContain("09/C08-i01.01/2026");
  });

  it("não repete o mesmo aviso", () => {
    const urls = candidatos.map((c) => c.urlCanonica);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("mantém-se no domínio da fonte", () => {
    for (const c of candidatos) {
      expect(new URL(c.urlDetalhe).hostname).toBe("www.fundoambiental.pt");
    }
  });
});

/**
 * The failure mode that would otherwise be invisible: the site answers a request for
 * a page that does not exist with HTTP 200 and a stable error page, so both the
 * status check and the content-hash change gate see a perfectly healthy source.
 */
describe("ehPaginaDeErro — o 404 disfarçado de 200", () => {
  const erro = lerPermanente("erro-aspx-200.html");

  it("reconhece a página de erro pelo conteúdo", () => {
    expect(ehPaginaDeErro(erro, "https://www.fundoambiental.pt/qualquer.aspx")).toBe(true);
  });

  it("reconhece-a pelo URL de redirecionamento", () => {
    expect(
      ehPaginaDeErro(
        "<html></html>",
        "https://www.fundoambiental.pt/wwwbase/raiz/Erro.aspx?aspxerrorpath=/avisos-2026.aspx",
      ),
    ).toBe(true);
  });

  it("não marca uma página boa como erro", () => {
    expect(ehPaginaDeErro(ler("apoios-prr-bd213819af.html"), CTX.urlBase)).toBe(false);
  });

  it("uma página de erro não produz candidatos", () => {
    expect(extrair(erro, CTX)).toEqual([]);
  });
});

describe("extrair — casos de fronteira", () => {
  it("devolve zero para uma página sem avisos, sem rebentar", () => {
    expect(extrair("<html><body><p>Manutenção.</p></body></html>", CTX)).toEqual([]);
  });

  it("ignora secções de documentação à mesma profundidade", () => {
    const html = `<html><body>
      <a href="apoios-prr/documentos-prr/documentacao-geral.aspx">Documentação PRR</a>
      <a href="apoios-prr/c13-eficiencia-energetica-em-edificios/09c13-i012025.aspx">09/C13-i01/2025 - Aviso</a>
    </body></html>`;
    const c = extrair(html, CTX);
    expect(c).toHaveLength(1);
    expect(c[0]?.titulo).toContain("09/C13-i01/2025");
  });
});
