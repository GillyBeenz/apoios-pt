-- 0010 — Um limite excedido não é um alerta perdido
--
-- O `confirmar_envios` do 0008 tratava qualquer resposta não-2xx como definitiva:
-- `estado = 'falhou'`, e o `enviar_alertas` só vai buscar `'pendente'`. Uma linha
-- em `falhou` nunca mais é tentada. E como o `alerts_sent` reserva a impressão
-- **antes** do envio, o `emparelhar_alertas` também nunca a volta a enfileirar.
--
-- Ou seja: uma resposta 429 do Resend apagava o alerta para sempre.
--
-- Isto importa porque a conta está no plano gratuito, com tecto diário. O modo de
-- falha é exactamente o pior que este produto tem: abre um aviso concorrido, a
-- fila enche, os primeiros passam, os restantes levam 429, e as pessoas que nunca
-- foram avisadas não aparecem em lado nenhum como estando por avisar. O produto
-- existe para dizer "isto abriu antes de fechar" e cala-se precisamente no dia em
-- que teria mais a dizer.
--
-- A coluna `tentativas` já existia desde o 0008, com `default 0`, e nunca era
-- lida para decidir nada — o `enviar_alertas` incrementa-a e mais ninguém olha
-- para ela. A máquina de repetição estava meia construída.
--
-- Separa-se agora o que é transitório do que é definitivo:
--
--   429          limite excedido — amanhã há mais
--   5xx          avaria do lado deles
--   sem resposta a chamada nem chegou lá (error_msg do pg_net)
--
-- Tudo o resto — um endereço recusado, um domínio por verificar, um corpo
-- malformado — é definitivo, e repetir só gastaria quota a produzir o mesmo erro.
--
-- O `random()` na espera não é enfeite. Sem ele, oitenta alertas recusados pelo
-- mesmo 429 voltam todos no mesmo instante e batem no mesmo tecto outra vez.

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
           o.tentativas,
           resp.status_code,
           resp.content,
           resp.error_msg
      from alerts_outbox o
      join net._http_response resp on resp.id = o.pedido_id
     where o.estado = 'a_enviar'
  ),
  decididas as (
    select r.*,
           (r.status_code between 200 and 299) as ok,
           (
             r.status_code = 429
             or r.status_code >= 500
             or r.status_code is null
             or r.error_msg is not null
           ) as transitorio
      from respostas r
  )
  update alerts_outbox o
     set estado = case
           when d.ok then 'enviado'
           -- Cinco tentativas cobrem ~31 horas, o que atravessa uma reposição do
           -- tecto diário. Ao fim disso o problema não é passageiro.
           when d.transitorio and o.tentativas < 5 then 'pendente'
           else 'falhou'
         end,
         agendado_para = case
           when not d.ok and d.transitorio and o.tentativas < 5
             then now()
                  + case o.tentativas
                      when 1 then interval '15 minutes'
                      when 2 then interval '1 hour'
                      when 3 then interval '6 hours'
                      else interval '24 hours'
                    end
                  + (random() * interval '10 minutes')
           else o.agendado_para
         end,
         -- O corpo do erro do Resend diz *porquê*: domínio por verificar, endereço
         -- recusado, limite excedido. Guardá-lo é a diferença entre saber e
         -- adivinhar, e agora é também o que explica uma linha que vai repetir.
         ultimo_erro = case when d.ok then null
                            else coalesce(d.error_msg, left(d.content, 500)) end,
         -- Limpo em qualquer caso que não seja sucesso: uma linha que volta a
         -- 'pendente' com o `pedido_id` antigo far-se-ia confirmar contra a
         -- resposta velha na execução seguinte, antes sequer de reenviar.
         pedido_id = case when d.ok then o.pedido_id else null end
    from decididas d
   where o.id = d.id;

  get diagnostics confirmados = row_count;
  return confirmados;
end;
$fn$;

revoke all on function confirmar_envios() from public;
