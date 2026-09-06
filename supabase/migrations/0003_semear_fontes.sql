-- Semear a tabela `sources`.
--
-- Gerado por scripts/gerar-seed-fontes.mts a partir de
-- packages/ingest/src/sources/registo.ts — não editar à mão.
--
-- `funds.source_id` é `not null references sources (id)`, por isso a ingestão
-- não consegue escrever um único apoio antes destas linhas existirem.
--
-- `activa` espelha `estado === "activa"`: uma fonte em captura tem o URL de
-- entrada confirmado mas nenhum extractor verificado contra o markup real, e o
-- pipeline salta-a. Registá-la à mesma mantém o catálogo de fontes honesto sobre
-- o que ainda falta, em vez de a esconder.

insert into sources (id, nome, url_base, entidade, activa, cadencia_horas, candidatos_min)
values
  ('fundo-ambiental-aac', 'Fundo Ambiental — Avisos e Apoios', 'https://www.fundoambiental.pt', 'Fundo Ambiental', true, 24, 20),
  ('fundo-ambiental-noticias', 'Fundo Ambiental — Notícias', 'https://www.fundoambiental.pt', 'Fundo Ambiental', true, 12, 2),
  ('prr-candidaturas', 'PRR — Candidaturas', 'https://recuperarportugal.gov.pt', 'Estrutura de Missão Recuperar Portugal', false, 24, 0),
  ('pt2030-avisos', 'Portugal 2030 — Avisos', 'https://portugal2030.pt', 'Agência para o Desenvolvimento e Coesão', true, 24, 3),
  ('pt2030-plano-anual-avisos', 'Portugal 2030 — Plano Anual de Avisos', 'https://portugal2030.pt', 'Agência para o Desenvolvimento e Coesão', true, 168, 1)
on conflict (id) do update set
  nome           = excluded.nome,
  url_base       = excluded.url_base,
  entidade       = excluded.entidade,
  activa         = excluded.activa,
  cadencia_horas = excluded.cadencia_horas,
  candidatos_min = excluded.candidatos_min;
