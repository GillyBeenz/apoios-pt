import { describe, expect, it } from "vitest";
import { FONTES, FONTES_ACTIVAS, obterFonte } from "./registo.ts";

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
    expect(FONTES_ACTIVAS.map((f) => f.id)).toEqual(["fundo-ambiental-aac"]);
  });

  it("exige um piso de saúde a quem está activa, e nenhum a quem não está", () => {
    for (const f of FONTES) {
      if (f.estado === "activa") {
        // A floor of 0 or 1 cannot detect a partial break, which is the failure
        // mode that actually happens.
        expect(f.candidatosMin, f.id).toBeGreaterThan(1);
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
