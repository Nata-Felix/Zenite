# Experimento: elementos redondos

Branch: `codex/elementos-redondos`.

Na visão resumida (`Alt+S`), cada elemento aparece como um ícone circular com o nome abaixo.
As conexões chegam à borda voltada para o outro elemento e se ajustam quando ele é movido.
O Sol mantém seus raios. Os cartões de conteúdo continuam disponíveis ao clicar no centro.

- Arraste o centro para mover o elemento.
- Arraste qualquer trecho da borda para ligar a outro elemento, sem procurar uma porta.
- Clique no centro para abrir o conteúdo; use o botão de voltar para retornar ao resumo.
- Astros com várias saídas continuam perguntando qual rota usar. A direção lógica e os dados das rotas são preservados.

Execute `npm run test:round-elements` para abrir a demonstração e validar as interações.
Para manter a janela aberta depois dos testes: `npx electron tests/e2e/round-elements.check.cjs --real-app --keep-open` (após compilar).
O teste abre o Zênite completo, com seus serviços reais, em um perfil descartável com dados de exemplo.

Validações: criação de conexão pelas bordas superiores, arraste pelo centro, abertura e retorno do conteúdo,
persistência da nova conexão, preservação de rotas e extremos sobre as circunferências nos quatro estilos de linha.

A regressão das linhas soltas é verificada começando pelos cartões expandidos e depois alternando para os círculos.
Cada elemento é movido com verificações durante o arraste, seguido de seleção de linha por clique, seleção por área
e movimentação em grupo. O teste também abre um astro com saídas nomeadas para conferir suas ligações.
Quando a linha de base está oculta, selecionar uma ligação mostra temporariamente o traço de destaque e realça o efeito.

Os 13 efeitos são vetoriais (SVG), com círculos, elipses e caminhos nítidos ao ampliar.
A escala padrão de velocidade acompanha a clássica: 2,4 s por percurso em repouso e 1,1 s durante um envio.
Os controles de velocidade continuam multiplicando esses valores. Brilho e opacidade foram reforçados.
As configurações podem ser arrastadas pelo cabeçalho, sem ultrapassar a área visível da janela.
