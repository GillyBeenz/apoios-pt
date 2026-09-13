-- 0013 — Guardar os candidatos que o limite recusou
--
-- O 0046 (PR #46) acrescentou `candidatosIgnorados` às métricas em memória e ao
-- aviso no log, e não acrescentou a coluna nem o INSERT. O número era calculado e
-- deitado fora — exactamente o padrão do `tentativas`, que existia desde o 0008
-- sem ninguém o ler, e que eu tinha acabado de criticar.
--
-- Importa porque é a métrica que torna a truncatura visível depois do facto. Sem
-- coluna, a única prova de que uma execução deixou documentos por olhar é uma
-- linha de log do Actions, que expira.
alter table source_health
  add column candidatos_ignorados int not null default 0;

comment on column source_health.candidatos_ignorados is
  'Candidatos que o limite por execução recusou olhar. Zero numa execução sã.';
