import {
  ATRASO_ENTRE_PEDIDOS_MS,
  USER_AGENT,
  type Buscador,
  type PedidoCondicional,
  type RespostaHttp,
} from "./tipos.ts";

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const TIPOS_BINARIOS = /application\/pdf|application\/octet-stream/i;

/**
 * The real network fetcher. The only place in the repo that calls `fetch`.
 *
 * Deliberately polite: one request at a time per host, a fixed gap between them,
 * a User-Agent that says who we are and how to reach us, and conditional requests
 * so an unchanged page costs the server almost nothing. These sites are public
 * infrastructure paid for by the people we are building this for.
 */
export class BuscadorHttp implements Buscador {
  readonly #ultimoPedidoPorHost = new Map<string, number>();
  readonly #atrasoMs: number;

  constructor(atrasoMs = ATRASO_ENTRE_PEDIDOS_MS) {
    this.#atrasoMs = atrasoMs;
  }

  async #esperarVez(url: string): Promise<void> {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return;
    }
    const ultimo = this.#ultimoPedidoPorHost.get(host);
    if (ultimo !== undefined) {
      const decorrido = Date.now() - ultimo;
      if (decorrido < this.#atrasoMs) await dormir(this.#atrasoMs - decorrido);
    }
    this.#ultimoPedidoPorHost.set(host, Date.now());
  }

  async buscar(pedido: PedidoCondicional): Promise<RespostaHttp> {
    await this.#esperarVez(pedido.url);

    const cabecalhos: Record<string, string> = {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
      "accept-language": "pt-PT,pt;q=0.9",
    };
    if (pedido.etag) cabecalhos["if-none-match"] = pedido.etag;
    if (pedido.lastModified) cabecalhos["if-modified-since"] = pedido.lastModified;

    const vazio = {
      url: pedido.url,
      corpo: null,
      bytes: null,
      contentType: null,
      etag: null,
      lastModified: null,
    };

    try {
      const resposta = await fetch(pedido.url, {
        headers: cabecalhos,
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });

      const etag = resposta.headers.get("etag");
      const lastModified = resposta.headers.get("last-modified");
      const contentType = resposta.headers.get("content-type");

      if (resposta.status === 304) {
        return {
          ...vazio,
          url: resposta.url || pedido.url,
          status: 304,
          naoModificado: true,
          contentType,
          etag,
          lastModified,
          erro: null,
        };
      }

      if (!resposta.ok) {
        return {
          ...vazio,
          url: resposta.url || pedido.url,
          status: resposta.status,
          naoModificado: false,
          contentType,
          etag,
          lastModified,
          erro: `HTTP ${resposta.status}`,
        };
      }

      const binario = TIPOS_BINARIOS.test(contentType ?? "");
      const buffer = new Uint8Array(await resposta.arrayBuffer());

      return {
        url: resposta.url || pedido.url,
        status: resposta.status,
        naoModificado: false,
        // PDFs keep their bytes so they can go to the model untouched; HTML is
        // decoded once here rather than repeatedly downstream.
        corpo: binario ? null : new TextDecoder("utf-8").decode(buffer),
        bytes: buffer,
        contentType,
        etag,
        lastModified,
        erro: null,
      };
    } catch (erro) {
      return {
        ...vazio,
        status: 0,
        naoModificado: false,
        erro: erro instanceof Error ? erro.message : String(erro),
      };
    }
  }
}
