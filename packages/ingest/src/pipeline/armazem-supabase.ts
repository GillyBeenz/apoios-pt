import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SELECT_APOIO,
  paraApoio,
  paraLinha,
  type Apoio,
  type ApoioNovo,
  type ChaveIdentidade,
  type EventoApoio,
} from "@apoios/core";

import { gerarSlug, type Armazem, type EstadoSnapshot } from "./armazem.ts";

// SELECT_APOIO is joined at runtime, so the client cannot infer the row shape
// from it. `paraApoio` is where the shape is actually asserted.
type Linha = Record<string, unknown>;

/**
 * The pipeline's store, backed by Supabase.
 *
 * Authenticated as `apoios_ingest` — a Postgres role with grants on exactly nine
 * tables and none at all on `profiles`, `subscriptions`, `alerts_sent`,
 * `alerts_outbox`, `unsubscribe_tokens` or anything in `auth`. That restriction is
 * the point, and it is why this does not use the service_role key: this runs in a
 * public repository's Actions workflow, whose logs are public, so a stray query
 * against a user table must fail loudly here rather than quietly print somebody's
 * email address into a build log.
 *
 * Scoped per source, because `snapshots.source_id` and `funds.source_id` are both
 * `not null` while the `Armazem` interface carries no source argument. The
 * pipeline processes one source at a time, so binding the id at construction is
 * accurate and leaves no mutable field to get out of step.
 */
export class ArmazemSupabase implements Armazem {
  readonly #db: SupabaseClient;
  readonly #fonteId: string;

  constructor(db: SupabaseClient, fonteId: string) {
    this.#db = db;
    this.#fonteId = fonteId;
  }

  /**
   * `chave` is a JWT carrying `role: apoios_ingest`, not an anon or service key.
   * PostgREST reads the role out of the token, so the database enforces the
   * restriction rather than this code promising to respect it.
   */
  static de(url: string, chave: string, fonteId: string): ArmazemSupabase {
    return new ArmazemSupabase(
      createClient(url, chave, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      fonteId,
    );
  }

  async snapshotAnterior(url: string): Promise<EstadoSnapshot | null> {
    const { data, error } = await this.#db
      .from("snapshots")
      .select("hash_conteudo, etag, last_modified, capturado_em")
      .eq("url", url)
      .order("capturado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error !== null) throw new Error(`snapshotAnterior(${url}): ${error.message}`);
    if (data === null) return null;

    return {
      hashConteudo: String(data.hash_conteudo),
      etag: typeof data.etag === "string" ? data.etag : null,
      lastModified: typeof data.last_modified === "string" ? data.last_modified : null,
      capturadoEm: String(data.capturado_em),
    };
  }

  async guardarSnapshot(
    url: string,
    estado: EstadoSnapshot,
    conteudo: Uint8Array,
  ): Promise<void> {
    const { error } = await this.#db.from("snapshots").upsert(
      {
        source_id: this.#fonteId,
        url,
        url_canonica: canonicalizar(url),
        hash_conteudo: estado.hashConteudo,
        etag: estado.etag,
        last_modified: estado.lastModified,
        capturado_em: estado.capturadoEm,
        bytes: conteudo.byteLength,
        conteudo: paraHexPostgres(conteudo),
      },
      // Mirrors `snapshots_dedup`. Re-running the pipeline on an unchanged page
      // must not write a second row, which is what keeps this table's growth
      // proportional to how often the sources actually change.
      { onConflict: "url_canonica, hash_conteudo", ignoreDuplicates: true },
    );
    if (error !== null) throw new Error(`guardarSnapshot(${url}): ${error.message}`);
  }

  async conteudoSnapshot(url: string): Promise<Uint8Array | null> {
    const { data, error } = await this.#db
      .from("snapshots")
      .select("conteudo")
      .eq("url", url)
      .order("capturado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error !== null) throw new Error(`conteudoSnapshot(${url}): ${error.message}`);
    if (data === null || typeof data.conteudo !== "string") return null;
    return deHexPostgres(data.conteudo);
  }

  async procurarIdentidades(valores: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const encontrados = new Map<string, string>();
    if (valores.length === 0) return encontrados;

    const { data, error } = await this.#db
      .from("fund_identities")
      .select("valor, fund_id")
      .in("valor", [...valores]);
    if (error !== null) throw new Error(`procurarIdentidades: ${error.message}`);

    for (const l of data ?? []) encontrados.set(String(l.valor), String(l.fund_id));
    return encontrados;
  }

  async registarIdentidades(fundId: string, chaves: readonly ChaveIdentidade[]): Promise<void> {
    if (chaves.length === 0) return;

    const { error } = await this.#db.from("fund_identities").upsert(
      chaves.map((c) => ({
        tipo: c.tipo,
        valor: c.valor,
        fund_id: fundId,
        forca: c.forca,
      })),
      // `ignoreDuplicates` mirrors the `primary key (tipo, valor)` constraint and
      // ArmazemMemoria's behaviour: a key already claimed by another fund is never
      // silently reassigned. Overwriting would merge two distinct programmes into
      // one catalogue entry, which is worse than leaving a duplicate visible.
      { onConflict: "tipo, valor", ignoreDuplicates: true },
    );
    if (error !== null) throw new Error(`registarIdentidades(${fundId}): ${error.message}`);
  }

  async obterApoio(fundId: string): Promise<Apoio | null> {
    const { data, error } = await this.#db
      .from("funds")
      .select(SELECT_APOIO)
      .eq("id", fundId)
      .returns<Linha[]>()
      .maybeSingle();
    if (error !== null) throw new Error(`obterApoio(${fundId}): ${error.message}`);
    return data === null ? null : paraApoio(data);
  }

  async criarApoio(novo: ApoioNovo, chaves: readonly ChaveIdentidade[]): Promise<Apoio> {
    // `slug` is `not null` and the database has no default, so it is generated
    // here. The id is only known after the insert, so the slug is written in a
    // second step rather than guessed — a collision would break a shared URL.
    const { data, error } = await this.#db
      .from("funds")
      .insert({ ...paraLinha(novo), slug: provisorio() })
      .select(SELECT_APOIO)
      .returns<Linha[]>()
      .single();
    if (error !== null) throw new Error(`criarApoio(${novo.urlOficial}): ${error.message}`);

    const id = String(data.id);
    const { data: comSlug, error: erroSlug } = await this.#db
      .from("funds")
      .update({ slug: gerarSlug(novo.titulo, id) })
      .eq("id", id)
      .select(SELECT_APOIO)
      .returns<Linha[]>()
      .single();
    if (erroSlug !== null) throw new Error(`criarApoio/slug(${id}): ${erroSlug.message}`);

    await this.registarIdentidades(id, chaves);
    return paraApoio(comSlug);
  }

  async actualizarApoio(fundId: string, novo: ApoioNovo): Promise<Apoio> {
    // `slug` is deliberately absent from the update. A retitled fund keeps its
    // URL: a shared link that stops working costs more than a tidy slug.
    const { data, error } = await this.#db
      .from("funds")
      .update({ ...paraLinha(novo), visto_pela_ultima_vez: new Date().toISOString() })
      .eq("id", fundId)
      .select(SELECT_APOIO)
      .returns<Linha[]>()
      .single();
    if (error !== null) throw new Error(`actualizarApoio(${fundId}): ${error.message}`);
    return paraApoio(data);
  }

  async registarEventos(eventos: readonly EventoApoio[]): Promise<number> {
    if (eventos.length === 0) return 0;

    // `ignoreDuplicates` on the unique `impressao` index is what makes the whole
    // job safe to retry: replaying the pipeline emits zero duplicate events, and
    // therefore zero duplicate emails.
    const { data, error } = await this.#db
      .from("fund_events")
      .upsert(
        eventos.map((e) => ({
          fund_id: e.fundId,
          tipo: e.tipo,
          ocorreu_em: e.ocorreuEm,
          payload: e.payload,
          impressao: e.impressao,
          alertavel: e.alertavel,
        })),
        { onConflict: "impressao", ignoreDuplicates: true },
      )
      .select("id");
    if (error !== null) throw new Error(`registarEventos: ${error.message}`);

    // Only the rows actually inserted come back, so this counts genuinely new
    // events rather than everything that was offered.
    return (data ?? []).length;
  }
}

/** Matches the canonicalisation the dedup index assumes: no fragment, no trailing slash. */
export function canonicalizar(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** PostgREST speaks `bytea` as Postgres' hex format, in both directions. */
export function paraHexPostgres(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function deHexPostgres(valor: string): Uint8Array {
  const hex = valor.startsWith("\\x") ? valor.slice(2) : valor;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * A unique placeholder for the moment between insert and slug.
 *
 * `funds.slug` is `not null unique`, so the insert needs *something*; using the
 * title here would collide the first time two sources announce the same
 * programme, and the insert would fail for a reason that has nothing to do with
 * the actual problem.
 */
function provisorio(): string {
  return `por-nomear-${crypto.randomUUID()}`;
}
