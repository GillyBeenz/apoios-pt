-- ---------------------------------------------------------------------------
-- Uma extracção passa a poder nomear o documento de onde saiu
--
-- `fund_extractions.snapshot_id` existe desde a primeira migração e nunca foi
-- escrito: nulo nas 407 linhas. Enquanto a verificação das provas só fosse feita
-- uma vez, no momento da extracção, isso não custava nada — a coluna era um
-- enfeite.
--
-- Custou quando o leitor de PDF foi corrigido. O leitor metia um espaço por cada
-- operador de posicionamento, e isso partia os códigos e as datas
-- (`LISBOA2030-2023-12` saía `LISBOA2030 - 2023 - 1 2`), por isso as 123
-- extracções do primeiro lote ficaram todas com citações «inexistentes» e o
-- portão fechou sobre elas. As extracções estavam boas; o texto contra o qual
-- foram conferidas é que estava estragado.
--
-- Re-verificar não precisa do modelo — precisa do documento. E sem esta coluna
-- não havia como ir da extracção ao documento, o que deixava só a alternativa
-- caríssima: pagar o lote outra vez. É esse o preço de uma coluna nunca ligada.
--
-- O `armazem-postgres.ts` passou a escrevê-la. Isto preenche o passado.
--
-- Casa por `url_canonica`, que é a identidade estável do documento, e **só onde
-- não há dúvida**: um apoio cujo URL tenha mais do que um snapshot fica de fora
-- em vez de ser ligado ao palpite mais recente. Medido antes de escrever: os 116
-- apoios com extracções do lote casam todos, nenhum é ambíguo.
-- ---------------------------------------------------------------------------

update fund_extractions e
   set snapshot_id = s.id
  from funds f, snapshots s
 where e.snapshot_id is null
   and f.id = e.fund_id
   and s.url_canonica = f.url_oficial
   -- Em dúvida, não passa: só quando aquele URL tem exactamente um snapshot.
   and (select count(*) from snapshots s2 where s2.url_canonica = f.url_oficial) = 1;

-- A coluna fica indexada porque a re-decisão vai juntar por ela em cada corrida.
create index if not exists fund_extractions_snapshot_id_idx
    on fund_extractions (snapshot_id)
 where snapshot_id is not null;
