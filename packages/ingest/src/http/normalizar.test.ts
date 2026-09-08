import { describe, expect, it } from "vitest";
import {
  decodificarEntidades,
  hashConteudo,
  normalizarConteudo,
} from "./normalizar.ts";

/** A page whose only difference between fetches is the ASP.NET viewstate. */
function paginaComViewstate(
  viewstate: string,
  conteudo = "Aviso n.º 02/2026",
): string {
  return `<!DOCTYPE html><html><body>
    <form method="post">
      <input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="${viewstate}" />
      <input type="hidden" name="__VIEWSTATEGENERATOR" value="${viewstate.slice(0, 8)}" />
      <input type="hidden" name="__EVENTVALIDATION" value="${viewstate.slice(0, 20)}" />
    </form>
    <div class="aviso">${conteudo}</div>
  </body></html>`;
}

describe("normalizarConteudo", () => {
  /**
   * The single most expensive bug this codebase could have. fundoambiental.pt is
   * ASP.NET WebForms and regenerates __VIEWSTATE on every response — often 100 KB+
   * of base64. Hashing it makes every fetch look changed, so every notice gets
   * re-extracted every run: no new information, and roughly $600/month instead of $30.
   */
  it("dá o mesmo hash quando só o __VIEWSTATE roda", () => {
    const a = paginaComViewstate("dDwtMTUyNDU0MTkwMTs7Pg==AAAA".repeat(200));
    const b = paginaComViewstate(
      "ZZZZbXl0aGVyc3RhdGV2YWx1ZQ==BBBB".repeat(200),
    );
    expect(hashConteudo(a)).toBe(hashConteudo(b));
  });

  it("continua a detetar uma mudança real de conteúdo", () => {
    const a = paginaComViewstate(
      "XXXX",
      "Aviso n.º 02/2026 — candidaturas até 30/09/2026",
    );
    const b = paginaComViewstate(
      "XXXX",
      "Aviso n.º 02/2026 — candidaturas até 31/10/2026",
    );
    expect(hashConteudo(a)).not.toBe(hashConteudo(b));
  });

  it("ignora diferenças só de espaçamento", () => {
    expect(hashConteudo("<div>  a\n\n  b </div>")).toBe(
      hashConteudo("<div> a b </div>"),
    );
  });

  it("ignora tokens anti-CSRF e sessões", () => {
    const a = '<input name="__RequestVerificationToken" value="abc123" />';
    const b = '<input name="__RequestVerificationToken" value="zyx987" />';
    expect(hashConteudo(a)).toBe(hashConteudo(b));
  });

  it("ignora carimbos de última atualização gerados pelo servidor", () => {
    const a = "<p>Última atualização: 27-08-2026 14:31</p>";
    const b = "<p>Última atualização: 28-08-2026 09:02</p>";
    expect(hashConteudo(a)).toBe(hashConteudo(b));
  });

  it("ignora query strings de cache-busting em assets", () => {
    const a = '<script src="/js/app.js?v=1724781234"></script>';
    const b = '<script src="/js/app.js?v=1799999999"></script>';
    expect(hashConteudo(a)).toBe(hashConteudo(b));
  });

  it("encolhe drasticamente o tamanho, que é o que torna as fixtures commitáveis", () => {
    const grande = paginaComViewstate("A".repeat(120_000));
    expect(normalizarConteudo(grande).length).toBeLessThan(grande.length / 10);
  });
});

/**
 * The bug that kept every extracted fund in the review queue.
 *
 * Execução #23 produced three real funds and `verificarProvas` rejected the
 * evidence for every field of all three. The quotes were honest: one Fundo
 * Ambiental page carries 2746 numeric entities against six `&nbsp;`, so the model
 * was handed `Refor&#231;o` and quoted `Reforço`. The gate was comparing against
 * text nobody could quote from.
 */
describe("decodificarEntidades", () => {
  it("decodifica entidades numéricas decimais", () => {
    expect(decodificarEntidades("Refor&#231;o da resili&#234;ncia")).toBe(
      "Reforço da resiliência",
    );
  });

  it("decodifica entidades hexadecimais", () => {
    expect(decodificarEntidades("&#xE7;&#xE3;o")).toBe("ção");
  });

  it("decodifica as nomeadas que estas páginas usam", () => {
    expect(decodificarEntidades("Aviso n.&ordm; 03/2026")).toBe(
      "Aviso n.º 03/2026",
    );
    expect(decodificarEntidades("at&eacute; 15.000&euro;")).toBe("até 15.000€");
  });

  it("desfaz o &amp; por último", () => {
    // Decoding `&amp;` first would turn `&amp;#231;` into `ç`, inventing a
    // character the document never contained.
    expect(decodificarEntidades("&amp;#231;")).toBe("&#231;");
  });

  it("deixa em paz um & que não é entidade", () => {
    expect(decodificarEntidades("A & B, 50 % & mais")).toBe(
      "A & B, 50 % & mais",
    );
  });

  it("não estoira num código fora do intervalo", () => {
    expect(decodificarEntidades("&#1114112;")).toBe("");
    expect(() => decodificarEntidades("&#99999999999;")).not.toThrow();
  });

  it("torna a citação do modelo encontrável no texto de origem", () => {
    // The end-to-end shape of the failure: the model renders, we did not.
    const daPagina = decodificarEntidades(
      "O presente aviso-convite visa o refor&#231;o da resili&#234;ncia do sistema el&#233;trico.",
    );
    const citacaoDoModelo = "reforço da resiliência do sistema elétrico";
    expect(daPagina.toLowerCase()).toContain(citacaoDoModelo);
  });
});
