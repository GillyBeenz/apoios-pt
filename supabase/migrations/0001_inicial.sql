-- Apoios — esquema inicial
--
-- Two structural decisions are worth reading before the DDL:
--
-- 1. Ingestion and alerting are separated by a *privilege* boundary, not just by
--    code layout. Ingestion runs in public GitHub Actions, so its role has no
--    grants on any table containing personal data. Alert matching runs here, in
--    pg_cron, where logs are private.
--
-- 2. `alerts_sent` is claimed before an email is sent, not after. The worst case
--    is then a lost email rather than a duplicate one — for an alerts product,
--    duplicates erode trust faster than the occasional miss.

create extension if not exists pgcrypto;
-- Supabase keeps extensions out of `public`, where their objects can collide
-- with application ones; its advisor reports `extension_in_public` otherwise.
-- `extensions` is already on the default search_path, so gin_trgm_ops below
-- still resolves and funds_titulo_trgm stays valid.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums. Values are pt-PT because they are rendered to users, and because
-- translating them ("condomínio" -> "HOA") loses legal meaning.
-- ---------------------------------------------------------------------------

create type estado_apoio as enum
  ('previsto', 'aberto', 'encerrado', 'suspenso', 'desconhecido');

create type tipo_beneficiario as enum
  ('particular', 'condominio', 'cooperativa', 'associacao_moradores', 'ipss',
   'municipio', 'empresa_municipal_habitacao', 'empresa', 'agricultor',
   'entidade_publica', 'outro');

-- Tri-state. `desconhecido` is NOT a synonym for `nao`; it blocks alerts either
-- way, but the catalogue shows "por confirmar" rather than "não elegível".
create type triestado as enum ('sim', 'nao', 'desconhecido');

create type precisao_data as enum ('minuto', 'dia', 'mes', 'desconhecida');

create type confianca as enum ('alta', 'media', 'baixa');

create type tipo_evento as enum
  ('programa_novo', 'abriu', 'reaberto', 'fecha_em_breve', 'encerrou',
   'prazo_alterado', 'reforco_dotacao', 'dotacao_esgotada', 'elegibilidade_alterada');

-- ---------------------------------------------------------------------------
-- Fontes e snapshots. Sem dados pessoais; o papel de ingestão escreve aqui.
-- ---------------------------------------------------------------------------

create table sources (
  id              text primary key,
  nome            text not null,
  url_base        text not null,
  entidade        text not null,
  activa          boolean not null default true,
  cadencia_horas  int not null default 24,
  -- Health floor: a run below this is treated as a broken selector, not a quiet
  -- week. Without it a site redesign stops all alerts while every run stays green.
  candidatos_min  int not null default 1,
  criado_em       timestamptz not null default now()
);

create table snapshots (
  id              uuid primary key default gen_random_uuid(),
  source_id       text not null references sources (id) on delete cascade,
  url             text not null,
  url_canonica    text not null,
  http_status     int,
  etag            text,
  last_modified   text,
  content_type    text,
  bytes           int,
  -- sha256 of the NORMALISED body: __VIEWSTATE and friends are stripped first,
  -- or every fetch of an unchanged ASP.NET page would look like a change.
  hash_conteudo   text not null,
  caminho_storage text,
  capturado_em    timestamptz not null default now()
);

create unique index snapshots_dedup on snapshots (url_canonica, hash_conteudo);
create index snapshots_recentes on snapshots (source_id, capturado_em desc);

-- ---------------------------------------------------------------------------
-- Apoios
-- ---------------------------------------------------------------------------

create table funds (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text unique not null,
  source_id               text not null references sources (id),

  titulo                  text not null,
  resumo                  text,
  programa_pai            text,
  entidade_gestora        text,
  referencia_legal        text,

  estado                  estado_apoio not null default 'desconhecido',
  dotacao_esgotada        boolean not null default false,

  -- Every date carries how precisely it is known. A deadline given only as a
  -- month cannot honestly drive a "closes in 3 days" countdown.
  abre_em                 timestamptz,
  abre_em_precisao        precisao_data not null default 'desconhecida',
  fecha_em                timestamptz,
  fecha_em_precisao       precisao_data not null default 'desconhecida',

  beneficiarios           tipo_beneficiario[] not null default '{}',
  admite_particulares     triestado not null default 'desconhecido',
  restricoes_beneficiario text,

  ambito                  text not null default 'desconhecido',
  municipios              text[] not null default '{}',

  medidas                 text[] not null default '{}',
  medidas_por_classificar text[] not null default '{}',
  detalhe_apoios          jsonb not null default '[]',

  dotacao_total_eur       numeric(14, 2),
  apoio_max_eur           numeric(12, 2),

  -- NOT NULL on purpose. Every fund, everywhere it appears, links to the
  -- authoritative source; making it required means the UI cannot forget.
  url_oficial             text not null,
  url_candidatura         text,
  documentos              jsonb not null default '[]',

  needs_review            boolean not null default true,
  motivo_revisao          text[] not null default '{}',
  confianca_global        confianca not null default 'baixa',
  publicado               boolean not null default false,
  alertavel               boolean not null default false,

  visto_pela_primeira_vez timestamptz not null default now(),
  visto_pela_ultima_vez   timestamptz not null default now(),
  actualizado_em          timestamptz not null default now()
);

create index funds_abertos on funds (estado, fecha_em)
  where publicado and not dotacao_esgotada;
create index funds_medidas on funds using gin (medidas);
create index funds_beneficiarios on funds using gin (beneficiarios);
create index funds_titulo_trgm on funds using gin (titulo gin_trgm_ops);

-- Old slugs keep resolving after a retitle: shareable URLs and search visibility
-- are worth more than a tidy slug.
create table fund_slugs (
  slug      text primary key,
  fund_id   uuid not null references funds (id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Identidade estável
--
-- The primary key is (tipo, valor), so one key can name at most one fund. That
-- constraint is what stops two concurrent runs forking an identity, and it is
-- why a conflict is detected rather than silently resolved: a wrong merge makes
-- the surviving fund inherit the other's dedup ledger, and its subscribers then
-- stop receiving alerts with no visible symptom anywhere.
-- ---------------------------------------------------------------------------

create table fund_identities (
  tipo      text not null,
  valor     text not null,
  fund_id   uuid not null references funds (id) on delete cascade,
  forca     int not null,
  criado_em timestamptz not null default now(),
  primary key (tipo, valor)
);

create index fund_identities_fund on fund_identities (fund_id);

-- ---------------------------------------------------------------------------
-- Auditoria de extracção. Escrita mesmo quando falha — sobretudo quando falha.
-- ---------------------------------------------------------------------------

create table fund_extractions (
  id               uuid primary key default gen_random_uuid(),
  fund_id          uuid references funds (id) on delete cascade,
  snapshot_id      uuid references snapshots (id) on delete set null,
  modelo           text not null,
  prompt_version   text not null,
  schema_version   text not null,
  bruto            jsonb not null,
  confianca_campos jsonb not null default '{}',
  -- Fields whose evidence quote was not found verbatim in the source document.
  evidencia_falhou text[] not null default '{}',
  tokens_entrada   int,
  tokens_saida     int,
  tokens_cache_lidos int,
  custo_usd        numeric(10, 6),
  stop_reason      text,
  criado_em        timestamptz not null default now()
);

create index fund_extractions_fund on fund_extractions (fund_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Eventos. Append-only, com impressão única.
-- ---------------------------------------------------------------------------

create table fund_events (
  id         uuid primary key default gen_random_uuid(),
  fund_id    uuid not null references funds (id) on delete cascade,
  tipo       tipo_evento not null,
  ocorreu_em timestamptz not null default now(),
  payload    jsonb not null default '{}',
  -- sha256(fund_id || tipo || defining fields). Deliberately excludes any
  -- timestamp, so replaying the whole pipeline emits zero duplicate events and
  -- the ingestion job is safe to retry.
  impressao  text not null,
  alertavel  boolean not null default true,
  criado_em  timestamptz not null default now()
);

create unique index fund_events_impressao on fund_events (impressao);
create index fund_events_por_alertar on fund_events (criado_em desc) where alertavel;

-- ---------------------------------------------------------------------------
-- Utilizadores
-- ---------------------------------------------------------------------------

create table profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nome               text,
  concelho           text,
  distrito           text,
  tipos_beneficiario tipo_beneficiario[] not null default '{particular}',
  frequencia         text not null default 'diaria'
                       check (frequencia in ('imediata', 'diaria', 'semanal')),
  fuso               text not null default 'Europe/Lisbon',
  locale             text not null default 'pt-PT',
  -- RGPD: the *version* matters. When the policy changes materially you must be
  -- able to prove which text each user agreed to.
  consentimento_em     timestamptz,
  consentimento_versao text,
  cancelou_em          timestamptz,
  criado_em            timestamptz not null default now()
);

create table subscriptions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  medida    text not null,
  activa    boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (user_id, medida)
);

create index subscriptions_medida on subscriptions (medida) where activa;

-- ---------------------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------------------

create table alerts_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  fund_id    uuid not null references funds (id) on delete cascade,
  tipo       tipo_evento not null,
  impressao  text not null,
  enviado_em timestamptz not null default now(),
  message_id text,
  -- The dedup ledger. Claimed inside the same transaction that queues the email,
  -- before sending, so a retried run can lose a message but never duplicate one.
  unique (user_id, impressao)
);

create table alerts_outbox (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  agendado_para timestamptz not null,
  eventos       uuid[] not null,
  estado        text not null default 'pendente'
                  check (estado in ('pendente', 'enviado', 'falhou')),
  tentativas    int not null default 0,
  ultimo_erro   text,
  criado_em     timestamptz not null default now()
);

create index alerts_outbox_por_enviar on alerts_outbox (agendado_para)
  where estado = 'pendente';

create table unsubscribe_tokens (
  token     text primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  -- null = unsubscribe from everything; otherwise just this measure. Granular
  -- opt-out keeps users who would otherwise leave entirely.
  medida    text,
  expira_em timestamptz
);

-- ---------------------------------------------------------------------------
-- Operações
-- ---------------------------------------------------------------------------

create table ingest_runs (
  id           uuid primary key default gen_random_uuid(),
  iniciado_em  timestamptz not null default now(),
  terminado_em timestamptz,
  estado       text not null default 'a_correr'
                 check (estado in ('a_correr', 'ok', 'parcial', 'falhou')),
  git_sha      text,
  resumo       jsonb not null default '{}'
);

create index ingest_runs_recentes on ingest_runs (iniciado_em desc);

create table source_health (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references ingest_runs (id) on delete cascade,
  source_id           text not null references sources (id) on delete cascade,
  http_status         int,
  bytes               int,
  duracao_ms          int,
  candidatos          int not null default 0,
  candidatos_com_data int not null default 0,
  extraccoes_ok       int not null default 0,
  extraccoes_revisao  int not null default 0,
  provas_falhadas     int not null default 0,
  tokens_cache_lidos  int not null default 0,
  erro                text,
  criado_em           timestamptz not null default now()
);

create index source_health_recentes on source_health (source_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles            enable row level security;
alter table subscriptions       enable row level security;
alter table alerts_sent         enable row level security;
alter table alerts_outbox       enable row level security;
alter table unsubscribe_tokens  enable row level security;
alter table funds               enable row level security;
alter table fund_slugs          enable row level security;
alter table fund_events         enable row level security;
alter table sources             enable row level security;
alter table snapshots           enable row level security;
alter table fund_identities     enable row level security;
alter table fund_extractions    enable row level security;
alter table ingest_runs         enable row level security;
alter table source_health       enable row level security;

-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once per
-- statement rather than once per row — it matters on the subscriptions join.
create policy perfil_proprio on profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy subscricoes_proprias on subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- History is read-only to the user; only the alerting job writes it.
create policy alertas_proprios_leitura on alerts_sent
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only what passed the trust gate is public.
create policy apoios_publicados on funds
  for select to anon, authenticated
  using (publicado = true);

create policy eventos_publicados on fund_events
  for select to anon, authenticated
  using (exists (
    select 1 from funds f where f.id = fund_events.fund_id and f.publicado
  ));

create policy fontes_publicas on sources
  for select to anon, authenticated
  using (true);

-- Old slugs resolve for the same funds the catalogue shows, and no others.
--
-- This table was left out of the RLS block above until Supabase's advisor caught it
-- against the live project. The anon key ships in the browser by design; what makes
-- that safe is RLS, and here there was none — so anyone holding it could repoint a
-- retired Apoios URL at a different fund, or delete the mapping and break every
-- shared link. No personal data, but this product's whole claim is that a link takes
-- you to the right notice.
--
-- Read-only for anon: writes belong to the ingestion role and service_role.
create policy slugs_publicados on fund_slugs
  for select to anon, authenticated
  using (exists (
    select 1 from funds f where f.id = fund_slugs.fund_id and f.publicado
  ));

-- alerts_outbox, unsubscribe_tokens, snapshots, fund_identities,
-- fund_extractions, ingest_runs and source_health get NO policy, so RLS denies
-- everything to anon and authenticated. They are reached only by service_role or
-- by SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------
-- Papel restrito para a ingestão
--
-- Used by the public GitHub Actions workflow. It cannot read a single row of
-- personal data, so a stray query or a leaked credential cannot turn into an
-- RGPD breach. Create the role and set its password out of band:
--
--   create role apoios_ingest with login password '...';
--
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'apoios_ingest') then
    execute 'grant usage on schema public to apoios_ingest';
    execute 'grant select, insert, update on
               sources, snapshots, funds, fund_slugs, fund_identities,
               fund_extractions, fund_events, ingest_runs, source_health
             to apoios_ingest';
    execute 'grant usage, select on all sequences in schema public to apoios_ingest';
    -- Deliberately absent: profiles, subscriptions, alerts_sent, alerts_outbox,
    -- unsubscribe_tokens, and everything in auth.

    -- Grants alone are not enough, and the way they fail is quiet. RLS is on for
    -- all nine tables, apoios_ingest has no BYPASSRLS and owns none of them, so
    -- with no policy naming it every select returns zero rows and every insert
    -- is rejected — ingestion would look like it ran and found nothing.
    --
    -- The role's security boundary stays the grant list above. These policies
    -- only stop RLS from shadow-blocking a role that is already fenced in; they
    -- cannot widen that fence, because where there is no grant there is nothing
    -- for a policy to unlock.
    foreach t in array array[
      'sources', 'snapshots', 'funds', 'fund_slugs', 'fund_identities',
      'fund_extractions', 'fund_events', 'ingest_runs', 'source_health'
    ]
    loop
      execute format(
        'create policy ingestao_%s on %I for all to apoios_ingest '
        'using (true) with check (true)', t, t);
    end loop;
  end if;
end
$$;
