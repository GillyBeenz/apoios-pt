import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { textoDoPdf } from "./pdf.ts";
import { comecaPorPdf, textoDoDocumento, textoVisivel } from "./texto.ts";

const AVISO_PDF = new URL(
  "../sources/comum/fixtures-permanentes/pt2030-aviso-lisboa2030-2023-12-alteracao.pdf",
  import.meta.url,
);

describe("textoDoDocumento", () => {
  it("lê um PDF pelos bytes mágicos, sem precisar do content_type", () => {
    // `content_type` nunca foi escrito em nenhum snapshot — nulo nos 353 — por
    // isso decidir por ele seria decidir por nada.
    const bytes = new Uint8Array(readFileSync(AVISO_PDF));
    expect(comecaPorPdf(bytes)).toBe(true);
    const texto = textoDoDocumento(bytes);
    expect(texto).toContain("LISBOA2030-2023-12");
    expect(texto).toContain("ALTERAÇÃO DO AVISO");
  });

  it("tira as tags de um corpo HTML guardado em bruto", () => {
    const html = "<html><body><p>Prazo: 30 dias</p><script>x()</script></body></html>";
    const bytes = new TextEncoder().encode(html);
    expect(comecaPorPdf(bytes)).toBe(false);
    expect(textoDoDocumento(bytes)).toBe("Prazo: 30 dias");
  });

  it("não estraga o texto já derivado que um snapshot sem bytes guardou", () => {
    // O `guardarSnapshot` recebe `resposta.bytes ?? encode(texto)`, por isso uma
    // fonte cujo buscador não devolveu bytes tem no snapshot o texto visível já
    // derivado. Correr `textoVisivel` outra vez sobre a sua própria saída tem de
    // ser inofensivo — é a afirmação em que o módulo se apoia para ter um só
    // caminho em vez de uma heurística.
    const original = textoVisivel(
      "<p>Aviso n.&ordm; 03/2026 &mdash; prazo 31/12/2026</p>",
    );
    expect(textoDoDocumento(new TextEncoder().encode(original))).toBe(original);
  });

  it("devolve vazio sem bytes, que é uma resposta e não um erro", () => {
    expect(textoDoDocumento(null)).toBe("");
    expect(textoDoDocumento(new Uint8Array())).toBe("");
  });

  it("dá exactamente o que o pipeline deu ao modelo", () => {
    // O ponto do módulo, e tem de ser afirmado contra o outro caminho e não
    // contra ele mesmo. O pipeline chama `textoDoPdf(bytes)` para um PDF; se
    // estes dois divergirem, uma citação verificada numa corrida deixa de o ser
    // na outra — que é a avaria que custou 123 de 123 extracções as suas provas.
    const bytes = new Uint8Array(readFileSync(AVISO_PDF));
    expect(textoDoDocumento(bytes)).toBe(textoDoPdf(bytes));
  });
});
