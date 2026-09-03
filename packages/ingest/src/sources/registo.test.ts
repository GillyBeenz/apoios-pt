import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FONTES, FONTES_ACTIVAS, obterFonte } from "./registo.ts";

const RAIZ_FONTES = import.meta.dirname;
const AGORA = new Date("2026-09-03T00:00:00Z");

describe("registo de fontes", () => {
  it("não repete ids", () => {
    const ids = FONTES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("só ingere fontes verificadas contra markup real", () => {
    // The whole point of the `estado` flag. A stub extractor returning zero
    // candidates and a live source whose selectors just broke look identical from
    // the outside; only this keeps the pipeline from confusing them.
    for (const f of FONTES_ACTIVAS) expect(f.estado).toBe("activa");

    // Stated as an invariant rather than a hard-coded list, so promoting a source
    // does not mean editing an assertion that says nothing about why.
    //
    // And the invariant is the demanding one: an active source must actually PRODUCE
    // its health floor from its own captured entry page. Merely owning a fixtures
    // directory would not do — pt2030-avisos has captured markup and a stub
    // extractor, and would sail through that weaker check.
    for (const f of FONTES_ACTIVAS) {
      const dir = join(RAIZ_FONTES, f.id, "fixtures");
      expect(existsSync(dir), `${f.id} está activa sem fixtures capturadas`).toBe(true);

      const manifesto = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const entradas: { url: string; ficheiro: string }[] = manifesto.entradas ?? [];

      let melhor = 0;
      for (const url of f.urlsEntrada) {
        const entrada = entradas.find((e) => e.url === url);
        if (entrada === undefined || !/\.html$/i.test(entrada.ficheiro)) continue;
        const html = readFileSync(join(dir, entrada.ficheiro), "utf8");
        const n = f.extrair(html, { urlBase: url, agora: AGORA }).length;
        melhor = Math.max(melhor, n);
      }

      expect(melhor, `${f.id}: o extractor devolve ${melhor} da sua própria captura`)
        .toBeGreaterThanOrEqual(f.candidatosMin);
    }
  });

  it("exige um piso de saúde a quem está activa, e nenhum a quem não está", () => {
    for (const f of FONTES) {
      if (f.estado === "activa") {
        // On a listing, a floor of 1 cannot detect a partial break — a collapse from
        // forty entries to one would pass — so it has to be higher. A dataset source
        // is different in kind: it expects a single file, and 1 genuinely means "the
        // download link is still there".
        expect(f.candidatosMin, f.id).toBeGreaterThan(f.tipo === "dataset" ? 0 : 1);
      } else {
        // Any other number would be invented rather than measured.
        expect(f.candidatosMin, f.id).toBe(0);
      }
    }
  });

  it("tem urls de entrada absolutas e em https, dentro do próprio domínio", () => {
    for (const f of FONTES) {
      expect(f.urlsEntrada.length, f.id).toBeGreaterThan(0);
      const base = new URL(f.urlBase).hostname.replace(/^www\./, "");
      for (const u of f.urlsEntrada) {
        const url = new URL(u);
        expect(url.protocol, `${f.id} ${u}`).toBe("https:");
        expect(url.hostname.replace(/^www\./, ""), `${f.id} ${u}`).toBe(base);
      }
    }
  });

  it("resolve fontes por id", () => {
    expect(obterFonte("fundo-ambiental-aac")?.nome).toContain("Fundo Ambiental");
    expect(obterFonte("nao-existe")).toBeUndefined();
  });

  it("mantém uma cadência plausível", () => {
    for (const f of FONTES) {
      expect(f.cadenciaHoras, f.id).toBeGreaterThanOrEqual(1);
      expect(f.cadenciaHoras, f.id).toBeLessThanOrEqual(24 * 7);
    }
  });
});
