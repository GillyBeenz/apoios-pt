-- Quantas visitas chegam por cada domínio.
--
-- O `apoios.guru` foi registado como defensivo — o nome da app é Appoios e vive em
-- `appoios.guru`. Ao fim de um ano há uma decisão a tomar: renovar o defensivo ou
-- deixá-lo cair. Essa decisão precisa de um número, e a alternativa era instalar
-- analítica de terceiros — que a política de privacidade diz, hoje, que não existe.
--
-- Isto conta o mínimo que responde à pergunta: um contador por dia e por domínio.
-- Sem IP, sem cookie, sem agente, sem caminho, sem nada que ligue uma contagem a uma
-- pessoa. Não é analítica de audiência e não serve para isso; serve para saber se um
-- domínio vale 4 € por ano.
create table dominio_acessos (
  dia       date not null,
  host      text not null,
  contagem  bigint not null default 0,
  primary key (dia, host)
);

alter table dominio_acessos enable row level security;

-- Sem políticas: negado a `anon` e a `authenticated`, como as outras tabelas
-- operacionais. Escreve-se só pela função abaixo, que é SECURITY DEFINER.
--
-- O `host` é normalizado e confrontado com uma lista fechada. Sem isso, qualquer
-- pessoa com a chave anónima — que vai no browser por desenho — podia encher a
-- tabela de linhas inventadas e estragar exactamente o número que ela existe para
-- produzir.
create or replace function registar_acesso_dominio(p_host text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  h text := lower(regexp_replace(coalesce(p_host, ''), ':\d+$', ''));
begin
  if h not in ('appoios.guru', 'www.appoios.guru', 'apoios.guru', 'www.apoios.guru') then
    return;
  end if;

  insert into dominio_acessos (dia, host, contagem)
  values (current_date, h, 1)
  on conflict (dia, host) do update set contagem = dominio_acessos.contagem + 1;
end;
$$;

revoke all on function registar_acesso_dominio(text) from public;
grant execute on function registar_acesso_dominio(text) to anon, authenticated;

comment on table dominio_acessos is
  'Contagem diária de visitas por domínio, sem qualquer dado pessoal. Existe para decidir se o domínio defensivo apoios.guru se renova.';
