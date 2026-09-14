import { describe, expect, it } from "vitest";
import {
  canonicalizarUrl,
  construirChaves,
  resolverIdentidade,
  semelhancaTrigramas,
  type EntradaIdentidade,
} from "./identidade.ts";

const base: EntradaIdentidade = {
  sourceId: "fundo-ambiental-aac",
  referenciaLegal: "Aviso n.º 02/2026",
  url: "https://www.fundoambiental.pt/avisos/aviso-02-2026.aspx",
  titulo: "Apoio a painéis solares",
  anoAbertura: 2026,
};

describe("canonicalizarUrl", () => {
  it("colapsa variantes cosméticas do mesmo endereço", () => {
    const variantes = [
      "https://www.fundoambiental.pt/avisos/x.aspx",
      "http://fundoambiental.pt/avisos/x.aspx",
      "https://www.fundoambiental.pt/avisos/x.aspx#seccao",
      "https://www.fundoambiental.pt/avisos/x.aspx?utm_source=newsletter",
    ];
    expect(new Set(variantes.map(canonicalizarUrl)).size).toBe(1);
  });

  it("preserva parâmetros com significado", () => {
    expect(canonicalizarUrl("https://x.pt/a?id=7")).not.toBe(canonicalizarUrl("https://x.pt/a?id=8"));
  });
});

describe("construirChaves", () => {
  it("ordena as chaves da mais forte para a mais fraca", () => {
    const chaves = construirChaves(base);
    expect(chaves.map((c) => c.tipo)).toEqual(["referencia_legal", "url_canonica", "titulo_norm"]);
  });

  it("omite a referência legal quando o aviso não tem uma", () => {
    const chaves = construirChaves({ ...base, referenciaLegal: null });
    expect(chaves.map((c) => c.tipo)).toEqual(["url_canonica", "titulo_norm"]);
  });

  it("separa fontes diferentes com a mesma referência", () => {
    const a = construirChaves(base)[0]!;
    const b = construirChaves({ ...base, sourceId: "prr-avisos" })[0]!;
    expect(a.valor).not.toBe(b.valor);
  });
});

describe("resolverIdentidade — título fraco contra referência nova", () => {
  const chavesDe = (ref: string | null, url: string, titulo: string) =>
    construirChaves({
      sourceId: "pt2030-plano-anual-avisos",
      referenciaLegal: ref,
      url,
      titulo,
      anoAbertura: 2026,
    });

  /**
   * The plan lists the same programme once per region: same title, different
   * reference, different row. Nine of them were silently folded into seven
   * survivors — each merge overwriting a real planned notice with another one,
   * which downstream is indistinguishable from an ordinary update.
   */
  it("não funde dois avisos que só partilham o título", () => {
    // No reference: the plan's row id is a row id, and
    // `canonicalizarReferenciaLegal` rejects a bare number anyway. The URL is what
    // tells these two apart, which is exactly the case the rule has to cover.
    const primeiro = chavesDe(null, "https://p.pt/plano/?aviso=7914", "Medidas de adaptação");
    const segundo = chavesDe(null, "https://p.pt/plano/?aviso=8084", "Medidas de adaptação");

    const tituloDoPrimeiro = primeiro.find((c) => c.tipo === "titulo_norm")!;
    const tituloDoSegundo = segundo.find((c) => c.tipo === "titulo_norm")!;
    // Precondition: they really do collide on the weak key. Without this the test
    // could pass while proving nothing.
    expect(tituloDoSegundo.valor).toBe(tituloDoPrimeiro.valor);

    const registado = new Map([[tituloDoPrimeiro.valor, "fund-7914"]]);
    expect(
      resolverIdentidade(segundo, registado, { fundirPorTitulo: false }).tipo,
    ).toBe("novo");

    // And the listing behaviour is untouched by the same input.
    expect(resolverIdentidade(segundo, registado).tipo).toBe("existente");
  });

  /**
   * The counterpart, and the reason the rule is narrow: the same document
   * re-extracted later, this time yielding a reference it did not produce the
   * first time. The URL still matches, so it is one notice and must stay one.
   */
  it("continua a juntar o mesmo documento quando o URL bate certo", () => {
    const antes = chavesDe(null, "https://p.pt/aviso-x", "Apoio X");
    const depois = chavesDe("AVISO 3/2026", "https://p.pt/aviso-x", "Apoio X");

    const registado = new Map(antes.map((c) => [c.valor, "fund-x"]));
    const r = resolverIdentidade(depois, registado, { fundirPorTitulo: false });
    expect(r.tipo).toBe("existente");
    if (r.tipo !== "existente") throw new Error("unreachable");
    expect(r.fundId).toBe("fund-x");
    // The reference is new, so it is recorded and strengthens every future match.
    expect(r.chavesEmFalta.some((c) => c.tipo === "referencia_legal")).toBe(true);
  });

  /**
   * A title match still merges when the URL is the one already on file — the
   * ordinary case of seeing the same page again.
   */
  it("funde quando o título e o URL apontam ambos para o mesmo apoio", () => {
    const a = chavesDe(null, "https://p.pt/a", "Apoio igual");
    const registado = new Map(a.map((c) => [c.valor, "fund-a"]));
    expect(
      resolverIdentidade(a, registado, { fundirPorTitulo: false }).tipo,
    ).toBe("existente");
  });
});

describe("resolverIdentidade", () => {
  it("reconhece um aviso novo", () => {
    const r = resolverIdentidade(construirChaves(base), new Map());
    expect(r.tipo).toBe("novo");
  });

  it("mantém a identidade quando o URL do aviso muda", () => {
    // Day 1: seen at URL A, recorded under all three keys.
    const dia1 = construirChaves(base);
    const registo = new Map(dia1.map((c) => [c.valor, "fund-1"]));

    // Day 2: same notice, republished at a different URL.
    const dia2 = construirChaves({
      ...base,
      url: "https://www.fundoambiental.pt/avisos/2026/aviso-02-2026-republicado.aspx",
    });

    const r = resolverIdentidade(dia2, registo);
    expect(r.tipo).toBe("existente");
    if (r.tipo !== "existente") throw new Error("unreachable");
    expect(r.fundId).toBe("fund-1");
    // The new URL is recorded so the fund survives the *next* move too.
    expect(r.chavesEmFalta.map((c) => c.tipo)).toContain("url_canonica");
  });

  it("adquire a referência legal quando ela aparece mais tarde", () => {
    // First seen as a news item with no notice number.
    const semRef = construirChaves({ ...base, referenciaLegal: null });
    const registo = new Map(semRef.map((c) => [c.valor, "fund-1"]));

    // Later the formal notice is published with its reference.
    const comRef = construirChaves(base);
    const r = resolverIdentidade(comRef, registo);

    expect(r.tipo).toBe("existente");
    if (r.tipo !== "existente") throw new Error("unreachable");
    expect(r.chavesEmFalta.map((c) => c.tipo)).toContain("referencia_legal");
  });

  it("nunca funde automaticamente quando as chaves apontam para avisos diferentes", () => {
    const chaves = construirChaves(base);
    const registo = new Map<string, string>([
      [chaves[0]!.valor, "fund-A"], // legal reference says A
      [chaves[1]!.valor, "fund-B"], // URL says B
    ]);

    const r = resolverIdentidade(chaves, registo);
    expect(r.tipo).toBe("conflito");
    if (r.tipo !== "conflito") throw new Error("unreachable");
    // Attaches to the holder of the strongest key, but flags both for a human.
    expect(r.fundId).toBe("fund-A");
    expect([...r.fundIdsEmConflito].sort()).toEqual(["fund-A", "fund-B"]);
  });

  it("reconhece a mesma republicação pelo título normalizado", () => {
    const original = construirChaves({ ...base, referenciaLegal: null });
    const registo = new Map(original.map((c) => [c.valor, "fund-1"]));

    const republicado = construirChaves({
      ...base,
      referenciaLegal: null,
      url: "https://www.fundoambiental.pt/avisos/outro.aspx",
      titulo: "Apoio a painéis solares — Segunda Republicação",
    });

    const r = resolverIdentidade(republicado, registo);
    expect(r.tipo).toBe("existente");
  });
});

describe("semelhancaTrigramas", () => {
  it("pontua títulos quase idênticos acima do limiar", () => {
    expect(
      semelhancaTrigramas("apoio a paineis solares", "apoio a paineis solares fotovoltaicos"),
    ).toBeGreaterThan(0.5);
  });

  it("pontua títulos distintos muito abaixo do limiar", () => {
    expect(semelhancaTrigramas("apoio a paineis solares", "remocao de amianto")).toBeLessThan(0.2);
  });
});
