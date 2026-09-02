import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalizarUrl } from "@apoios/core";
import type { Buscador, PedidoCondicional, RespostaHttp } from "./tipos.ts";

export interface EntradaManifesto {
  readonly url: string;
  readonly ficheiro: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly capturadoEm: string;
}

export interface Manifesto {
  readonly sourceId: string;
  readonly capturadoEm: string;
  readonly entradas: readonly EntradaManifesto[];
}

export class ErroFixtureEmFalta extends Error {
  constructor(url: string, dir: string) {
    super(
      `Fixture em falta para ${url} (em ${dir}). ` +
        `Corre o workflow capturar-fixtures.yml no GitHub Actions para a obter — ` +
        `este ambiente não consegue aceder a sítios do Estado português.`,
    );
    this.name = "ErroFixtureEmFalta";
  }
}

/**
 * Fetcher backed by committed fixtures.
 *
 * This is what makes the whole pipeline developable here at all: the sandbox's
 * egress proxy blocks every Portuguese government domain, so the only way to build
 * and test extractors is against real HTML captured by GitHub Actions and committed
 * to the repo. It replays the recorded status, ETag and Last-Modified too, so
 * conditional-GET behaviour is exercised rather than stubbed away.
 */
export class BuscadorReplay implements Buscador {
  readonly #dir: string;
  #manifesto: Manifesto | undefined;
  /** Forces a 304 for URLs whose recorded ETag matches what the caller sends. */
  readonly #honrarCondicional: boolean;

  constructor(dir: string, opcoes: { honrarCondicional?: boolean } = {}) {
    this.#dir = dir;
    this.#honrarCondicional = opcoes.honrarCondicional ?? true;
  }

  async #carregarManifesto(): Promise<Manifesto> {
    this.#manifesto ??= JSON.parse(
      await readFile(join(this.#dir, "manifest.json"), "utf8"),
    ) as Manifesto;
    return this.#manifesto;
  }

  async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
    const manifesto = await this.#carregarManifesto();
    const alvo = canonicalizarUrl(pedido.url);
    const entrada = manifesto.entradas.find((e) => canonicalizarUrl(e.url) === alvo);

    if (!entrada) throw new ErroFixtureEmFalta(pedido.url, this.#dir);

    if (
      this.#honrarCondicional &&
      pedido.etag &&
      entrada.etag &&
      pedido.etag === entrada.etag
    ) {
      return {
        url: entrada.url,
        status: 304,
        naoModificado: true,
        corpo: null,
        bytes: null,
        contentType: entrada.contentType,
        etag: entrada.etag,
        lastModified: entrada.lastModified,
        erro: null,
      };
    }

    const bytes = new Uint8Array(await readFile(join(this.#dir, entrada.ficheiro)));
    const ehPdf = /pdf/i.test(entrada.contentType ?? "") || entrada.ficheiro.endsWith(".pdf");

    return {
      url: entrada.url,
      status: entrada.status,
      naoModificado: false,
      corpo: ehPdf ? null : new TextDecoder("utf-8").decode(bytes),
      bytes,
      contentType: entrada.contentType,
      etag: entrada.etag,
      lastModified: entrada.lastModified,
      erro: entrada.status >= 400 ? `HTTP ${entrada.status}` : null,
    };
  }
}

/** In-memory fetcher for unit tests that need no files on disk. */
export class BuscadorMemoria implements Buscador {
  readonly #respostas = new Map<string, RespostaHttp>();

  definir(url: string, resposta: Partial<RespostaHttp>): this {
    this.#respostas.set(canonicalizarUrl(url), {
      url,
      status: 200,
      naoModificado: false,
      corpo: resposta.corpo ?? null,
      bytes: null,
      contentType: "text/html; charset=utf-8",
      etag: null,
      lastModified: null,
      erro: null,
      ...resposta,
    });
    return this;
  }

  async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
    const r = this.#respostas.get(canonicalizarUrl(pedido.url));
    if (!r) throw new ErroFixtureEmFalta(pedido.url, "(memória)");
    return r;
  }
}
