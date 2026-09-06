-- Somewhere to keep the fetched body.
--
-- `conteudoSnapshot()` is load-bearing, not a convenience: an unchanged listing
-- must still yield its candidates, because a notice can have its deadline
-- extended on the detail page or inside a PDF without the listing changing at
-- all. Without the stored body the pipeline would skip the whole source on an
-- unchanged listing and miss exactly that.
--
-- A column rather than Supabase Storage. Storage has its own policies on
-- `storage.objects`, so using it would mean widening the ingestion role beyond
-- the nine tables it can currently touch — for a body that dedup already keeps
-- small. `snapshots_dedup` is unique on (url_canonica, hash_conteudo), so an
-- unchanged page never writes a second row: growth tracks how often the sources
-- actually change, not how often they are polled.
alter table snapshots add column if not exists conteudo bytea;

comment on column snapshots.conteudo is
  'Corpo normalizado da resposta. Nulo para capturas antigas e para binários que '
  'não sejam reprocessados.';
