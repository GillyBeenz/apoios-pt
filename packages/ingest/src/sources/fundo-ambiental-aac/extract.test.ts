import { describe, expect, it } from "vitest";
import { extrair } from "./extract.ts";

const CTX = { urlBase: "https://www.fundoambiental.pt", agora: new Date("2026-08-27T00:00:00Z") };

/**
 * Synthetic markup standing in for the real listing until fixtures land.
 *
 * This environment cannot reach fundoambiental.pt, so these cases pin the
 * *behaviour* we want — on-domain notice links found, furniture ignored, references
 * and dates picked up — rather than the site's actual class names. When
 * `capturar-fixtures.yml` commits real HTML, a fixture case joins these and the
 * selectors get tightened against it.
 */
const LISTAGEM = `<!DOCTYPE html><html><body>
  <nav><a href="/">Início</a><a href="/contactos.aspx">Contactos</a></nav>
  <div class="listagem">
    <article>
      <h3><a href="/avisos/aviso-02-2026.aspx">Aviso de Abertura de Concurso n.º 02/2026 — Eficiência energética</a></h3>
      <span class="data">Candidaturas até 30/09/2026</span>
    </article>
    <article>
      <h3><a href="/avisos/aviso-04-2026.pdf">Aviso n.º 04/2026 — Floresta Azul</a></h3>
      <span class="data">15 de julho de 2026</span>
    </article>
    <article>
      <h3><a href="https://outro-portal.gov.pt/aviso.aspx">Aviso externo n.º 09/2026</a></h3>
    </article>
  </div>
  <footer><a href="/privacidade.aspx">Política de privacidade</a></footer>
</body></html>`;

describe("extrair — listagem do Fundo Ambiental", () => {
  it("encontra os avisos do próprio domínio", () => {
    const candidatos = extrair(LISTAGEM, CTX);
    expect(candidatos.map((c) => c.urlDetalhe)).toEqual([
      "https://www.fundoambiental.pt/avisos/aviso-02-2026.aspx",
      "https://www.fundoambiental.pt/avisos/aviso-04-2026.pdf",
    ]);
  });

  it("ignora navegação, rodapé e ligações para fora", () => {
    const urls = extrair(LISTAGEM, CTX).map((c) => c.urlDetalhe);
    expect(urls.some((u) => u.includes("contactos"))).toBe(false);
    expect(urls.some((u) => u.includes("privacidade"))).toBe(false);
    // An off-domain notice is a different source's problem, not a duplicate here.
    expect(urls.some((u) => u.includes("outro-portal"))).toBe(false);
  });

  it("apanha a referência legal e a data em bruto", () => {
    const [primeiro] = extrair(LISTAGEM, CTX);
    expect(primeiro?.referenciaLegalBruta).toMatch(/02\/2026/);
    expect(primeiro?.dataBruta).toBe("30/09/2026");
  });

  it("distingue PDFs de páginas", () => {
    const candidatos = extrair(LISTAGEM, CTX);
    expect(candidatos[0]?.tipoDocumento).toBe("html");
    expect(candidatos[1]?.tipoDocumento).toBe("pdf");
  });

  it("não duplica quando o mesmo aviso é ligado duas vezes", () => {
    const duplicado = LISTAGEM.replace(
      "</div>\n  <footer>",
      `<article><a href="/avisos/aviso-02-2026.aspx?utm_source=news">Aviso n.º 02/2026 — Eficiência energética</a></article></div>\n  <footer>`,
    );
    const candidatos = extrair(duplicado, CTX);
    expect(candidatos.filter((c) => c.urlDetalhe.includes("aviso-02-2026"))).toHaveLength(1);
  });

  it("recorre a varrer âncoras quando a estrutura é desconhecida", () => {
    // Layer 2: markup we did not anticipate must still yield candidates rather
    // than silently returning zero, which is the failure mode that stops alerts.
    const inesperada = `<html><body>
      <span><a href="/avisos/aviso-07-2026.aspx">Aviso n.º 07/2026 — Bombas de calor</a></span>
    </body></html>`;
    expect(extrair(inesperada, CTX)).toHaveLength(1);
  });

  it("devolve zero para uma página sem avisos, sem rebentar", () => {
    expect(extrair("<html><body><p>Página em manutenção.</p></body></html>", CTX)).toEqual([]);
  });
});
