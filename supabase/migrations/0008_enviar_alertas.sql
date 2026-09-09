-- Enviar o que está na fila.
--
-- Corre dentro do Supabase, pelas mesmas razões da 0007: a fila tem endereços de
-- email e o que cada pessoa quer melhorar em casa, e o papel do Actions não tem — nem
-- pode ter — permissão para os ler.
--
-- Duas fases, e não uma, porque o `pg_net` é assíncrono: o `http_post` devolve um id
-- e a resposta chega mais tarde a `net._http_response`. Fingir que é síncrono seria
-- marcar como "enviado" aquilo que ainda não se sabe se saiu — e um alerta dado como
-- entregue e perdido é exactamente o que este produto não pode fazer.
--
--   enviar_alertas()    reserva as linhas devidas, dispara, guarda o id do pedido
--   confirmar_envios()  lê a resposta e marca 'enviado' ou 'falhou' com o erro

alter table alerts_outbox add column pedido_id bigint;

alter table alerts_outbox drop constraint alerts_outbox_estado_check;
alter table alerts_outbox add constraint alerts_outbox_estado_check
  check (estado in ('pendente', 'a_enviar', 'enviado', 'falhou'));

create index alerts_outbox_a_confirmar on alerts_outbox (pedido_id)
  where estado = 'a_enviar';

-- ---------------------------------------------------------------------------
-- O conteúdo
-- ---------------------------------------------------------------------------

/** Escape, porque o título vem de um documento do Estado e não de nós. */
create or replace function escapar_html(p text)
returns text language sql immutable set search_path = pg_temp as $fn$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$fn$;

/**
 * O corpo de um alerta.
 *
 * Escrito em SQL por uma razão só: assim o texto e os dados nunca saem da base. A
 * alternativa — uma Edge Function — dava HTML mais confortável de escrever, mas
 * obrigava a guardar também a chave `service_role` para a invocar, e essa é uma
 * chave a mais dentro de um sistema que existe para não ter chaves a mais.
 *
 * Cada apoio leva o prazo e a ligação para o aviso oficial. O rodapé diz sempre que
 * o aviso oficial prevalece: é a mesma frase do site, e um email que a omitisse
 * estaria a prometer mais do que o produto sabe.
 */
create or replace function corpo_alerta(p_user_id uuid, p_eventos uuid[])
returns jsonb
language plpgsql
-- Volatile, e não `stable`: mints o token de cancelamento na primeira vez que
-- precisa dele, e o Postgres recusa um INSERT dentro de uma função não-volátil.
-- Declarar `stable` por hábito rebentaria no primeiro alerta a sair.
security definer
set search_path = public, pg_temp
as $fn$
declare
  linhas text := '';
  linhas_txt text := '';
  n int := 0;
  r record;
  token text;
begin
  for r in
    select distinct on (f.id)
           f.titulo, f.slug, f.fecha_em, f.url_oficial, e.tipo
      from fund_events e
      join funds f on f.id = e.fund_id
     where e.id = any (p_eventos)
     order by f.id, e.ocorreu_em desc
  loop
    n := n + 1;
    linhas := linhas || format(
      '<tr><td style="padding:14px 0;border-bottom:1px solid #e6e8e3;">' ||
      '<a href="https://appoios.guru/apoios/%s" style="color:#1c5c3f;font-weight:600;text-decoration:none;font-size:15px;">%s</a>' ||
      '<div style="margin-top:4px;font-size:13px;color:#5b665e;">%s</div></td></tr>',
      r.slug,
      escapar_html(r.titulo),
      case
        when r.fecha_em is null then 'Sem prazo indicado no aviso.'
        else 'Candidaturas até ' || to_char(r.fecha_em at time zone 'Europe/Lisbon', 'DD/MM/YYYY') || '.'
      end
    );
    linhas_txt := linhas_txt || format(
      E'- %s\n  https://appoios.guru/apoios/%s\n', r.titulo, r.slug
    );
  end loop;

  if n = 0 then
    return null;
  end if;

  token := token_cancelamento(p_user_id, null);

  return jsonb_build_object(
    'assunto',
    case when n = 1 then 'Abriu um apoio a que se pode candidatar'
         else format('Abriram %s apoios a que se pode candidatar', n) end,
    'html',
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1b231f;">' ||
    '<div style="background:#1c5c3f;padding:22px 24px;border-radius:0 0 14px 14px;">' ||
    '<p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Appoios</p>' ||
    '<p style="margin:3px 0 0;font-size:13px;color:#9ae6b4;">Financiamento ambiental para a sua casa</p></div>' ||
    '<div style="padding:24px;">' ||
    '<table style="width:100%;border-collapse:collapse;">' || linhas || '</table>' ||
    '<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#5b665e;">' ||
    'O aviso oficial prevalece sempre. Confirme as condições na página da entidade antes de se candidatar.</p>' ||
    '<p style="margin:18px 0 0;font-size:12px;color:#8a9490;">' ||
    format('<a href="https://appoios.guru/cancelar/%s" style="color:#8a9490;">Cancelar estes alertas</a>', token) ||
    ' &middot; <a href="https://appoios.guru/conta/preferencias" style="color:#8a9490;">Preferências</a></p>' ||
    '</div></div>',
    'texto',
    format(E'Appoios — financiamento ambiental para a sua casa\n\n%s\nO aviso oficial prevalece sempre.\n\nCancelar: https://appoios.guru/cancelar/%s\n', linhas_txt, token),
    'cancelar_url', format('https://appoios.guru/cancelar/%s', token)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Fase 1: reservar e disparar
-- ---------------------------------------------------------------------------

create or replace function enviar_alertas()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  chave text;
  r record;
  corpo jsonb;
  email text;
  pedido bigint;
  enviados int := 0;
begin
  select decrypted_secret into chave
    from vault.decrypted_secrets where name = 'RESEND_API_KEY';
  if chave is null then
    raise notice 'RESEND_API_KEY não está no Vault; nada foi enviado.';
    return 0;
  end if;

  for r in
    -- `for update skip locked` para que duas execuções sobrepostas não disparem a
    -- mesma linha duas vezes. Poucas de cada vez: uma fila que se esvazia devagar
    -- é preferível a um lote que rebenta no meio e deixa metade por saber.
    select o.id, o.user_id, o.eventos
      from alerts_outbox o
     where o.estado = 'pendente' and o.agendado_para <= now()
     order by o.agendado_para
     limit 20
       for update skip locked
  loop
    select u.email into email from auth.users u where u.id = r.user_id;
    corpo := corpo_alerta(r.user_id, r.eventos);

    -- Sem destinatário ou sem conteúdo não há nada a enviar, e deixar a linha
    -- 'pendente' faria a fila tentar para sempre.
    if email is null or corpo is null then
      update alerts_outbox
         set estado = 'falhou',
             ultimo_erro = coalesce(
               case when email is null then 'utilizador sem email' end,
               'nenhum apoio publicado entre os eventos'),
             tentativas = tentativas + 1
       where id = r.id;
      continue;
    end if;

    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || chave,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'Appoios <alertas@appoios.guru>',
        'to', jsonb_build_array(email),
        'subject', corpo->>'assunto',
        'html', corpo->>'html',
        'text', corpo->>'texto',
        -- Um cabeçalho que o cliente de email percebe, para quem cancela sem
        -- procurar a ligação no rodapé.
        'headers', jsonb_build_object('List-Unsubscribe', '<' || (corpo->>'cancelar_url') || '>')
      )
    ) into pedido;

    update alerts_outbox
       set estado = 'a_enviar', pedido_id = pedido, tentativas = tentativas + 1
     where id = r.id;
    enviados := enviados + 1;
  end loop;

  return enviados;
end;
$fn$;

revoke all on function enviar_alertas() from public;

-- ---------------------------------------------------------------------------
-- Fase 2: confirmar
-- ---------------------------------------------------------------------------

create or replace function confirmar_envios()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  confirmados int := 0;
begin
  with respostas as (
    select o.id,
           resp.status_code,
           resp.content,
           resp.error_msg
      from alerts_outbox o
      join net._http_response resp on resp.id = o.pedido_id
     where o.estado = 'a_enviar'
  )
  update alerts_outbox o
     set estado = case when r.status_code between 200 and 299 then 'enviado' else 'falhou' end,
         -- O corpo do erro do Resend diz *porquê*: domínio por verificar, endereço
         -- recusado, limite excedido. Guardá-lo é a diferença entre saber e adivinhar.
         ultimo_erro = case when r.status_code between 200 and 299 then null
                            else coalesce(r.error_msg, left(r.content, 500)) end
    from respostas r
   where o.id = r.id;

  get diagnostics confirmados = row_count;
  return confirmados;
end;
$fn$;

revoke all on function confirmar_envios() from public;

select cron.schedule('enviar-alertas', '*/5 * * * *', $cron$select enviar_alertas()$cron$);
select cron.schedule('confirmar-envios', '2-59/5 * * * *', $cron$select confirmar_envios()$cron$);
