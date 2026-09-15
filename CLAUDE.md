# Apoios — notas para quem trabalha neste repositório

## Começa por aqui

`docs/como-funciona.html` é a página de orientação: como os dados entram, por que
três caminhos, quem decide o que aparece no catálogo e o que pode gerar email.
Abre-a antes de mexer no pipeline. É um ficheiro único, sem dependências — abre
num browser directamente do disco.

`docs/estado-actual.md` é a outra metade: os fios por atar, datados. Apodrece de
propósito — cada ponto lá dentro é para ser **apagado** quando for resolvido, não
actualizado. Se um item ainda lá estiver dali a um mês, é isso mesmo que ele está
a dizer.

## Mantém essa página verdadeira

Documentação apodrece em silêncio, e este repositório já tem a prova de como isso
corre mal: durante meses o pipeline descartou o plano anual do PT2030 com um
comentário a dizer que as folhas «tinham o seu próprio leitor determinista». O
comentário estava certo sobre o leitor e errado sobre o mundo, e ninguém reparou
porque nada o obrigava a reparar. São 388 apoios que estiveram a um `continue` de
nunca existirem.

Parte disto está automatizada. `documentacao.test.ts` faz a página falhar a build
quando o registo de fontes e a tabela da página divergem — uma fonte nova sem
documentação, ou uma fonte promovida a `activa` com a página ainda a dizer
`em-captura`. Não precisas de te lembrar desses dois casos.

**O resto é contigo, e é o que o teste não consegue ver.** Actualiza a página
quando mudares:

- **um caminho de ingestão** — as três vias (modelo, folha, API) estão desenhadas
  na segunda figura; uma via nova é uma faixa nova;
- **um portão de decisão** — o que decide `publicado` e o que decide `alertavel`
  estão na terceira figura, e a distinção entre os dois é a coisa mais importante
  que a página explica;
- **as fases da corrida diária** — a lista numerada é uma sequência real, e a
  ordem é informação: os passos caros estão no fim de propósito;
- **as tarefas `pg_cron`** — a tabela diz o que corre sozinho e porquê;
- **o instantâneo do catálogo** — a secção datada no fim. É o único sítio da
  página com números do catálogo, e é assim de propósito: um número gravado a
  meio de um parágrafo, ou dentro de um desenho, envelhece sem ninguém dar por
  isso. Ali envelhece à vista.

Se uma mudança tornar a página errada e não a puderes corrigir na altura, é
melhor apagares a afirmação errada do que deixá-la lá. Uma página com uma lacuna
é honesta; uma página com uma mentira gasta a confiança de quem a lê a seguir.

## Convenções que o resto do repositório já segue

- **Os extractores são puros e correm sem rede.** O proxy deste ambiente bloqueia
  todos os domínios do Estado português, por isso quem vai à rede é o GitHub
  Actions e o que ele traz fica commitado em `fixtures/`. Um extractor que faça um
  pedido não é testável aqui.
- **Em dúvida, não passa.** Todas as condições do portão falham fechadas. Um
  alerta que falta é uma oportunidade perdida; um alerta errado manda alguém
  gastar dez mil euros num apoio a que nunca teve direito.
- **Nunca inventar um campo que o documento não diz.** `desconhecido` é uma
  resposta válida e honesta. Uma inferência plausível não é.
- **Comentários dizem porquê, não o quê.** Quando uma decisão é surpreendente, a
  razão fica escrita ao lado dela — senão volta a ser desfeita por alguém que não
  sabia porque estava assim.
