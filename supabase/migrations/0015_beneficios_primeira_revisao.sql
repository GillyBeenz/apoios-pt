-- 0015 — Primeira revisão dos benefícios permanentes
--
-- A 0011 construiu a tabela e deixou-a vazia de propósito. Isto é a primeira
-- passagem de conteúdo, e é uma revisão por modelo, não por pessoa:
-- `verificado_por = 'IA - Modelo LLM claude-opus-5'`. Tudo entra com
-- `publicado = false`, que é a regra da 0011 e continua de pé — quem publica
-- matéria fiscal responde por ela, e um modelo não responde por nada.
--
-- ## O que esta revisão descobriu, e que muda o enunciado
--
-- O comentário da 0011 abre com «IVA reduzido em equipamento solar» como exemplo
-- principal. **Já não é verdade.** A taxa de 6% veio da Lei 12/2022 (OE2022), com
-- efeitos a 1 de julho de 2022 e validade até 30 de junho de 2025, e não foi
-- reposta no Orçamento do Estado para 2026. Desde 1 de julho de 2025 o
-- equipamento solar, as bombas de calor e o ar condicionado voltaram aos 23%.
--
-- Semear essa linha teria publicado, com ar de certeza, uma coisa falsa sobre os
-- impostos de quem nos lê — exactamente o dano que a 0011 diz querer evitar. Fica
-- por semear, e fica aqui escrito porque um leitor futuro que só veja o
-- comentário da 0011 vai supor que existe.
--
-- Pela mesma razão não há linha de dedução de IRS por obras de eficiência: em
-- 2026 não existe dedução à colecta para esse fim.
--
-- ## O que limita esta revisão
--
-- Nenhuma fonte primária foi aberta. O `diariodarepublica.pt`, o
-- `info.portaldasfinancas.gov.pt` e o `sce.pt` estão todos bloqueados pelo proxy
-- de saída deste ambiente. O que aqui está foi corroborado entre resumos de
-- várias fontes independentes, e os `url_oficial` apontam para as páginas certas
-- da AT e do DR — que eu não consegui ler. Quem assinar a verificação humana tem
-- de as abrir.

insert into beneficios (
  slug, titulo, resumo, tipo, entidade_gestora, referencia_legal,
  valor_descricao, como_usar, medidas, beneficiarios, admite_particulares,
  restricoes_beneficiario, ambito, url_oficial,
  verificado_em, verificado_por, publicado
) values

-- 1 ------------------------------------------------------------------------
(
  'imi-predios-com-eficiencia-energetica',
  'Redução de IMI até 25% para prédios com eficiência energética',
  'Os municípios podem, por deliberação da assembleia municipal, reduzir a taxa '
  || 'de IMI dos prédios urbanos com eficiência energética. Não é automático: '
  || 'depende de o seu município ter deliberado nesse sentido.',
  'imi',
  'Município (deliberação da assembleia municipal)',
  'Artigo 44.º-B do Estatuto dos Benefícios Fiscais',
  'Redução até 25% da taxa de IMI, durante 5 anos. A percentagem concreta é '
  || 'fixada por cada município e pode ser menor, ou não existir de todo.',
  'Conta como eficiência energética: classe energética igual ou superior a A; '
  || 'ou, após obras, uma classe pelo menos dois níveis acima da anteriormente '
  || 'certificada. O artigo abrange também prédios que usem águas residuais '
  || 'tratadas ou águas pluviais. Confirme na sua câmara municipal se a '
  || 'deliberação existe e qual a percentagem em vigor no ano em causa.',
  array['certificado_energetico', 'reabilitacao_integral', 'isolamento_cobertura',
        'isolamento_paredes', 'janelas', 'reaproveitamento_aguas_pluviais',
        'reutilizacao_aguas_cinzentas'],
  array['particular', 'condominio']::tipo_beneficiario[],
  'sim',
  'Depende de deliberação da assembleia municipal do município onde o prédio se '
  || 'situa. Sem essa deliberação, não há redução.',
  'municipio',
  'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/bf_rep/Pages/ebf-artigo-44-o-b.aspx',
  date '2026-09-14',
  'IA - Modelo LLM claude-opus-5',
  false
),

-- 2 ------------------------------------------------------------------------
(
  'imi-reabilitacao-urbana',
  'Isenção de IMI para prédios reabilitados',
  'Isenção de IMI para prédios urbanos concluídos há mais de 30 anos ou '
  || 'situados em área de reabilitação urbana, quando objecto de obras de '
  || 'reabilitação que cumpram as condições do artigo.',
  'imi',
  'Município / Autoridade Tributária',
  'Artigo 45.º do Estatuto dos Benefícios Fiscais',
  'Isenção de IMI. A duração e as condições exactas constam do artigo e não '
  || 'foram confirmadas contra o texto legal nesta revisão.',
  'As condições são cumulativas: intervenção de reabilitação nos termos do '
  || 'Regime Jurídico da Reabilitação Urbana; estado de conservação dois níveis '
  || 'acima do anterior e, no mínimo, bom; e cumprimento dos requisitos de '
  || 'eficiência energética e qualidade térmica. Confirme o texto do artigo e o '
  || 'procedimento junto da câmara municipal antes de contar com a isenção.',
  array['reabilitacao_integral', 'certificado_energetico', 'isolamento_cobertura',
        'isolamento_paredes', 'janelas'],
  array['particular', 'condominio']::tipo_beneficiario[],
  'sim',
  'Prédio concluído há mais de 30 anos ou situado em área de reabilitação '
  || 'urbana. Exige reconhecimento pela câmara municipal.',
  'nacional',
  'https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1989-34554075',
  date '2026-09-14',
  'IA - Modelo LLM claude-opus-5',
  false
),

-- 3 ------------------------------------------------------------------------
(
  'mais-valias-encargos-com-valorizacao',
  'Obras de valorização reduzem a mais-valia tributada na venda da casa',
  'Não é um apoio à obra: é uma redução do imposto no dia em que vender. Os '
  || 'encargos com a valorização do imóvel somam-se ao valor de aquisição, e a '
  || 'mais-valia sujeita a IRS fica menor.',
  'irs',
  'Autoridade Tributária e Aduaneira',
  'Artigo 51.º do Código do IRS',
  'Os encargos com a valorização do imóvel, comprovadamente realizados nos 12 '
  || 'anos anteriores à alienação, acrescem ao valor de aquisição no cálculo da '
  || 'mais-valia.',
  'Guarde as facturas com o seu NIF. Sem documento em nome do contribuinte o '
  || 'encargo não é aceite, e é aqui que a maior parte se perde — a obra foi '
  || 'feita, a factura não existe ou está em nome de outra pessoa.',
  array['isolamento_cobertura', 'isolamento_paredes', 'isolamento_pavimento',
        'janelas', 'bomba_calor', 'solar_fotovoltaico', 'solar_termico',
        'reabilitacao_integral'],
  array['particular']::tipo_beneficiario[],
  'sim',
  'Aplica-se na alienação do imóvel, não no momento da obra.',
  'nacional',
  'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs51.aspx',
  date '2026-09-14',
  'IA - Modelo LLM claude-opus-5',
  false
);

-- ---------------------------------------------------------------------------
-- O comentário da 0011 dizia que `verificado_em` é «quando uma pessoa confirmou».
-- Agora há linhas confirmadas por um modelo, e deixar o comentário como estava
-- fazia a coluna mentir sobre quem assinou. As duas coisas passam a estar
-- separadas: a data diz quando, o `verificado_por` diz quem, e `publicado`
-- continua a ser o sítio onde só uma pessoa pode mexer.
-- ---------------------------------------------------------------------------

comment on column beneficios.verificado_em is
  'Quando alguém confirmou que isto continua verdade. Nulo = nunca confirmado. '
  'Ver `verificado_por` para saber quem confirmou.';

comment on column beneficios.verificado_por is
  'Quem confirmou: o nome de uma pessoa, ou «IA - Modelo LLM <modelo>» numa '
  'primeira passagem automática. Uma revisão por modelo nunca basta para '
  '`publicado`: matéria fiscal publicada tem de ser assinada por alguém que '
  'responda por ela.';
