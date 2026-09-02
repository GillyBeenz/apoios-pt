import type { Apoio, ApoioNovo, ChaveIdentidade, EventoApoio } from "@apoios/core";

export interface EstadoSnapshot {
  readonly hashConteudo: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly capturadoEm: string;
}

/**
 * Everything the pipeline needs from persistence.
 *
 * Kept as an interface so the whole pipeline can run against an in-memory
 * implementation in tests — no database, no network, no credentials — and against
 * Postgres in production without the orchestrator knowing the difference.
 */
export interface Armazem {
  snapshotAnterior(url: string): Promise<EstadoSnapshot | null>;
  guardarSnapshot(url: string, estado: EstadoSnapshot, conteudo: Uint8Array): Promise<void>;
  /**
   * The stored body of the last snapshot.
   *
   * Needed because an unchanged listing must still yield its candidates: a notice
   * can have its deadline extended on the detail page or inside the PDF without
   * the listing changing at all, and skipping the whole source on an unchanged
   * listing would silently miss exactly that.
   */
  conteudoSnapshot(url: string): Promise<Uint8Array | null>;

  /** Resolve identity keys to fund ids in one lookup. */
  procurarIdentidades(valores: readonly string[]): Promise<ReadonlyMap<string, string>>;
  registarIdentidades(fundId: string, chaves: readonly ChaveIdentidade[]): Promise<void>;

  obterApoio(fundId: string): Promise<Apoio | null>;
  criarApoio(novo: ApoioNovo, chaves: readonly ChaveIdentidade[]): Promise<Apoio>;
  actualizarApoio(fundId: string, novo: ApoioNovo): Promise<Apoio>;

  /** Must be idempotent on `impressao` — this is what suppresses duplicate alerts. */
  registarEventos(eventos: readonly EventoApoio[]): Promise<number>;
}

/** In-memory store. Used by the pipeline tests and by `ingerir --dry-run`. */
export class ArmazemMemoria implements Armazem {
  readonly snapshots = new Map<string, EstadoSnapshot>();
  readonly conteudos = new Map<string, Uint8Array>();
  readonly identidades = new Map<string, string>();
  readonly apoios = new Map<string, Apoio>();
  readonly eventos = new Map<string, EventoApoio>();
  #proximoId = 1;

  async snapshotAnterior(url: string): Promise<EstadoSnapshot | null> {
    return this.snapshots.get(url) ?? null;
  }

  async guardarSnapshot(url: string, estado: EstadoSnapshot, conteudo: Uint8Array): Promise<void> {
    this.snapshots.set(url, estado);
    this.conteudos.set(url, conteudo);
  }

  async conteudoSnapshot(url: string): Promise<Uint8Array | null> {
    return this.conteudos.get(url) ?? null;
  }

  async procurarIdentidades(valores: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const encontrados = new Map<string, string>();
    for (const v of valores) {
      const id = this.identidades.get(v);
      if (id !== undefined) encontrados.set(v, id);
    }
    return encontrados;
  }

  async registarIdentidades(fundId: string, chaves: readonly ChaveIdentidade[]): Promise<void> {
    for (const c of chaves) {
      // Mirrors the `primary key (tipo, valor)` constraint: a key already claimed
      // by another fund is never silently reassigned.
      if (!this.identidades.has(c.valor)) this.identidades.set(c.valor, fundId);
    }
  }

  async obterApoio(fundId: string): Promise<Apoio | null> {
    return this.apoios.get(fundId) ?? null;
  }

  async criarApoio(novo: ApoioNovo, chaves: readonly ChaveIdentidade[]): Promise<Apoio> {
    const id = `fund-${this.#proximoId++}`;
    const agora = new Date().toISOString();
    const apoio: Apoio = {
      ...novo,
      id,
      slug: gerarSlug(novo.titulo, id),
      vistoPelaPrimeiraVez: agora,
      vistoPelaUltimaVez: agora,
      actualizadoEm: agora,
    };
    this.apoios.set(id, apoio);
    await this.registarIdentidades(id, chaves);
    return apoio;
  }

  async actualizarApoio(fundId: string, novo: ApoioNovo): Promise<Apoio> {
    const anterior = this.apoios.get(fundId);
    if (!anterior) throw new Error(`Apoio desconhecido: ${fundId}`);
    const agora = new Date().toISOString();
    const apoio: Apoio = {
      ...novo,
      id: fundId,
      // The slug never regenerates on a retitle: shareable URLs and search
      // visibility are worth more than a tidy slug.
      slug: anterior.slug,
      vistoPelaPrimeiraVez: anterior.vistoPelaPrimeiraVez,
      vistoPelaUltimaVez: agora,
      actualizadoEm: agora,
    };
    this.apoios.set(fundId, apoio);
    return apoio;
  }

  async registarEventos(eventos: readonly EventoApoio[]): Promise<number> {
    let novos = 0;
    for (const e of eventos) {
      if (!this.eventos.has(e.impressao)) {
        this.eventos.set(e.impressao, e);
        novos++;
      }
    }
    return novos;
  }
}

export function gerarSlug(titulo: string, id: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base.length > 0 ? `${base}-${id.replace(/^fund-/, "")}` : id;
}
