# Buraco negro — implementação e validação

O Buraco negro agrupa elementos sem alterar suas identidades, conexões lógicas ou
permissões. Os membros recolhidos permanecem montados e as sessões de terminal continuam
ativas. Não permite grupos aninhados; um elemento pertence a um agrupador por vez.

## Testes executados

- Checagem de tipos e compilação de produção aprovadas. Suíte completa: 242 testes,
  241 aprovados, nenhum reprovado e um ignorado por ser específico de Linux.

- Oito testes de dados e CLI: associação de membros, referências inválidas, projeção de linhas
  internas/externas e entre grupos, preservação de rotas, cópia independente, exportação e
  importação com novos IDs, acesso dos agentes e comandos reais de criação/edição/remoção.
- Janela real do Zênite com perfil descartável: criação pelo menu Astros, escolha e transferência
  de membros, recolher/abrir, mover no modo normal e compacto, terminal ativo reutilizado,
  persistência após recarregar, desagrupar, desfazer, copiar/colar e agrupar pela seleção.
- Verificação de que as conexões salvas conservam seus extremos originais e a cópia inclui
  suas conexões internas. Arestas entre membros recolhidos somem apenas da apresentação.
- Linha externa presente após reabrir em modo compacto, com contato no horizonte visível
  do agrupador. A medida do agrupador agora é restaurada nesse modo.
- Cópias no modo compacto recebem deslocamento e conservam a disposição relativa dos membros.
- Desfazer agrupamento por seleção recupera os agrupadores e suas associações anteriores.
- Arrastar um elemento ou uma seleção por área (V) sobre a porta guarda os membros;
  destaque durante o gesto e desfazer da operação verificados na janela real. O gesto
  também funciona no modo compacto e com a pasta já aberta, acomodando o novo conteúdo.
- Clicar no ícone abre uma superfície de pasta no canvas e enquadra seu conteúdo com zoom;
  voltar restaura o enquadramento anterior. O seletor usa linhas horizontais com ícones e busca.
- Conexões externas passam pela porta mesmo com a pasta aberta. Trechos internos compartilham
  seleção e identidade lógica com a ligação externa, sem salvar arestas artificiais.
- Organizar duas vezes com a pasta aberta mantém todos os membros dentro da moldura, nas visões
  normal e compacta. Desfazer recupera as posições anteriores e as conexões salvas permanecem iguais.
- Regressão do clipboard no app: aprovada, com processo preservado e nenhum encerramento
  durante as transferências. Regressão dos círculos e das 13 animações: aprovada, incluindo
  seleção individual/por área, arraste em grupo, rotas nomeadas, zoom e abertura do conteúdo.

## Repetir

`npm run test:black-holes` compila e executa o cenário na janela do aplicativo.
`node --test tests/unit/canvas/black-holes.test.mjs` verifica os dados e os comandos do Sol.
Após compilar, `npx electron tests/e2e/black-holes.check.cjs --keep-open` mantém a demonstração aberta.

Capturas e `resultado.json` ficam em `out/black-hole-qa/`. Os testes não alteram os
canvases do usuário e não usam contas externas nem chamadas pagas de IA.
