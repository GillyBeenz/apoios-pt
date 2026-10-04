import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ficheiroDaFixture } from "../teste/fixtures.ts";
import {
  dataDeSerieExcel,
  elegibilidadeDe,
  lerPlanoAnual,
  mesesDoQuadrimestre,
} from "./folha.ts";

const FICHEIRO = ficheiroDaFixture(
  join(import.meta.dirname, "fixtures"),
  /PlanoAnualAvisos.*\.xlsx$/i,
);
const bytes = new Uint8Array(readFileSync(FICHEIRO));

/**
 * Data rows in the sheet, read from the XLSX rather than from the reader under test.
 *
 * Deliberately a second, dumber path to the same number: if `lerPlanoAnual` ever
 * starts skipping rows, a test that counted with `lerPlanoAnual` would move its own
 * goalposts and stay green.
 */
function linhasDeDadosDaFolha(xlsx: Uint8Array): number {
  const zip = unzipSync(xlsx);
  const nome = Object.keys(zip).find((n) =>
    /xl\/worksheets\/sheet1\.xml$/.test(n),
  );
  if (nome === undefined) throw new Error("a folha não tem sheet1.xml");
  const linhas = strFromU8(zip[nome]!).match(/<row[ >]/g)?.length ?? 0;
  // Two header rows: a title band above the column names.
  return linhas - 2;
}

describe("dataDeSerieExcel", () => {
  it("descodifica as datas reais do plano", () => {
    expect(dataDeSerieExcel(46272)).toBe("2026-09-07");
    expect(dataDeSerieExcel(46507)).toBe("2027-04-30");
  });

  it("acerta dos dois lados do 29 de Fevereiro de 1900 que nunca existiu", () => {
    // Excel's leap-year bug moves the epoch: serial 1 is 1900-01-01, but from 61 on
    // every real date sits one day later than a single-epoch calculation gives. The
    // usual shortcut ignores this; it happens to be right for 2026 and wrong here.
    expect(dataDeSerieExcel(1)).toBe("1900-01-01");
    expect(dataDeSerieExcel(59)).toBe("1900-02-28");
    expect(dataDeSerieExcel(61)).toBe("1900-03-01");
  });
});

describe("mesesDoQuadrimestre", () => {
  it("trata o quadrimestre como quatro meses, não três", () => {
    // The values read Q1/Q2/Q3 and look exactly like calendar quarters. Reading Q2
    // as April–June instead of May–August puts a notice two months early.
    expect(mesesDoQuadrimestre("Q1")).toEqual({ primeiro: 1, ultimo: 4 });
    expect(mesesDoQuadrimestre("Q2")).toEqual({ primeiro: 5, ultimo: 8 });
    expect(mesesDoQuadrimestre("Q3")).toEqual({ primeiro: 9, ultimo: 12 });
  });

  it("recusa um Q4, que num quadrimestre não existe", () => {
    expect(mesesDoQuadrimestre("Q4")).toBeNull();
    expect(mesesDoQuadrimestre("")).toBeNull();
  });
});

describe("elegibilidadeDe", () => {
  it("falha fechada", () => {
    expect(elegibilidadeDe("Pública").admiteParticulares).toBe("nao");
    // "Entidade privada" is an organisation. Whether a given programme's private
    // category reaches a sole trader is settled by the notice, not by this sheet —
    // so it is `desconhecido`, which blocks alerts exactly as `nao` does.
    expect(elegibilidadeDe("Privada").admiteParticulares).toBe("desconhecido");
    expect(elegibilidadeDe("Pública | Privada").admiteParticulares).toBe(
      "desconhecido",
    );
    expect(elegibilidadeDe("").admiteParticulares).toBe("desconhecido");
  });

  it("nunca devolve sim", () => {
    for (const t of [
      "Pública",
      "Privada",
      "Pública | Privada",
      "qualquer coisa",
      "",
    ]) {
      expect(elegibilidadeDe(t).admiteParticulares).not.toBe("sim");
    }
  });
});

describe("lerPlanoAnual — folha real", () => {
  const avisos = lerPlanoAnual(bytes);

  /**
   * Counted against the sheet itself, not against a number written down here.
   *
   * This assertion used to read `toHaveLength(211)`, which was measured from the
   * May 2026 capture and became false the moment the plan was republished for
   * September — and because a sibling test still named the old file, the suite
   * failed with ENOENT and never got as far as saying so. One row of the sheet
   * must become one planned notice; how many rows there are is the plan's
   * business, not this test's.
   */
  it("lê um aviso previsto por cada linha de dados da folha", () => {
    expect(avisos).toHaveLength(linhasDeDadosDaFolha(bytes));
    expect(avisos.every((a) => a.titulo.length > 0 && a.id.length > 0)).toBe(
      true,
    );
  });

  it("NENHUM aviso previsto admite particulares", () => {
    // The finding that decides what this source is for. Every row is Pública or
    // Privada — private *entities*, not citizens — including the housing rows, which
    // are municipal social housing. Correctly gated, this source can populate the
    // catalogue and can never produce a homeowner alert. If this ever fails, the plan
    // has genuinely changed and the product gained a real feature.
    expect(avisos.filter((a) => a.admiteParticulares === "sim")).toHaveLength(
      0,
    );
  });

  it("traz datas de abertura com a precisão colada", () => {
    expect(avisos.every((a) => a.abreEm !== null)).toBe(true);
    for (const a of avisos) {
      if (a.abreEm !== null) expect(a.abreEmPrecisao).not.toBe("desconhecida");
    }
    // The plan covers the year ahead, not the past.
    const datas = avisos.map((a) => a.abreEm!).sort();
    expect(datas[0]).toMatch(/^2026-/);
    expect(datas.at(-1)!.slice(0, 4) >= "2026").toBe(true);
  });

  it("lê a dotação como número", () => {
    const comDotacao = avisos.filter((a) => a.dotacaoEur !== null);
    expect(comDotacao.length).toBeGreaterThan(150);
    expect(comDotacao.every((a) => Number.isInteger(a.dotacaoEur))).toBe(true);
  });

  it("separa as regiões NUTS II", () => {
    const multiRegiao = avisos.filter((a) => a.regioes.length > 1);
    expect(multiRegiao.length).toBeGreaterThan(0);
    expect(avisos.every((a) => a.regioes.every((r) => !r.includes("|")))).toBe(
      true,
    );
  });

  it("localiza o cabeçalho pelo nome, não pela posição", () => {
    // The file opens with a banner row; a future revision may add another. Finding
    // the header by its contents is what stops that silently shifting every column.
    expect(avisos[0]?.programa).toBeTruthy();
    expect(avisos[0]?.titulo).not.toContain("Designacao");
  });
});
