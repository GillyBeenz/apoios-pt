import { describe, expect, it } from "vitest";
import { hashConteudo, normalizarConteudo } from "./normalizar.ts";

/** A page whose only difference between fetches is the ASP.NET viewstate. */
function paginaComViewstate(viewstate: string, conteudo = "Aviso n.º 02/2026"): string {
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
    const b = paginaComViewstate("ZZZZbXl0aGVyc3RhdGV2YWx1ZQ==BBBB".repeat(200));
    expect(hashConteudo(a)).toBe(hashConteudo(b));
  });

  it("continua a detetar uma mudança real de conteúdo", () => {
    const a = paginaComViewstate("XXXX", "Aviso n.º 02/2026 — candidaturas até 30/09/2026");
    const b = paginaComViewstate("XXXX", "Aviso n.º 02/2026 — candidaturas até 31/10/2026");
    expect(hashConteudo(a)).not.toBe(hashConteudo(b));
  });

  it("ignora diferenças só de espaçamento", () => {
    expect(hashConteudo("<div>  a\n\n  b </div>")).toBe(hashConteudo("<div> a b </div>"));
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
