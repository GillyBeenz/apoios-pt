# Fixtures permanentes

Capturas guardadas à mão, que o `capturar-fixtures.yml` **não** apaga.

O script de captura faz `rm -rf` ao directório `fixtures/` de cada fonte antes de
escrever, para que uma fixture obsoleta nunca fique a fingir que é actual. O efeito
secundário é que uma captura só consegue guardar aquilo que o sítio serve **hoje**.

`erro-aspx-200.html` é o caso que isso destrói. É a página de erro real do
fundoambiental.pt — servida com **HTTP 200**, 433 bytes, hash perfeitamente estável.
Foi capturada quando um URL de entrada estava errado; assim que o URL foi corrigido,
o sítio deixou de a servir e a captura seguinte apagou-a.

Mas é exactamente ela que prova que o `ehPaginaDeErro` funciona — e sem esse detector
uma fonte morta parece saudável para sempre, porque nem o código de estado nem o hash
mudam. Perder a fixture seria perder a única prova do salvaguarda mais valioso do
pipeline, precisamente por o bug que o motivou ter sido corrigido.

`prr-pagina-20182-vazia.json` é a resposta REST do WordPress para a página de
candidaturas do PRR. Guardada porque prova uma ausência: `content.rendered` tem
zero bytes e `acf` é uma lista vazia. A página não tem conteúdo nenhum no CMS — a
listagem inteira é montada no browser.

Sem isto, a tentação de voltar a tentar o endpoint volta de cada vez que alguém
olha para a fonte e vê que ela não produz nada.

## Os dois ficheiros `-pedidos-de-dados.json`

Provam outra ausência, e uma presença.

Quando uma página é montada no browser, a pergunta seguinte é sempre a mesma: *de
onde é que ela vai buscar os dados?* A captura de 14/09/2026 correu as duas páginas
num Chromium e registou todos os pedidos `xhr` e `fetch` que elas fizeram. O que
sobra depois de tirar a analítica está aqui.

`prr-candidaturas-pedidos-de-dados.json` tem **um** pedido, e é telemetria. A página
do PRR não vai buscar avisos a lado nenhum — com browser trouxe 1568 caracteres
visíveis contra 1514 sem ele, e a diferença é o aviso de cookies. Não há rota
escondida para encontrar. É isso que este ficheiro fecha.

`pt2030-avisos-pedidos-de-dados.json` tem o contrário: `POST
https://portugal2030.pt/wp-json/avisos/query` devolve os avisos em JSON. A página
renderizada também os mostra, mas custa 3 MB numa linha só para 4417 caracteres
úteis. O endpoint é a rota certa, e este ficheiro é onde ela ficou registada antes
de alguém a implementar.

## `pt2030-avisos-query-contrato.json` e `...-resposta.json`

O passo seguinte àquele ficheiro de pedidos: não só *que* endpoint a página chama,
mas **o que lhe manda e o que recebe de volta**.

Saber que existe um `POST /wp-json/avisos/query` não chega para lá bater. Falta o
corpo — que é `application/x-www-form-urlencoded` com `estadoAvisoId`, vinte e três
`programaId[]` e dois campos de ordenação — e falta a forma da resposta. Nenhuma das
duas coisas se adivinha de fora, e tentar adivinhar custa uma ronda de tentativa e
erro contra um servidor que não é nosso.

O `-contrato.json` tem o pedido tal como a página o enviou, em bruto e descodificado,
com as três coisas que ainda não se sabem escritas como notas: o que valem os outros
`estadoAvisoId`, e se há paginação (esta resposta trouxe cinco avisos e nenhum
parâmetro de página foi observado).

O `-resposta.json` é a resposta inteira, real, de 14/09/2026. Serve de fixture ao
extractor: é contra ela que ele é escrito e testado, sem rede.

## `pt2030-avisos-query-paginacao.json`

A nota do contrato dizia que não se tinha observado paginação nenhuma. A 15/09/2026
isso deixou de ser uma curiosidade e passou a ser uma perda: os dois avisos mais
antigos por data de publicação saíram da resposta no dia em que dois novos entraram,
e um deles — o `NORTE2030-2026-22` — tem prazo até 31/12/2026, por isso não pode ter
saído por ter encerrado.

Este ficheiro é o que o servidor respondeu quando lhe perguntámos. `sondar-paginacao.yml`
corre `scripts/sondar-paginacao-pt2030.mjs`, que manda o corpo real da fonte com um
parâmetro acrescentado de cada vez — `page`, `limit`, `offset` e mais uns quantos
nomes de três convenções diferentes — e regista o que voltou.

**Só aparece depois de o workflow correr**, e é `workflow_dispatch`: isto é uma
investigação com um fim, não uma tarefa semanal contra um servidor que não é nosso.

Duas coisas a ler antes do resto:

- **`base.estavel`.** A base é pedida no princípio e no fim. Se o PT2030 publicar um
  aviso a meio da sonda, todas as variantes seguintes parecem reconhecidas — uma
  pista falsa que custaria a sessão seguinte inteira.
- **`controlo_positivo.passou`.** Inverter `order_by_direction` tem de mudar a
  resposta, porque é o único parâmetro que se sabe que o endpoint lê. Se não mudar,
  a sonda não consegue detectar um parâmetro que funcione — e aí um resultado todo
  `ignorado` não prova ausência de paginação nenhuma, prova só que a sonda está
  partida. Sem este controlo, a conclusão errada mais cara desta investigação era
  indistinguível da certa.

Um nome que não foi experimentado continua por experimentar. O ficheiro leva a lista
completa dos que foram, precisamente para que a próxima pessoa não repita os mesmos.
