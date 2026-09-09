-- Um snapshot deixa de significar "já tratámos isto" só por existir.
--
-- O portão de mudança compara o hash da página com o do último snapshot guardado,
-- e o snapshot é escrito **antes** da chamada ao modelo. Enquanto o portão nunca
-- disparava (um id de sessão por pedido fazia a página hashar diferente em todas as
-- execuções — ver 0004 e a #32) isto não se notava: tudo era re-extraído por
-- acidente. Corrigido o portão, o defeito ficou à vista.
--
-- A execução #24 guardou 39 snapshots e produziu 13 extracções. As outras 26
-- chamadas falharam — quase todas por uma string comprida de mais, que a #33 passou
-- a aparar — mas os 26 snapshots ficaram lá, com o hash actual. Na execução
-- seguinte o portão via o hash igual e saltava-os. **Uma extracção falhada ficava
-- registada como sucesso**, e o documento deixava de ser tentado até a página
-- mudar por si.
--
-- A alternativa era guardar o snapshot só quando a extracção corre bem. Rejeitada:
-- o corpo guardado é o que permite perceber o que correu mal, e foram precisamente
-- os snapshots guardados que permitiram diagnosticar os dois defeitos deste dia.
-- Deitar fora o arquivo dos documentos que falharam é deitar fora as provas do
-- próximo diagnóstico.
--
-- Fica o arquivo, e fica um sinal separado a dizer o que já foi tratado:
--   - listagem: verdadeiro assim que é guardada (a análise é local e corre sempre);
--   - página de detalhe: verdadeiro só depois de uma extracção utilizável.
--
-- Sem backfill, de propósito. Marcar linhas antigas como tratadas exigiria adivinhar
-- quais correram bem, e um palpite errado esconde um documento para sempre — que é
-- exactamente o defeito que isto corrige. As linhas existentes ficam por tratar e a
-- próxima execução re-extrai tudo uma vez, recuperando de caminho os 26 perdidos.
alter table snapshots
  add column processado boolean not null default false;

-- O portão pergunta sempre "qual foi o último snapshot tratado desta URL?", e é essa
-- a consulta que este índice serve.
create index snapshots_url_processado
  on snapshots (url, capturado_em desc)
  where processado;

comment on column snapshots.processado is
  'O que este conteúdo exigia já foi feito: listagem analisada, ou extracção do detalhe bem sucedida. O portão de mudança compara-se apenas contra snapshots tratados, para que uma extracção falhada seja tentada outra vez em vez de saltada.';
