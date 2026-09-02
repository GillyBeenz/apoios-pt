-- Clock-driven events and the ingestion watchdog.
--
-- Both of these exist because something important cannot be observed from inside
-- the thing that would otherwise be responsible for it:
--
--   * "Closes in 7 days" is a function of the calendar, not of a page changing.
--     In the scraper it would fire only on days a notice happened to be edited —
--     almost never, and least of all in the quiet final week when it matters most.
--
--   * A check that ingestion is running cannot live inside the ingestion job.
--     GitHub disables scheduled workflows after 60 days of repository inactivity,
--     and a job that never fires also never runs its own health checks.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Fingerprint, mirroring packages/core/src/diferencas.ts.
-- Excludes any timestamp, so re-running emits no duplicates.
-- ---------------------------------------------------------------------------

create or replace function impressao_evento(
  p_fund_id uuid,
  p_tipo    text,
  p_definidor jsonb
) returns text
language sql
immutable
as $$
  select encode(
    digest(p_fund_id::text || ' ' || p_tipo || ' ' || p_definidor::text, 'sha256'),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- Varrimento temporal
-- ---------------------------------------------------------------------------

create or replace function sweep_eventos_temporais()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inseridos int := 0;
  v_limiar    int;
  v_agora     timestamptz := now();
begin
  -- fecha_em_breve, tightest threshold first so a fund three days out is told
  -- "3 days", not "14". Each threshold is part of the fingerprint, so each fires
  -- exactly once per fund, for ever.
  foreach v_limiar in array array[1, 3, 7, 14]
  loop
    insert into fund_events (fund_id, tipo, ocorreu_em, payload, impressao, alertavel)
    select
      f.id,
      'fecha_em_breve',
      v_agora,
      jsonb_build_object(
        'limiarDias', v_limiar,
        'diasRestantes', floor(extract(epoch from (f.fecha_em - v_agora)) / 86400)::int,
        'fechaEm', f.fecha_em
      ),
      impressao_evento(f.id, 'fecha_em_breve', jsonb_build_object('limiarDias', v_limiar)),
      true
    from funds f
    where f.publicado
      and f.alertavel
      and f.estado = 'aberto'
      -- An exhausted budget means the window is already shut in practice;
      -- counting down to a deadline nobody can meet is actively misleading.
      and not f.dotacao_esgotada
      -- A month-precision deadline cannot support an honest countdown.
      and f.fecha_em_precisao in ('minuto', 'dia')
      and f.fecha_em > v_agora
      and f.fecha_em <= v_agora + make_interval(days => v_limiar)
    on conflict (impressao) do nothing;

    get diagnostics v_inseridos = row_count;
  end loop;

  -- Announced programmes routinely slip their stated opening date, so the clock
  -- alone can never justify claiming a fund is open. `confirmado: false` is what
  -- makes the email say "está previsto abrir hoje" rather than "abriu".
  insert into fund_events (fund_id, tipo, ocorreu_em, payload, impressao, alertavel)
  select
    f.id,
    'abriu',
    v_agora,
    jsonb_build_object('confirmado', false, 'abreEm', f.abre_em),
    impressao_evento(f.id, 'abriu', jsonb_build_object('de', 'previsto')),
    f.alertavel
  from funds f
  where f.publicado
    and f.estado = 'previsto'
    and f.abre_em_precisao in ('minuto', 'dia')
    and f.abre_em <= v_agora
  on conflict (impressao) do nothing;

  -- Closing by the clock corrects the catalogue and stops the countdown, but
  -- sends nothing: nobody wants an email telling them they missed it.
  insert into fund_events (fund_id, tipo, ocorreu_em, payload, impressao, alertavel)
  select
    f.id,
    'encerrou',
    v_agora,
    jsonb_build_object('porRelogio', true, 'fechaEm', f.fecha_em),
    impressao_evento(f.id, 'encerrou', jsonb_build_object('de', 'aberto')),
    false
  from funds f
  where f.publicado
    and f.estado = 'aberto'
    and f.fecha_em_precisao in ('minuto', 'dia')
    and f.fecha_em < v_agora
  on conflict (impressao) do nothing;

  update funds
  set estado = 'encerrado', actualizado_em = v_agora
  where estado = 'aberto'
    and fecha_em_precisao in ('minuto', 'dia')
    and fecha_em < v_agora;

  return v_inseridos;
end;
$$;

-- 06:00 UTC: deliberately before the 08:00 Europe/Lisbon send window, so the
-- day's events exist by the time the digest is assembled.
select cron.schedule('varrimento-temporal', '0 6 * * *', $$select sweep_eventos_temporais()$$);

-- ---------------------------------------------------------------------------
-- Vigia da ingestão
--
-- Lives here, in Supabase, precisely because it must not share fate with the
-- thing it watches. Every other health rule runs inside the GitHub Actions job
-- and therefore cannot detect that job silently ceasing to run.
-- ---------------------------------------------------------------------------

create table if not exists alertas_operador (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  mensagem   text not null,
  criado_em  timestamptz not null default now(),
  resolvido_em timestamptz
);

alter table alertas_operador enable row level security;

create or replace function vigiar_ingestao()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from ingest_runs
    where estado = 'ok' and terminado_em > now() - interval '36 hours'
  ) and not exists (
    select 1 from alertas_operador
    where tipo = 'ingestao_parada' and resolvido_em is null
  ) then
    insert into alertas_operador (tipo, mensagem)
    values (
      'ingestao_parada',
      'Sem execução de ingestão bem-sucedida há mais de 36 horas. ' ||
      'Verificar se o workflow agendado foi desativado por inatividade do repositório.'
    );
  end if;
end;
$$;

select cron.schedule('vigia-ingestao', '17 * * * *', $$select vigiar_ingestao()$$);
