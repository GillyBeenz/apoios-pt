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
      expect(
        existsSync(dir),
        `${f.id} está activa sem fixtures capturadas`,
      ).toBe(true);

      const manifesto = JSON.parse(
        readFileSync(join(dir, "manifest.json"), "utf8"),
      );
      const entradas: { url: string; ficheiro: string }[] =
        manifesto.entradas ?? [];

      let melhor = 0;

      // Numa fonte paginada, a captura é de **uma página** e o piso é de **uma
      // corrida**. São grandezas diferentes, e compará-las prendia o piso ao que
      // cabe numa página: o PT2030 traz 229 avisos em 46 páginas, e exigir os 229
      // de uma captura de cinco punha a build vermelha sem haver nada partido.
      //
      // O que esta captura consegue provar é que o leitor funciona sobre bytes
      // reais, e é isso que se lhe pede: pelo menos um apoio de uma página que
      // trouxe avisos. O piso da corrida fica livre para ser o número certo, e
      // quem o guarda é o pipeline, que vê a corrida inteira.
      //
      // Isto enfraquece o exame, e enfraquece-o de propósito: a alternativa era
      // manter uma exigência que a captura não consegue sustentar, e o preço dessa
      // era um piso de saúde a um — incapaz de distinguir um varrimento truncado
      // na primeira página de uma corrida sã.
      const paginada = (f.pedidosEntrada ?? []).some(
        (pedido) => pedido.paginacao !== undefined,
      );

      if (f.entradaEDataset === true) {
        for (const pedido of f.pedidosEntrada ?? []) {
          const entrada = entradas.find((e) => e.url === pedido.url);
          if (entrada === undefined) continue;
          const bytes = readFileSync(join(dir, entrada.ficheiro));
          const n =
            f.lerDataset?.(new Uint8Array(bytes), {
              urlOrigem: pedido.url,
              entidade: f.entidade,
            }).length ?? 0;
          melhor = Math.max(melhor, n);
        }

        if (paginada) {
          expect(
            melhor,
            `${f.id}: o leitor devolve ${melhor} da captura de uma página`,
          ).toBeGreaterThanOrEqual(1);
          continue;
        }
      } else {
        for (const url of f.urlsEntrada) {
          const entrada = entradas.find((e) => e.url === url);
          if (entrada === undefined || !/\.html$/i.test(entrada.ficheiro))
            continue;
          const html = readFileSync(join(dir, entrada.ficheiro), "utf8");
          const n = f.extrair(html, { urlBase: url, agora: AGORA }).length;
          melhor = Math.max(melhor, n);
        }
      }

      expect(
        melhor,
        `${f.id}: devolve ${melhor} da sua própria captura`,
      ).toBeGreaterThanOrEqual(f.candidatosMin);
    }
  });

  it("exige um piso de saúde a quem está activa, e nenhum a quem não está", () => {
    for (const f of FONTES) {
      if (f.estado === "activa") {
        // On a listing, a floor of 1 cannot detect a partial break — a collapse from
        // forty entries to one would pass — so it has to be higher. A dataset source
        // is different in kind: it expects a single file, and 1 genuinely means "the
        // download link is still there".
        //
        // Salvo se for paginada, e aí volta a ser uma listagem em tudo menos no
        // nome: o que chega é a soma de dezenas de páginas, e a falha que interessa
        // é o varrimento parar a meio. Um piso que uma página sozinha satisfaz não
        // distingue isso de uma corrida inteira — que é exactamente o buraco em que
        // esta fonte esteve enquanto o piso ficou preso ao que a captura mostrava.
        const paginada = (f.pedidosEntrada ?? []).some(
          (pedido) => pedido.paginacao !== undefined,
        );
        expect(f.candidatosMin, f.id).toBeGreaterThan(
          f.tipo === "dataset" && !paginada ? 0 : 1,
        );
      } else {
        // Any other number would be invented rather than measured.
        expect(f.candidatosMin, f.id).toBe(0);
      }
    }
  });

  it("tem urls de entrada absolutas e em https, dentro do próprio domínio", () => {
    for (const f of FONTES) {
      // Os dois tipos de entrada juntos, e não só `urlsEntrada`.
      //
      // Quando o POST apareceu, uma fonte passou a poder ter `urlsEntrada` vazio e
      // ir buscar tudo a um `pedidosEntrada` — e um invariante que só olhasse para
      // a primeira lista deixava o URL que de facto é chamado sair do domínio sem
      // ninguém reparar. É precisamente o URL que leva um corpo que merece mais
      // atenção, não menos.
      const entradas = [
        ...f.urlsEntrada,
        ...(f.pedidosEntrada ?? []).map((p) => p.url),
      ];
      expect(entradas.length, `${f.id} não tem entrada nenhuma`).toBeGreaterThan(
        0,
      );

      const base = new URL(f.urlBase).hostname.replace(/^www\./, "");
      for (const u of entradas) {
        const url = new URL(u);
        expect(url.protocol, `${f.id} ${u}`).toBe("https:");
        expect(url.hostname.replace(/^www\./, ""), `${f.id} ${u}`).toBe(base);
      }
    }
  });

  /**
   * Uma fonte cuja entrada já é o conjunto de dados não tem listagem nem segundo
   * pedido: se lhe faltar o `lerDataset`, a resposta é buscada, guardada e
   * deitada fora em silêncio — que foi exactamente o que aconteceu ao plano anual
   * durante meses.
   */
  it("exige lerDataset a quem diz que a entrada já é o conjunto de dados", () => {
    for (const f of FONTES) {
      if (f.entradaEDataset !== true) continue;
      expect(f.lerDataset, `${f.id} sem lerDataset`).toBeDefined();
      expect(
        [...f.urlsEntrada, ...(f.pedidosEntrada ?? [])].length,
        `${f.id} sem entrada`,
      ).toBeGreaterThan(0);
    }
  });

  it("resolve fontes por id", () => {
    expect(obterFonte("fundo-ambiental-aac")?.nome).toContain(
      "Fundo Ambiental",
    );
    expect(obterFonte("nao-existe")).toBeUndefined();
  });

  it("mantém uma cadência plausível", () => {
    for (const f of FONTES) {
      expect(f.cadenciaHoras, f.id).toBeGreaterThanOrEqual(1);
      expect(f.cadenciaHoras, f.id).toBeLessThanOrEqual(24 * 7);
    }
  });
});
