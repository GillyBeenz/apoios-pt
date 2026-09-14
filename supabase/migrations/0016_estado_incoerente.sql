-- 0016 — Um encerrado com prazo por vencer é uma contradição, e custa dinheiro
--
-- Encontrado em produção a 14 de setembro de 2026: uma linha com
-- `estado = 'encerrado'` e `fecha_em = 2026-09-23`. Faltavam nove dias para o
-- prazo. Um apoio dado por fechado sai do catálogo, por isso ali havia uma
-- candidatura por fazer que ninguém veria — e nada estava a olhar.
--
-- Assinala, nunca corrige. Um aviso pode mesmo fechar antes do prazo quando a
-- dotação se esgota, e por isso a data não é automaticamente a melhor
-- testemunha; trocar o estado com base no relógio seria substituir um erro
-- possível por outro, sem ninguém dar por nenhum dos dois. O `portao.ts` faz a
-- mesma verificação no momento da extracção; esta apanha o que já está guardado,
-- que de outra forma só seria reexaminado quando o documento mudasse.
--
-- Função à parte em vez de acrescentar ao `sweep_eventos_temporais`: copiar as
-- oitenta linhas daquele corpo para lhe juntar um bloco é um erro de
-- transcrição à espera de acontecer, e as duas coisas não têm de viver juntas.

create or replace function assinalar_estados_incoerentes()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_n int;
begin
  update funds f
     set needs_review = true,
         motivo_revisao = (
           select array_agg(distinct m)
           from unnest(
             f.motivo_revisao
             || array['estado_incoerente:encerrado_com_prazo_futuro']
           ) as m
         ),
         actualizado_em = now()
   where f.estado = 'encerrado'
     and f.fecha_em is not null
     and f.fecha_em > now()
     -- Um prazo só ao mês não sustenta esta acusação: «setembro de 2026» tanto
     -- pode já ter passado como não.
     and f.fecha_em_precisao in ('minuto', 'dia')
     -- Idempotente. Sem isto, cada passagem reescrevia a linha e mexia no
     -- `actualizado_em` sem nada ter mudado.
     and not ('estado_incoerente:encerrado_com_prazo_futuro' = any(f.motivo_revisao));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Interna, como as outras. O `anon` não tem nada que a chamar.
revoke all on function assinalar_estados_incoerentes() from public;
revoke all on function assinalar_estados_incoerentes() from anon, authenticated;

-- Logo a seguir ao varrimento das 06:00, que é quem fecha os que passaram do
-- prazo. Correr antes dele acusaria linhas que ele estava prestes a arrumar.
select cron.schedule(
  'assinalar-estados-incoerentes',
  '30 6 * * *',
  $cron$select assinalar_estados_incoerentes()$cron$
);

comment on function assinalar_estados_incoerentes() is
  'Marca para revisão os apoios dados por encerrados cujo prazo ainda não chegou. Assinala, não corrige.';
