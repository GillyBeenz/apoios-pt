-- Emparelhar eventos com quem os quer receber, e pôr em fila para envio.
--
-- Corre **dentro** do Supabase e não no GitHub Actions, e isso não é uma
-- preferência: o papel `apoios_ingest` não tem propositadamente nenhuma permissão
-- sobre `profiles`, `subscriptions` ou `alerts_outbox`, porque os registos do
-- Actions são públicos neste repositório. Emparelhar alertas lê endereços de email
-- e o que cada pessoa quer melhorar em casa. Isso nunca pode passar por um log
-- público — e a forma de garantir que não passa é não dar a chave, não lembrar-se
-- de não imprimir.
--
-- Esta migração **não envia** nada. Só decide quem recebe o quê e quando, e deixa
-- a fila pronta. O envio é a peça seguinte e precisa de uma chave do Resend.

-- ---------------------------------------------------------------------------
-- Quando é que a próxima mensagem sai
-- ---------------------------------------------------------------------------

/**
 * A página de preferências promete, por escrito, que "avisos urgentes — como a
 * dotação esgotar-se — são enviados de imediato, independentemente da frequência
 * escolhida". Isto é essa promessa em código; se as duas divergirem, é o texto que
 * está a mentir a alguém sobre dinheiro.
 */
create or replace function proximo_envio(p_frequencia text, p_urgente boolean)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_urgente or p_frequencia = 'imediata' then now()
    when p_frequencia = 'semanal' then
      -- Próxima segunda às 08:00 de Lisboa. `date_trunc('week')` em Postgres já
      -- começa a semana à segunda, que é o que se quer aqui.
      (date_trunc('week', (now() at time zone 'Europe/Lisbon') + interval '1 week')
        + interval '8 hours') at time zone 'Europe/Lisbon'
    else
      -- Diária: hoje às 08:00 se ainda não passou, senão amanhã.
      case
        when (now() at time zone 'Europe/Lisbon')::time < time '08:00'
          then ((now() at time zone 'Europe/Lisbon')::date + time '08:00')
                 at time zone 'Europe/Lisbon'
        else (((now() at time zone 'Europe/Lisbon')::date + 1) + time '08:00')
               at time zone 'Europe/Lisbon'
      end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Emparelhamento
-- ---------------------------------------------------------------------------

/**
 * Quem recebe que evento.
 *
 * O portão é fechado por omissão em todos os eixos, porque o dano de um falso
 * positivo aqui é uma pessoa a preparar uma candidatura para um apoio a que não se
 * pode candidatar:
 *
 *   * `f.publicado` — nunca se alerta sobre o que o catálogo não mostra.
 *   * `f.alertavel` e `e.alertavel` — os dois portões que o pipeline já calcula.
 *   * `f.admite_particulares = 'sim'` — o tri-estado existe exactamente para isto.
 *     "desconhecido" não é "provavelmente sim". Repetido aqui de propósito, apesar
 *     de o `alertavel` já o dever cobrir: é a afirmação que mais custa errar.
 *   * `p.cancelou_em is null` — quem cancelou não recebe, mesmo que a subscrição
 *     tenha ficado activa por engano.
 *   * intersecção real entre os beneficiários do apoio e os da pessoa.
 *
 * A reserva em `alerts_sent` acontece **antes** de qualquer envio, na mesma
 * transacção, e é o `unique (user_id, impressao)` que a torna atómica: uma execução
 * repetida pode perder uma mensagem, nunca duplicá-la. Perder é recuperável — a
 * pessoa vê o apoio no site; duplicar destrói a confiança que faz alguém abrir o
 * email seguinte.
 */
create or replace function emparelhar_alertas()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  novos int;
begin
  with candidatos as (
    select distinct
      s.user_id,
      e.id          as evento_id,
      e.impressao,
      e.tipo,
      pr.frequencia,
      -- Urgente: a dotação acabou, o prazo mexeu, ou está prestes a fechar. Nos
      -- três casos esperar pelo resumo de segunda-feira pode custar a candidatura.
      -- Os rótulos vêm do enum `tipo_evento` e foram confirmados contra a base:
      -- é `fecha_em_breve`, não `encerra_em_breve`.
      (e.tipo in ('dotacao_esgotada', 'prazo_alterado', 'fecha_em_breve')) as urgente
    from fund_events e
    join funds f          on f.id = e.fund_id
    join subscriptions s  on s.activa and s.medida = any (f.medidas)
    join profiles pr      on pr.id = s.user_id
    where e.alertavel
      and f.publicado
      and f.alertavel
      and f.admite_particulares = 'sim'
      and pr.cancelou_em is null
      and pr.tipos_beneficiario && f.beneficiarios
      -- Uma janela, para que a função não releia o histórico inteiro a cada 15
      -- minutos. O `alerts_sent` é que garante que nada se repete; isto é só para
      -- a consulta não crescer sem fim.
      and e.criado_em > now() - interval '30 days'
  ),
  reservados as (
    insert into alerts_sent (user_id, fund_id, tipo, impressao)
    select c.user_id, e.fund_id, c.tipo, c.impressao
      from candidatos c
      join fund_events e on e.id = c.evento_id
    on conflict (user_id, impressao) do nothing
    returning user_id, impressao
  ),
  -- Só o que foi mesmo reservado agora. Um `returning` de um `on conflict do
  -- nothing` devolve apenas as linhas inseridas, que é exactamente a definição de
  -- "ainda não avisámos esta pessoa disto".
  a_enfileirar as (
    select c.user_id,
           c.evento_id,
           max(c.frequencia)          as frequencia,
           bool_or(c.urgente)         as urgente
      from candidatos c
      join reservados r
        on r.user_id = c.user_id and r.impressao = c.impressao
     group by c.user_id, c.evento_id
  ),
  por_utilizador as (
    select user_id,
           array_agg(evento_id)                        as eventos,
           proximo_envio(max(frequencia), bool_or(urgente)) as agendado_para
      from a_enfileirar
     group by user_id
  )
  insert into alerts_outbox (user_id, agendado_para, eventos)
  select user_id, agendado_para, eventos from por_utilizador;

  get diagnostics novos = row_count;
  return novos;
end;
$$;

revoke all on function emparelhar_alertas() from public;

-- De quarto em quarto de hora. Não de minuto a minuto: um apoio que abre não fica
-- menos aberto em quinze minutos, e a diferença é ruído na base de dados.
select cron.schedule(
  'emparelhar-alertas',
  '*/15 * * * *',
  $$select emparelhar_alertas()$$
);

-- ---------------------------------------------------------------------------
-- Cancelar subscrição
-- ---------------------------------------------------------------------------

/**
 * Um token opaco por pessoa e por medida, para a ligação de cancelamento que vai em
 * cada email.
 *
 * Guardado em vez de assinado: um token em tabela pode ser revogado, e o `medida`
 * anulável dá o cancelamento granular que evita perder quem só queria deixar de
 * receber sobre uma coisa. Sem expiração por omissão — um email de há dois anos
 * tem de continuar a poder cancelar, que é o que o RGPD e o bom senso pedem.
 */
create or replace function token_cancelamento(p_user_id uuid, p_medida text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  t text;
begin
  select token into t
    from unsubscribe_tokens
   where user_id = p_user_id and medida is not distinct from p_medida
   limit 1;

  if t is not null then
    return t;
  end if;

  -- base64url à mão: o `encode` do Postgres não o faz, e um `+` ou um `/` num
  -- token dentro de um URL é uma ligação de cancelamento que não funciona.
  t := replace(replace(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+', '-'), '/', '_');

  insert into unsubscribe_tokens (token, user_id, medida) values (t, p_user_id, p_medida);
  return t;
end;
$$;

revoke all on function token_cancelamento(uuid, text) from public;

/**
 * Aplicar um cancelamento vindo de uma ligação de email.
 *
 * SECURITY DEFINER e aberta ao papel `anon` porque quem clica não tem sessão
 * iniciada — e exigir início de sessão para cancelar seria pôr um obstáculo
 * exactamente onde o RGPD e o bom senso dizem para não pôr nenhum.
 *
 * O token é a única credencial, e é isso que a torna suficiente: 24 bytes
 * aleatórios não se adivinham, e não revela nada sobre quem é a pessoa. Devolve o
 * mesmo texto para um token válido e para um inválido — dizer "esse token não
 * existe" transformaria isto num oráculo de subscrições.
 */
create or replace function cancelar_subscricao(p_token text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reg unsubscribe_tokens%rowtype;
begin
  select * into reg
    from unsubscribe_tokens
   where token = p_token
     and (expira_em is null or expira_em > now());

  if not found then
    return 'desconhecido';
  end if;

  if reg.medida is null then
    update profiles set cancelou_em = now() where id = reg.user_id;
    update subscriptions set activa = false where user_id = reg.user_id;
    return 'tudo';
  end if;

  update subscriptions
     set activa = false
   where user_id = reg.user_id and medida = reg.medida;
  return reg.medida;
end;
$$;

revoke all on function cancelar_subscricao(text) from public;
grant execute on function cancelar_subscricao(text) to anon, authenticated;
