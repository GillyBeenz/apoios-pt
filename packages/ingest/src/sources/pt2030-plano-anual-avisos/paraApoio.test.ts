import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizarUrl, construirChaves } from "@apoios/core";
import { lerPlanoAnual } from "./folha.ts";
import { avisoPrevistoParaApoio, urlDoAviso } from "./paraApoio.ts";
import { pt2030PlanoAnualAvisos } from "./index.ts";

const FICHEIRO = join(
  import.meta.dirname,
  "fixtures",
  "PlanoAnualAvisos-download-052026-b402e08542.xlsx",
);
const bytes = new Uint8Array(readFileSync(FICHEIRO));
const URL_PLANO = "https://portugal2030.pt/plano-anual-de-avisos/";
const OPCOES = { urlPlano: URL_PLANO, entidade: "Agência para o Desenvolvimento e Coesão" };

const apoios = lerPlanoAnual(bytes).map((a) => avisoPrevistoParaApoio(a, OPCOES));

describe("avisoPrevistoParaApoio", () => {
  it("lê o plano inteiro", () => {
    expect(apoios.length).toBeGreaterThan(200);
  });

  /**
   * The bug this file exists to prevent.
   *
   * Identity keys on the canonical URL, and every row of the plan comes from one
   * page. Sharing it would make all 211 planned notices resolve to the *same*
   * fund: the catalogue would show one row, 210 would be lost, and nothing
   * downstream would report it — a merge is indistinguishable from an update.
   */
  it("dá a cada aviso uma identidade própria", () => {
    const canonicas = new Set(apoios.map((a) => canonicalizarUrl(a.urlOficial)));
    expect(canonicas.size).toBe(apoios.length);

    const chaves = new Set(
      apoios.map(
        (a) =>
          construirChaves({
            sourceId: "pt2030-plano-anual-avisos",
            referenciaLegal: a.referenciaLegal,
            url: a.urlOficial,
            titulo: a.titulo,
            anoAbertura: a.abreEm.iso
              ? new Date(a.abreEm.iso).getUTCFullYear()
              : null,
          }).find((c) => c.tipo === "url_canonica")?.valor,
      ),
    );
    expect(chaves.size).toBe(apoios.length);
  });

  it("liga sempre à página autoritativa", () => {
    expect(urlDoAviso(URL_PLANO, "X-1")).toContain(URL_PLANO);
    for (const a of apoios) {
      expect(a.urlOficial.startsWith(URL_PLANO)).toBe(true);
    }
  });

  /**
   * A plan says when a notice is *expected* to open, never that it opened. Those
   * are different claims, and the second is the one that sends somebody to a page
   * that does not exist yet.
   */
  it("nunca se declara aberto, mesmo com a data de abertura já passada", () => {
    expect(apoios.every((a) => a.estado === "previsto")).toBe(true);
    // The fixture plans 211 notices opening between 2026-05-01 and 2027-04-01, so
    // this cut sits inside its range and the filter is never empty. Tied to the
    // committed fixture rather than to the wall clock, which would make the test
    // change meaning as time passed.
    const jaDeviaTerAberto = apoios.filter(
      (a) => a.abreEm.iso !== null && a.abreEm.iso < "2026-09-01",
    );
    expect(jaDeviaTerAberto.length).toBeGreaterThan(0);
    expect(jaDeviaTerAberto.every((a) => a.estado === "previsto")).toBe(true);
  });

  /**
   * The plan's entity-type column separates public bodies from private ones and
   * says nothing about pessoas singulares. Nothing here may reach an inbox on the
   * strength of that.
   */
  it("nunca é alertável a partir do plano", () => {
    expect(apoios.some((a) => a.admiteParticulares === "sim")).toBe(false);
    expect(apoios.every((a) => a.alertavel === false)).toBe(true);
    expect(apoios.every((a) => a.needsReview)).toBe(true);
  });

  it("não inventa medidas que a folha não tem", () => {
    expect(apoios.every((a) => a.medidas.length === 0)).toBe(true);
    expect(apoios.every((a) => a.medidasPorClassificar.length === 0)).toBe(true);
  });

  it("não põe texto-fonte numa data que veio de um número", () => {
    expect(apoios.every((a) => a.abreEm.textoFonte === null)).toBe(true);
    expect(apoios.every((a) => a.fechaEm.textoFonte === null)).toBe(true);
  });

  it("é publicável, que é o ponto de o ler", () => {
    expect(apoios.every((a) => a.publicado)).toBe(true);
  });
});

describe("a fonte expõe o leitor", () => {
  /** The wiring that was missing: the parser existed and nothing called it. */
  it("lerDataset está ligado e devolve o plano inteiro", () => {
    expect(pt2030PlanoAnualAvisos.lerDataset).toBeDefined();
    const lidos = pt2030PlanoAnualAvisos.lerDataset!(bytes, {
      urlOrigem: URL_PLANO,
      entidade: "Agência para o Desenvolvimento e Coesão",
    });
    expect(lidos.length).toBe(apoios.length);
  });
});
