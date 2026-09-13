-- A coluna `custo_usd` existe desde a 0001 e nunca ninguém lá escreveu.
--
-- Não faltava a coluna: faltava a tabela de preços e faltava um dos quatro
-- contadores de tokens. A escrita de cache (`cache_creation_input_tokens`) nunca
-- foi capturada, e é ela que paga a primeira chamada de cada execução — a mais
-- cara de todas, porque é a que constrói o prefixo em cache.
--
-- É o mesmo padrão do `tentativas` e do `candidatos_ignorados`: meia máquina.
-- Desta vez a metade que faltava era a que dizia quanto custa aquilo que fazemos
-- todas as noites.

alter table fund_extractions
  add column if not exists tokens_cache_escritos int not null default 0;

comment on column fund_extractions.tokens_cache_escritos is
  'Tokens escritos em cache, faturados a 1,25x a entrada não-cacheada.';

comment on column fund_extractions.custo_usd is
  'Custo da chamada em dólares. Null quando o modelo não tem preço fixado em PRECOS.';
