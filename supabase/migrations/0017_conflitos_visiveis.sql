-- ---------------------------------------------------------------------------
-- Um conflito de identidade deixa de se perder
--
-- Quando a resolução de identidade encontra duas chaves que apontam para apoios
-- diferentes, o apoio não é gravado e o pipeline regista um conflito. Até agora
-- esse conflito era impresso na consola e mais nada: o `resumo` que fica em
-- `ingest_runs` não o levava, por isso quem olhasse para a base de dados via uma
-- corrida `ok` e nunca sabia que faltava um apoio. A linha existia mesmo — no log
-- do GitHub Actions, que expira.
--
-- Encontrado ao ligar a fonte dos avisos abertos do PT2030: a corrida leu cinco
-- avisos e gravou quatro, e o quinto não deixou rasto em `funds`, em
-- `fund_identities` nem aqui. É o mesmo defeito do plano anual — trabalho feito,
-- resultado deitado fora em silêncio — noutro sítio.
--
-- O `cli.ts` passou a pôr `conflitos` no resumo. Esta função lê-o de lá.
--
-- Vive aqui, e não no pipeline, por duas razões. A primeira é a de sempre: o
-- vigia não deve partilhar destino com aquilo que vigia. A segunda é que assim o
-- papel `apoios_ingest` não ganha permissão nenhuma nova — ele já escreve
-- `ingest_runs`, e mais nada é preciso.
-- ---------------------------------------------------------------------------

create or replace function assinalar_conflitos_de_identidade()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ultima      ingest_runs%rowtype;
  total       int;
  detalhe     text;
begin
  select * into ultima
    from ingest_runs
   where estado = 'ok' and terminado_em is not null
   order by terminado_em desc
   limit 1;

  if not found then
    return;
  end if;

  -- Só corridas mais recentes do que o último alerta deste tipo.
  --
  -- Sem isto, um alerta resolvido à mão voltava a nascer na hora seguinte a
  -- falar da mesma corrida, e um alerta que reaparece sozinho ensina-se a
  -- ignorar. Assim, resolver quer mesmo dizer resolvido: só uma corrida NOVA
  -- com conflitos volta a chamar alguém.
  if exists (
    select 1 from alertas_operador
     where tipo = 'conflitos_de_identidade'
       and criado_em >= ultima.terminado_em
  ) then
    return;
  end if;

  select
    coalesce(sum(jsonb_array_length(coalesce(f -> 'conflitos', '[]'::jsonb))), 0),
    string_agg(
      format('%s: %s', f ->> 'fonte', c.valor),
      E'\n'
      order by f ->> 'fonte'
    )
  into total, detalhe
  from jsonb_array_elements(ultima.resumo -> 'fontes') as f
  left join lateral jsonb_array_elements_text(
    coalesce(f -> 'conflitos', '[]'::jsonb)
  ) as c(valor) on true
  where jsonb_array_length(coalesce(f -> 'conflitos', '[]'::jsonb)) > 0;

  if coalesce(total, 0) = 0 then
    return;
  end if;

  insert into alertas_operador (tipo, mensagem)
  values (
    'conflitos_de_identidade',
    format(
      '%s apoio(s) não foram gravados na corrida de %s por conflito de identidade. '
      || 'Cada um é um apoio que existe na fonte e não existe no catálogo.'
      || E'\n\n%s',
      total,
      to_char(ultima.terminado_em at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'),
      coalesce(detalhe, '(sem detalhe)')
    )
  );
end;
$$;

-- Fora do alcance da API pública, como todas as outras `security definer`.
revoke all on function assinalar_conflitos_de_identidade() from public, anon, authenticated;

-- Aos 47, longe do vigia da ingestão (:17) e das tarefas de alerta.
select cron.schedule(
  'assinalar-conflitos-de-identidade',
  '47 * * * *',
  $$select assinalar_conflitos_de_identidade()$$
);

comment on function assinalar_conflitos_de_identidade() is
  'Levanta um alerta de operador quando a última corrida de ingestão registou '
  'conflitos de identidade. Um conflito é um apoio que a fonte tem e o catálogo '
  'não — antes disto, só existia num log que expira.';
