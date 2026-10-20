-- ---------------------------------------------------------------------------
-- Concessões explícitas para a Data API
--
-- A partir de 30 de outubro de 2026 a Supabase deixa de conceder automaticamente
-- acesso à Data API (PostgREST, supabase-js) às tabelas novas do esquema
-- `public`. As tabelas que já existem mantêm o que têm, por isso nada muda em
-- produção hoje. O risco é a reconstrução: um projeto novo, uma restauração ou
-- um `supabase db reset` volta a criar todas as tabelas a partir destas
-- migrações, e nenhuma delas concedia acesso de forma explícita. O site
-- respondia "permission denied" em todas as páginas.
--
-- Concede-se só o que o site usa, nada mais:
--   funds          leitura por anon e authenticated (catálogo público; a política
--                  `apoios_publicados` continua a esconder o que não está publicado)
--   profiles       leitura e upsert pelo próprio utilizador (`perfil_proprio`)
--   subscriptions  leitura, upsert e desactivação pelo próprio (`subscricoes_proprias`)
-- Sem delete: o site desactiva subscrições (`activa = false`), nunca as apaga.
-- As funções chamadas pela API já têm `grant execute` explícito nas suas migrações.
-- O papel `apoios_ingest` liga-se directamente e tem as suas concessões na 0001.
--
-- Regra daqui em diante: toda a migração que cria uma tabela lida pelo site traz
-- as suas concessões. Ver CLAUDE.md.
-- ---------------------------------------------------------------------------

grant select on public.funds to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;

grant select, insert, update on public.subscriptions to authenticated;
