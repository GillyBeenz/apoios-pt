import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extrair } from "./extract.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const ler = (f: string): string => readFileSync(join(FIXTURES, f), "utf8");

const CTX = {
  urlBase: "https://portugal2030.pt/category/avisos/",
  agora: new Date("2026-09-03T00:00:00Z"),
};

/**
 * Against the captured archive page. It carries eleven date-permalink links: six in
 * the archive proper and five in a "latest posts" sidebar that has nothing to do with
 * notices. Telling those apart is the whole job.
 */
describe("extrair — avisos do Portugal 2030, markup real", () => {
  const html = ler("pagina-8cd26ea7bb.html");
  const candidatos = extrair(html, CTX);

  it("encontra os avisos do arquivo", () => {
    expect(candidatos).toHaveLength(6);
    for (const c of candidatos) {
      expect(new URL(c.urlDetalhe).pathname).toMatch(/^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/);
    }
  });

  it("ignora a barra lateral de notícias recentes", () => {
    // Same URL shape, different container, not a notice. No path rule can separate
    // these — only the container can.
    const titulos = candidatos.map((c) => c.titulo).join("\n");
    expect(titulos).not.toContain("Portugal consolida a sua posição");
    expect(titulos).not.toContain("Cursos técnicos superiores profissionais");
  });

  it("não segue a paginação nem o feed", () => {
    const caminhos = candidatos.map((c) => new URL(c.urlDetalhe).pathname);
    expect(caminhos).not.toContain("/category/avisos/page/2/");
    expect(caminhos.join("\n")).not.toContain("/feed/");
  });

  it("lê a data de publicação como pista, não como prazo", () => {
    // "Ago 10, 2026" is when the notice was announced. The deadline comes from the
    // notice itself; presenting a publication date as a deadline would be exactly
    // the confident wrongness this product exists to avoid.
    const comData = candidatos.filter((c) => c.dataBruta !== null);
    expect(comData.length).toBe(6);
    expect(comData[0]?.dataBruta).toMatch(/^\w{3}\s+\d{1,2},?\s+\d{4}$/);
  });

  it("não inventa uma referência legal a partir do título", () => {
    // Portugal 2030 keeps the reference inside the notice, not in the archive title.
    expect(candidatos.every((c) => c.referenciaLegalBruta === null)).toBe(true);
  });

  it("devolve zero se o contentor do arquivo desaparecer", () => {
    // A theme change must fail loudly into the health floor rather than quietly
    // harvesting whatever else is on the page.
    const semArtigos = html.replace(/et_pb_post/g, "tema-novo");
    expect(extrair(semArtigos, CTX)).toEqual([]);
  });
});
