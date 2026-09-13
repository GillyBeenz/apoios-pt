-- 0009 — O condomínio é uma porta, não uma parede
--
-- Um aviso fechado a pessoas singulares mas aberto a condomínios não é um beco
-- sem saída para um proprietário: é a via normal para tudo o que toca no edifício
-- em vez de na fracção. A taxonomia já dizia isto — `BENEFICIARIOS_PROPRIETARIO`
-- inclui `condominio` e o comentário diz "directamente ou colectivamente" — e o
-- `corresponde()` em TypeScript já o respeitava, bloqueando apenas quem tivesse
-- `particular` como único tipo escolhido.
--
-- Dois portões mais grosseiros é que nunca acompanharam: o `decidir()` no
-- `portao.ts`, corrigido no mesmo PR, e esta função.
--
-- Substitui a função criada em 0007. O resto do corpo é idêntico.

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
      and pr.cancelou_em is null
      and pr.tipos_beneficiario && f.beneficiarios
      -- Duas portas, e ambas exigem uma afirmação explícita dos dois lados.
      --
      -- A primeira é a de sempre: o aviso admite pessoas singulares.
      --
      -- A segunda é o condomínio. Um proprietário faz obras na cobertura, na
      -- fachada, nos elevadores ou em solar colectivo *através* do condomínio,
      -- nunca como pessoa singular — o `BENEFICIARIOS_PROPRIETARIO` da taxonomia
      -- diz "directamente ou colectivamente" desde o início, e era esta linha que
      -- não concordava. O `Programa de Apoio a Condomínios Residenciais` do Fundo
      -- Ambiental é real e esta condição sozinha mantinha-o fora de todas as
      -- caixas de correio.
      --
      -- Não é um afrouxamento. O aviso tem de *nomear* condomínios — uma extracção
      -- positiva do documento, não uma inferência — e a pessoa tem de ter pedido
      -- alertas de condomínio. O `desconhecido` não entra por nenhuma das duas.
      and (
        f.admite_particulares = 'sim'
        or (
          -- `= 'nao'` e não `<> 'sim'`. A porta exige uma determinação positiva de
          -- que as pessoas singulares estão excluídas, a par da nomeação positiva
          -- dos condomínios. Escrita da forma frouxa, deixava passar um aviso
          -- `desconhecido` sempre que este calhasse mencionar condomínios — falha
          -- aberta, no portão cuja única razão de existir é falhar fechado. Foi um
          -- teste já existente do `decidir()` que apanhou isso no TypeScript.
          f.admite_particulares = 'nao'
          and 'condominio' = any (f.beneficiarios)
          and 'condominio' = any (pr.tipos_beneficiario)
        )
      )
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
