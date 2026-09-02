import { describe, expect, it } from "vitest";
import { classificar } from "./classificar.ts";

/**
 * The case that motivated this: the Plano Anual de Avisos is a spreadsheet, and the
 * capture script used to UTF-8 decode anything that was not a PDF. That produces a
 * file which still diffs as text and is unopenable — the worst kind of breakage,
 * because nothing fails.
 */
describe("classificar", () => {
  it("trata folhas de cálculo como binário", () => {
    for (const [url, ct] of [
      ["https://portugal2030.pt/wp-content/uploads/PAA_2026.xlsx", null],
      ["https://portugal2030.pt/ficheiro", "application/vnd.ms-excel"],
      [
        "https://portugal2030.pt/ficheiro",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      ["https://portugal2030.pt/plano.ods", null],
    ] as const) {
      const r = classificar(url, ct);
      expect(r.binario, `${url} ${ct}`).toBe(true);
    }
  });

  it("mantém a extensão que o servidor serviu", () => {
    expect(classificar("https://x.pt/a/plano.ods", null).extensao).toBe(".ods");
    expect(classificar("https://x.pt/a/plano.xlsx", null).extensao).toBe(".xlsx");
    expect(
      classificar("https://recuperarportugal.gov.pt/wp-content/uploads/ap/plano-de-avisos.pdf", null)
        .extensao,
    ).toBe(".pdf");
  });

  it("classifica PDF pelo content-type mesmo sem extensão no caminho", () => {
    const r = classificar("https://x.pt/download?id=42", "application/pdf");
    expect(r).toEqual({ binario: true, extensao: ".pdf" });
  });

  it("trata CSV como texto mas não o normaliza", () => {
    // Stripping viewstate fields out of a CSV would corrupt rows silently.
    const r = classificar("https://x.pt/dados.csv", "text/csv");
    expect(r.binario).toBe(false);
    expect(r.normalizar).toBe(false);
  });

  it("trata HTML como texto normalizável", () => {
    const r = classificar("https://www.fundoambiental.pt/apoios-2026.aspx", "text/html; charset=utf-8");
    expect(r).toEqual({ binario: false, extensao: ".html", normalizar: true });
  });

  it("assume HTML quando o servidor não diz nada útil", () => {
    // The ASP.NET sources routinely omit a usable content-type on .aspx.
    expect(classificar("https://www.fundoambiental.pt/apoios-prr.aspx", null).binario).toBe(false);
  });
});
