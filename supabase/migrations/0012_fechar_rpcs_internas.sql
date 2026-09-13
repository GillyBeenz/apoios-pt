-- 0012 — Fechar as funções internas ao anon
--
-- Cinco funções SECURITY DEFINER estavam executáveis pelo papel `anon`, ou seja
-- por qualquer pessoa com a chave que o browser publica por desenho, através de
-- `/rest/v1/rpc/<nome>`.
--
-- O `revoke all on function ... from public` que cada migração já fazia não chega:
-- o Supabase concede EXECUTE a `anon` e `authenticated` explicitamente nas funções
-- novas do esquema `public`, e um revoke ao PUBLIC não toca nessas concessões.
-- Verificado com `has_function_privilege('anon', oid, 'execute')`, que devolvia
-- `true` para as sete.
--
-- A cadeia que isto abria, do lado de fora, sem sessão nenhuma:
--
--   token_cancelamento(<qualquer user_id>, <medida>)  →  devolve um token válido
--   cancelar_subscricao(<esse token>)                 →  cancela a subscrição
--
-- Ou seja: cancelar os alertas de qualquer pessoa, em silêncio, sabendo apenas o
-- seu id. O `token_cancelamento` é SECURITY DEFINER e **insere** — não era uma
-- leitura indevida, era escrita.
--
-- E ainda:
--   corpo_alerta(<user_id>, <eventos>)  →  o corpo do email dessa pessoa
--   enviar_alertas() / emparelhar_alertas() / confirmar_envios()
--       →  disparar a fila à vontade, queimando a quota do plano gratuito do
--          Resend, que é o recurso mais escasso que este sistema tem.
--
-- Duas ficam abertas, de propósito, e as razões são diferentes:
--
--   cancelar_subscricao   a ligação «cancelar» dos emails tem de funcionar sem
--                         sessão — é esse o ponto. A protecção é o token ser
--                         impossível de adivinhar, e agora também o facto de já
--                         não haver forma de o mandar gerar.
--   registar_acesso_dominio  o middleware chama-a com a chave anon a cada visita,
--                         e a lista de hosts que aceita é fechada (migração 0006).
--
-- As execuções por cron não são afectadas: correm com o dono do job, não com anon.

-- O `corpo_alerta` precisa também do PUBLIC. As migrações anteriores revogaram o
-- PUBLIC no `enviar_alertas` e no `confirmar_envios` e saltaram esta, por isso a
-- sua ACL era `{=X/postgres,...}` — aquele `=X` à cabeça é o PUBLIC, e o `anon`
-- herda-o. Revogar só de `anon, authenticated` não lhe tocava: a primeira tentativa
-- desta migração não deu erro nenhum e deixou a função na mesma aberta. É preciso
-- ler a ACL para ver, porque `has_function_privilege` diz `true` sem dizer porquê.
revoke execute on function corpo_alerta(uuid, uuid[])     from public;

revoke execute on function token_cancelamento(uuid, text) from anon, authenticated;
revoke execute on function corpo_alerta(uuid, uuid[])     from anon, authenticated;
revoke execute on function enviar_alertas()               from anon, authenticated;
revoke execute on function emparelhar_alertas()           from anon, authenticated;
revoke execute on function confirmar_envios()             from anon, authenticated;
