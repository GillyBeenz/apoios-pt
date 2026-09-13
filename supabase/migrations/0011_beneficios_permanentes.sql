-- 0011 — Benefícios permanentes
--
-- A maior parte do dinheiro ambiental que chega a uma família portuguesa não vem
-- de avisos. Vem de mecanismos que estão sempre lá: IVA reduzido em equipamento
-- solar, dedução em IRS de obras de eficiência, isenção de IMI para edifícios com
-- bom desempenho, e os apoios próprios de muitas câmaras.
--
-- Nada disto cabe em `funds`. Tudo em `funds` pressupõe uma janela que abre e
-- fecha: `estado`, `abre_em`, `fecha_em`, o varrimento temporal do 0002, o
-- `emparelhar_alertas`. Enfiar aqui um `permanente boolean` com datas nulas
-- obrigava cada uma dessas peças a crescer um caso que nunca foi desenhada para
-- ter — e é assim que nasce o tipo de defeito que o limite de 25 candidatos era.
--
-- Tabela separada, portanto, e com duas diferenças de fundo:
--
-- 1. **Nunca gera alertas.** Não há `alertavel`, não há eventos, não há entrada no
--    `emparelhar_alertas`. Um benefício permanente não "abre" — avisar sobre ele
--    seria ruído, e a ausência da coluna é o que torna isso estrutural em vez de
--    uma regra que alguém tem de lembrar-se de respeitar.
--
-- 2. **É curado, não recolhido.** Daí `verificado_em` e `verificado_por` em vez de
--    `visto_pela_ultima_vez`. Uma taxa de IVA que mudou e nós não demos por isso
--    não é uma falha de recolha: é o site a dizer a alguém, com ar de certeza,
--    uma coisa falsa sobre os seus impostos. A data de verificação fica visível
--    na página para que o leitor possa julgar por si.
--
-- Tudo entra com `publicado = false`. O conteúdo é matéria fiscal e quem o publica
-- responde por ele; a máquina fica pronta, a verificação é de quem a assina.

create type tipo_beneficio as enum
  ('iva', 'irs', 'imi', 'municipal', 'outro');

create table beneficios (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,

  titulo            text not null,
  resumo            text,
  tipo              tipo_beneficio not null,
  entidade_gestora  text,
  referencia_legal  text,

  -- O que a pessoa ganha, em texto. Deliberadamente não é um número: "IVA a 6%
  -- em vez de 23% no equipamento e na instalação" diz mais do que `0.06`, e não
  -- finge uma precisão que a lei fiscal raramente tem.
  valor_descricao   text not null,
  como_usar         text,

  medidas           text[] not null default '{}',
  beneficiarios     tipo_beneficiario[] not null default '{}',
  admite_particulares triestado not null default 'desconhecido',
  restricoes_beneficiario text,

  ambito            text not null default 'nacional',
  municipios        text[] not null default '{}',

  -- `not null` pela mesma razão que em `funds`: a ligação à fonte oficial é o que
  -- permite a quem lê verificar sem depender de nós, e não pode desaparecer em
  -- silêncio.
  url_oficial       text not null,

  -- Curadoria, não recolha. Nulo significa "ninguém confirmou isto ainda", que é
  -- diferente de "confirmado há muito tempo" — e as duas coisas merecem tratamento
  -- diferente na página.
  verificado_em     date,
  verificado_por    text,

  publicado         boolean not null default false,
  criado_em         timestamptz not null default now(),
  actualizado_em    timestamptz not null default now()
);

create index beneficios_tipo on beneficios (tipo) where publicado;
create index beneficios_medidas on beneficios using gin (medidas);

alter table beneficios enable row level security;

-- Mesma regra que `funds`: só o que passou pela verificação humana é público.
create policy beneficios_publicados on beneficios
  for select to anon, authenticated
  using (publicado = true);

comment on table beneficios is
  'Benefícios permanentes (IVA, IRS, IMI, municipais). Curados à mão, nunca alertáveis.';
comment on column beneficios.verificado_em is
  'Quando uma pessoa confirmou que isto continua verdade. Nulo = nunca confirmado.';
