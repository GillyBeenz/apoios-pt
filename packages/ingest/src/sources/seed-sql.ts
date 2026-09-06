import { FONTES } from "./registo.ts";

const cite = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * The contents of supabase/migrations/0003_semear_fontes.sql, derived from the
 * registry rather than written by hand.
 *
 * `funds.source_id` is `not null references sources (id)`, so a source missing
 * from that table cannot ingest a single fund — and it fails as a foreign-key
 * violation deep inside a scheduled job, nowhere a person is looking. Generating
 * the seed means adding a source stays one edit; `semear-fontes.test.ts` turns a
 * stale file into a failed build.
 */
export function seedDeFontes(): string {
  const linhas = FONTES.map(
    (f) =>
      `  (${cite(f.id)}, ${cite(f.nome)}, ${cite(f.urlBase)}, ${cite(f.entidade)}, ` +
      `${f.estado === "activa"}, ${f.cadenciaHoras}, ${f.candidatosMin})`,
  ).join(",\n");

  return `-- Semear a tabela \`sources\`.
--
-- Gerado por scripts/gerar-seed-fontes.mts a partir de
-- packages/ingest/src/sources/registo.ts — não editar à mão.
--
-- \`funds.source_id\` é \`not null references sources (id)\`, por isso a ingestão
-- não consegue escrever um único apoio antes destas linhas existirem.
--
-- \`activa\` espelha \`estado === "activa"\`: uma fonte em captura tem o URL de
-- entrada confirmado mas nenhum extractor verificado contra o markup real, e o
-- pipeline salta-a. Registá-la à mesma mantém o catálogo de fontes honesto sobre
-- o que ainda falta, em vez de a esconder.

insert into sources (id, nome, url_base, entidade, activa, cadencia_horas, candidatos_min)
values
${linhas}
on conflict (id) do update set
  nome           = excluded.nome,
  url_base       = excluded.url_base,
  entidade       = excluded.entidade,
  activa         = excluded.activa,
  cadencia_horas = excluded.cadencia_horas,
  candidatos_min = excluded.candidatos_min;
`;
}
