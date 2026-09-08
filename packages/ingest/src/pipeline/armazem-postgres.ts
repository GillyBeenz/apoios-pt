import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { Pool } from "pg";
import {
  COLUNAS_APOIO,
  SELECT_APOIO,
  paraApoio,
  paraLinha,
  type Apoio,
  type ApoioNovo,
  type ChaveIdentidade,
  type EventoApoio,
} from "@apoios/core";

import {
  gerarSlug,
  type Armazem,
  type EstadoSnapshot,
  type ExtraccaoRegistada,
} from "./armazem.ts";

/**
 * Supabase's root certificate, committed rather than fetched.
 *
 * A root CA is public by definition — it is the half everyone is meant to have —
 * so there is nothing here to keep secret. It lives in the repository so that
 * verification does not depend on a download succeeding at the exact moment a
 * scheduled run starts; a CA fetched at runtime is a CA an attacker gets to
 * influence, and a build that reaches the network to learn who to trust has
 * already lost the argument.
 *
 * Subject and issuer are the same (`CN = Supabase Root 2021 CA`), valid until
 * 2031. The test alongside pins its SHA-256 fingerprint, so replacing this file
 * with another certificate fails the suite rather than silently widening trust.
 */
const CA_SUPABASE = readFileSync(
  new URL("../../certs/supabase-root-2021.crt", import.meta.url),
  "utf8",
);

/**
 * The pipeline's store, speaking Postgres directly.
 *
 * This replaces a PostgREST client, and the reason is not preference. Reaching
 * PostgREST as `apoios_ingest` requires a JWT carrying that role in its claims,
 * and PostgREST will only trust a signature it can verify against the project's
 * key set. That key set is asymmetric: an HS256 token signed with a shared secret
 * has no matching key and is refused with PGRST301 — "No suitable key or wrong
 * key type" — no matter which secret signs it. Supabase does not hand out the
 * private half of an asymmetric signing key, so there is no token this workflow
 * could ever mint that PostgREST would accept for a custom role.
 *
 * A Postgres connection has no such problem: the role *is* the credential. The
 * database enforces the same restriction it always did — grants on nine tables,
 * none on `profiles`, `subscriptions`, `alerts_sent`, `alerts_outbox`,
 * `unsubscribe_tokens` or anything in `auth` — and it enforces it against the
 * connection itself rather than against a claim in a token. That is a stronger
 * boundary, not a weaker one, which is the part worth saying out loud: this runs
 * in a public repository whose Actions logs are public, so a stray query against
 * a user table must fail rather than print somebody's email into a build log.
 *
 * Scoped per source, because `snapshots.source_id` and `funds.source_id` are both
 * `not null` while the `Armazem` interface carries no source argument.
 */
export class ArmazemPostgres implements Armazem {
  readonly #pool: Pool;
  readonly #fonteId: string;

  constructor(pool: Pool, fonteId: string) {
    this.#pool = pool;
    this.#fonteId = fonteId;
  }

  /**
   * One pool for the whole run, shared by every per-source store.
   *
   * `rejectUnauthorized` stays on, and the CA is supplied rather than the check
   * being dropped. Execução #13 failed here with `SELF_SIGNED_CERT_IN_CHAIN`:
   * the connection reached Supabase and the handshake completed, but the pooler
   * presents a chain signed by *Supabase Root 2021 CA*, which is not in Node's
   * default trust store. The advice one finds for this is `rejectUnauthorized:
   * false`, and it is the wrong trade — it makes every certificate acceptable,
   * including one presented by whoever is in the middle, on a connection to a
   * database holding subscriber emails.
   *
   * `sslmode=require` in a connection string is the same mistake wearing a
   * standard's clothes: it means "encrypt" and says nothing about *whom* you are
   * encrypting to. What is wanted is trust in exactly one more root than the
   * system already trusts, which is what this does — Supabase's root plus the
   * public ones, so a connection string pointing anywhere else still verifies
   * normally.
   */
  static poolDe(connectionString: string): Pool {
    return new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: true,
        ca: [CA_SUPABASE, ...rootCertificates],
      },
      // The workflow is a short batch job, not a server. A small pool keeps well
      // clear of the pooler's client limit while still overlapping IO.
      max: 4,
      connectionTimeoutMillis: 15_000,
    });
  }

  async #consulta<T>(
    texto: string,
    valores: readonly unknown[],
    contexto: string,
  ): Promise<T[]> {
    try {
      const { rows } = await this.#pool.query(texto, [...valores]);
      return rows as T[];
    } catch (erro) {
      // Postgres names the constraint or the missing privilege; losing that to a
      // bare "query failed" is how the last three days were spent.
      const causa = erro instanceof Error ? erro.message : String(erro);
      throw new Error(`${contexto}: ${causa}`, { cause: erro });
    }
  }

  async snapshotAnterior(url: string): Promise<EstadoSnapshot | null> {
    const linhas = await this.#consulta<{
      hash_conteudo: string;
      etag: string | null;
      last_modified: string | null;
      capturado_em: Date;
    }>(
      `select hash_conteudo, etag, last_modified, capturado_em
         from snapshots
        where url = $1
        order by capturado_em desc
        limit 1`,
      [url],
      `snapshotAnterior(${url})`,
    );

    const l = linhas[0];
    if (l === undefined) return null;

    return {
      hashConteudo: l.hash_conteudo,
      etag: l.etag,
      lastModified: l.last_modified,
      capturadoEm: paraIso(l.capturado_em),
    };
  }

  async guardarSnapshot(
    url: string,
    estado: EstadoSnapshot,
    conteudo: Uint8Array,
  ): Promise<void> {
    await this.#consulta(
      `insert into snapshots
         (source_id, url, url_canonica, hash_conteudo, etag, last_modified,
          capturado_em, bytes, conteudo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       -- Mirrors snapshots_dedup. Re-running the pipeline on an unchanged page
       -- must not write a second row: that is what keeps this table's growth
       -- proportional to how often the sources actually change.
       on conflict (url_canonica, hash_conteudo) do nothing`,
      [
        this.#fonteId,
        url,
        canonicalizar(url),
        estado.hashConteudo,
        estado.etag,
        estado.lastModified,
        estado.capturadoEm,
        conteudo.byteLength,
        // bytea takes the bytes as they are. The hex round-trip this used to need
        // was an artefact of PostgREST speaking JSON, and it is gone.
        Buffer.from(conteudo),
      ],
      `guardarSnapshot(${url})`,
    );
  }

  async conteudoSnapshot(url: string): Promise<Uint8Array | null> {
    const linhas = await this.#consulta<{ conteudo: Buffer | null }>(
      `select conteudo
         from snapshots
        where url = $1
        order by capturado_em desc
        limit 1`,
      [url],
      `conteudoSnapshot(${url})`,
    );

    const conteudo = linhas[0]?.conteudo;
    return conteudo == null ? null : new Uint8Array(conteudo);
  }

  async procurarIdentidades(
    valores: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const encontrados = new Map<string, string>();
    if (valores.length === 0) return encontrados;

    const linhas = await this.#consulta<{ valor: string; fund_id: string }>(
      `select valor, fund_id from fund_identities where valor = any($1::text[])`,
      [[...valores]],
      "procurarIdentidades",
    );

    for (const l of linhas) encontrados.set(l.valor, l.fund_id);
    return encontrados;
  }

  async registarIdentidades(
    fundId: string,
    chaves: readonly ChaveIdentidade[],
  ): Promise<void> {
    if (chaves.length === 0) return;

    await this.#consulta(
      `insert into fund_identities (tipo, valor, fund_id, forca)
       select * from unnest($1::text[], $2::text[], $3::uuid[], $4::int[])
       -- Mirrors 'primary key (tipo, valor)' and ArmazemMemoria alike: a key
       -- already claimed by another fund is never silently reassigned.
       -- Overwriting would merge two distinct programmes into one catalogue
       -- entry, which is worse than leaving a duplicate visible.
       on conflict (tipo, valor) do nothing`,
      [
        chaves.map((c) => c.tipo),
        chaves.map((c) => c.valor),
        chaves.map(() => fundId),
        chaves.map((c) => c.forca),
      ],
      `registarIdentidades(${fundId})`,
    );
  }

  async obterApoio(fundId: string): Promise<Apoio | null> {
    const linhas = await this.#consulta<Record<string, unknown>>(
      `select ${SELECT_APOIO} from funds where id = $1`,
      [fundId],
      `obterApoio(${fundId})`,
    );

    const l = linhas[0];
    return l === undefined ? null : paraApoio(normalizar(l));
  }

  async criarApoio(
    novo: ApoioNovo,
    chaves: readonly ChaveIdentidade[],
  ): Promise<Apoio> {
    // The id is generated here rather than by the column default, which lets the
    // slug be correct in the same statement. The old PostgREST path inserted a
    // placeholder slug and updated it immediately afterwards, because it could
    // not know the id until the insert came back; that window is gone, and with
    // it a row that briefly existed under a name nobody chose.
    const id = crypto.randomUUID();
    const linha = paraLinha(novo);
    const colunas = ["id", "slug", ...colunasDe(linha).colunas];
    const valores = [
      id,
      gerarSlug(novo.titulo, id),
      ...colunasDe(linha).valores,
    ];

    const linhas = await this.#consulta<Record<string, unknown>>(
      `insert into funds (${colunas.join(", ")})
       values (${colunas.map((_, i) => `$${i + 1}`).join(", ")})
       returning ${SELECT_APOIO}`,
      valores,
      `criarApoio(${novo.urlOficial})`,
    );

    await this.registarIdentidades(id, chaves);
    return paraApoio(normalizar(linhas[0]!));
  }

  async actualizarApoio(fundId: string, novo: ApoioNovo): Promise<Apoio> {
    // `slug` is deliberately absent. A retitled fund keeps its URL: a shared link
    // that stops working costs more than a tidy slug.
    const linha = paraLinha(novo);
    const { colunas, valores } = colunasDe(linha);

    const atribuicoes = colunas.map((c, i) => `${c} = $${i + 2}`);
    atribuicoes.push("visto_pela_ultima_vez = now()");

    const linhas = await this.#consulta<Record<string, unknown>>(
      `update funds set ${atribuicoes.join(", ")}
        where id = $1
       returning ${SELECT_APOIO}`,
      [fundId, ...valores],
      `actualizarApoio(${fundId})`,
    );

    const l = linhas[0];
    if (l === undefined)
      throw new Error(`actualizarApoio(${fundId}): apoio desconhecido`);
    return paraApoio(normalizar(l));
  }

  async guardarExtraccao(e: ExtraccaoRegistada): Promise<void> {
    // Deliberately not idempotent and never deduplicated: every call is a distinct
    // event, and two extractions of the same document on different days are the
    // record of what changed between them.
    await this.#consulta(
      `insert into fund_extractions
         (fund_id, modelo, prompt_version, schema_version, bruto,
          confianca_campos, evidencia_falhou, tokens_entrada, tokens_saida,
          tokens_cache_lidos, stop_reason)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::text[], $8, $9, $10, $11)`,
      [
        e.fundId,
        e.modelo,
        e.versaoPrompt,
        e.versaoEsquema,
        JSON.stringify(e.bruto),
        JSON.stringify(e.confiancaCampos),
        [...e.evidenciaFalhou],
        e.tokensEntrada,
        e.tokensSaida,
        e.tokensCacheLidos,
        e.stopReason,
      ],
      "guardarExtraccao",
    );
  }

  async registarEventos(eventos: readonly EventoApoio[]): Promise<number> {
    if (eventos.length === 0) return 0;

    const linhas = await this.#consulta<{ id: string }>(
      `insert into fund_events (fund_id, tipo, ocorreu_em, payload, impressao, alertavel)
       select * from unnest(
         $1::uuid[], $2::tipo_evento[], $3::timestamptz[], $4::jsonb[],
         $5::text[], $6::boolean[]
       )
       -- The unique index on 'impressao' is what makes the whole job safe to
       -- retry: replaying the pipeline emits zero duplicate events, and therefore
       -- zero duplicate emails.
       on conflict (impressao) do nothing
       returning id`,
      [
        eventos.map((e) => e.fundId),
        eventos.map((e) => e.tipo),
        eventos.map((e) => e.ocorreuEm),
        eventos.map((e) => JSON.stringify(e.payload)),
        eventos.map((e) => e.impressao),
        eventos.map((e) => e.alertavel),
      ],
      "registarEventos",
    );

    // Only the rows actually inserted come back, so this counts genuinely new
    // events rather than everything that was offered.
    return linhas.length;
  }
}

/**
 * `jsonb` columns take a string; everything else goes through untouched.
 *
 * node-postgres turns a JS array into a Postgres array literal and leaves the
 * column's own type to decide how to read it, which is what makes
 * `tipo_beneficiario[]` and `text[]` both work without a cast here. It does
 * *not* do the same for a plain object or an array destined for `jsonb` — that
 * one has to be serialised, or `detalhe_apoios` and `documentos` arrive as
 * `{...}` and the insert fails on a type it cannot parse.
 */
const COLUNAS_JSONB = new Set(["detalhe_apoios", "documentos"]);

function colunasDe(linha: Record<string, unknown>): {
  colunas: readonly string[];
  valores: readonly unknown[];
} {
  const colunas = Object.keys(linha);
  return {
    colunas,
    valores: colunas.map((c) =>
      COLUNAS_JSONB.has(c) ? JSON.stringify(linha[c]) : linha[c],
    ),
  };
}

/**
 * `paraApoio` was written against PostgREST's JSON, where every value had already
 * been through `JSON.stringify`. node-postgres hands back richer types — `Date`
 * for `timestamptz`, `string` for `numeric` (it will not silently lose precision
 * on a 14-digit number) — so the timestamps are converted back to ISO strings
 * here. Doing it in one place keeps the mapping in `@apoios/core` the single
 * authority on the row shape.
 */
function normalizar(linha: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const chave of COLUNAS_APOIO) {
    const valor = linha[chave];
    saida[chave] = valor instanceof Date ? valor.toISOString() : valor;
  }
  return saida;
}

function paraIso(valor: Date | string): string {
  return valor instanceof Date ? valor.toISOString() : valor;
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
