# Skills e serviços no canvas — 21/10/2026

Implementação disponível na main. A biblioteca global de skills continua separada dos
elementos de skill: adicionar uma pasta ao canvas não a instala nas contas.

## Validação executada

- Tipos e compilação de produção: passaram.
- Suíte automatizada completa após a integração com a segurança do Sol: 234 testes,
  233 aprovados, nenhuma falha e um ignorado por ser específico de Linux.
- `node --test tests/unit/integrations/canvas-integrations.test.mjs`: 8 testes passaram.
- Janela visível do Zênite real: criação pelo dock, configuração, arraste das ligações,
  leitura de SKILL.md e arquivo de apoio, API HTTP e MCP com tráfego real para servidores
  locais descartáveis. HTTP, argumentos da ferramenta, SSE, paginação e sessão MCP exercitados.
- Confirmação por operação (aprovar/cancelar), bloqueio do Sandbox e execução automática
  em controle total. A pasta do seletor e a decisão dos diálogos nativos são simuladas pelo
  teste; o restante usa os componentes, persistência, IPC e conector reais.
- Reabertura preserva configuração e ligações. Visão compacta e movimento mantêm as linhas
  presas aos círculos. Nenhum erro do renderer durante o cenário.
- Testes do servidor e CLI verificam autenticação, ligação direta mesmo para o Sol, revogação,
  travessia de pastas/junctions, limite de tamanho, destino HTTP restrito e redirecionamento.
- Credencial do .env não aparece na resposta entregue ao agente, mesmo com aspas e barras.
- Sessão de Satélite/Torre só autoriza listagem, skills e serviços e é revogada ao terminar.
  As permissões próprias do astro também restringem o serviço. O motor informa o id do astro.
- A ponte de skills e serviços exige a janela principal do Zênite. Outra janela não pode
  ler skills, chamar serviços ou abrir o seletor de pasta por essa ponte.
- Regressão visual concluída após a mudança da autoridade do Sol: painel, clipboard,
  desfazer, Sol, sites, terminais nos dois tamanhos, 13 efeitos, elementos redondos,
  segurança e integrações. Os três últimos cenários foram repetidos separadamente
  após corrigir a preparação do teste dos círculos; todos passaram.
- O teste dos círculos usa o centro medido dos ícones no zoom atual, promove o Sol
  na sessão e limpa a seleção antes de arrastar outro elemento, evitando a sobreposição
  do painel de constelação. Verifica deslocamento real e destaque das sete ligações.
- Exportação/importação conserva elementos e ligações; só a referência à pasta da skill e
  o nome da variável são exportados, sem o conteúdo da pasta ou do .env.

Capturas e resultado: `out/canvas-integrations-qa/` (perfil de teste separado dos dados reais).

## Executar novamente

`npm run test:integrations` compila e abre o cenário completo dentro do Zênite.
Para manter a janela de demonstração aberta após o teste:
`npx electron tests/e2e/canvas-integrations.check.cjs --keep-open` (após compilar).

## Alcance desta versão

API HTTP/webhook com JSON e autenticação Bearer por variável do .env ou ambiente; MCP
Streamable HTTP nas revisões 2025-03-26, 2025-06-18 e 2025-11-25. Serviços remotos exigem
HTTPS; localhost pode usar HTTP. Não inclui MCP stdio, OAuth ou adaptadores nativos de
Postgres/Docker/SSH. Esses serviços podem ser expostos por um servidor MCP HTTP configurado.
Nenhuma conta externa ou agente de IA pago foi usado nos testes.
