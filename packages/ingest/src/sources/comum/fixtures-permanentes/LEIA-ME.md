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
