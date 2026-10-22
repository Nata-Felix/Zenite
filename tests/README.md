# Catálogo de testes

Execute os comandos na raiz do repositório, com Node.js 22, Git e dependências instaladas por `npm ci`.

| Tipo | Pasta | Execução | Dependências e efeitos |
|---|---|---|---|
| Módulos e integrações locais | [unit/](unit/) | `npm test` | Compila módulos com esbuild; alguns casos abrem PTYs, executam Git e servidores HTTP locais. Não usa contas de provedores. |
| Interface Electron | [e2e/](e2e/) | `npm run test:e2e -- <cenário>` | Faz build e abre janelas reais com perfis descartáveis; execute no Windows com sessão gráfica. |
| Contêiner real | [docker/](docker/) | `npm run test:docker` | Docker em execução e imagem preparada; cria e remove um perfil de teste. |
| CLIs autenticados | [live/](live/) | `npm run test:live` | Codex instalado e autenticado; Antigravity opcional. Altera modelo/esforço e tenta restaurá-los. Não envia tarefas ao modelo. |
| Apoio | [fixtures/](fixtures/) | Importado pelos testes | Servidor HTTP/MCP local e cenário compartilhado de personalização; não são executáveis independentes. |

Os resultados, capturas, bundles e perfis temporários ficam em `out/`, ignorado pelo Git; logs locais ficam em `out/logs/`. Nunca publique perfis, capturas de contas reais, tokens ou arquivos de autenticação.

## Testes de módulos por área

`unit/` mantém o nome histórico da suíte. Ela inclui tanto testes de funções quanto integrações locais com disco, processos e HTTP.

```sh
npm test
npm run test:unit -- security
npm run test:unit -- canvas --test-name-pattern="layout"
node tests/run-unit.mjs --list
```

| Área | Arquivos `.test.mjs` | Cobertura |
|---|---|---|
| [agents](unit/agents/) | `accounts`, `agentControl`, `agentUsage`, `attention`, `usageRouting` | Perfis, menus dos CLIs, cotas, atenção e roteamento entre agentes. |
| [canvas](unit/canvas/) | `accent-color`, `attach`, `autoLayout`, `black-holes`, `canvas-background`, `canvasClipboard`, `canvasOps`, `connection-effects`, `connections`, `elements`, `layout`, `mediaResponse`, `recognize`, `round-connections`, `wrappedLinks` | Aparência, organização, conexões, elementos, desenho, mídia e área de transferência. |
| [flows](unit/flows/) | `chronos`, `codeRuntime`, `flow-actions`, `flowBus`, `flowRunner`, `flowWaits` | Agendamento, código, ações, eventos, execução e esperas. |
| [integrations](unit/integrations/) | `canvas-integrations`, `skills` | Skills e serviços HTTP/MCP com fixture local. |
| [isolation](unit/isolation/) | `isolated-files`, `isolatedBridge`, `isolatedRuntime` | Transferência binária, ponte e configuração do runtime; sem Docker real. |
| [persistence](unit/persistence/) | `appUpdate`, `backup`, `canvasArchive`, `galaxy-archive`, `git`, `releaseNotes`, `universes`, `workspaces` | Atualização, backups, arquivos exportados, Git, worktrees e dados persistidos. |
| [security](unit/security/) | `canvas-security`, `canvasAccess`, `env`, `fullAccess`, `public-files`, `secrets`, `solAccess` | Identidade, permissões, limites de acesso, proteção de variáveis/segredos e prevenção de publicação de dados locais. |
| [terminal](unit/terminal/) | `cli`, `freshPath`, `processes`, `pty`, `stdio`, `terminalCleanup`, `userAgent` | CLI, shells, PATH, processos, PTYs, saída e identificação do navegador. |

Casos dependentes da plataforma ou de Python podem ser ignorados pelo próprio teste. O CLI tem um caso ignorado no Windows; isso não significa que toda a suíte do CLI foi pulada.

## Cenários de interface

```sh
node tests/run-e2e.mjs --list
npm run test:e2e -- app-dialog
npm run test:e2e -- round-elements --real-app --keep-open
npm run test:ui
```

`test:ui` mantém a seleção de regressão já usada pelo projeto. Não executa todos os cenários abaixo, nem os testes Docker ou live. Cada cenário também pode ser chamado diretamente por `electron tests/e2e/<nome>.check.cjs` após `npm run build`.

| Área | Cenários | O que observar |
|---|---|---|
| Canvas | `summary-jump`, `summary-start`, `black-hole-organize`, `black-holes`, `canvas-clipboard`, `canvas-undo`, `node-options`, `round-elements` | Organização, agrupamento, copiar/colar, desfazer e opções dos elementos. `round-elements --real-app` inclui o cenário compartilhado de personalização. |
| Aparência e interação | `connection-effects`, `terminal-mouse` | Animações, arraste e interação do mouse; `terminal-mouse --screen=1080p` testa outra resolução. |
| Fluxos | `chronos`, `code-flow`, `flow-actions`, `flow-astros` | Agendamento, código, ações e astros. |
| Segurança e agentes | `app-dialog`, `away-summary`, `composer`, `composer-wait`, `composer-reply`, `terminal-role`, `canvas-security`, `canvas-sol`, `sol-canvas-welcome` | Diálogos, autoridade do Sol, bloqueios e instruções iniciais. `canvas-security` tenta iniciar terminais em Sandbox e depende da preparação/configuração do isolamento. |
| Integrações e dados | `canvas-integrations`, `galaxy-archive` | HTTP/MCP/skills e exportação/importação de galáxias. |
| Navegação | `web-devtools` | Inspeção de sites e ferramentas do navegador. |
| Isolamento | `docker-install`, `isolated-runtime` | `docker-install`: isolamento desligado por padrão e oferta de instalar o Docker ao ligar (docker e WinGet simulados). `isolated-runtime`: contêiner Docker real e permissões na interface; requer Docker e imagem preparada. |

Alguns cenários substituem respostas de diálogos, provedores ou instaladores por simulações. Consulte os arquivos e os [roteiros de validação](../docs/testing/) para distinguir essas verificações de execuções externas reais.

### Limite observado na validação de 22/10/2026

`test:ui` parou em `round-elements --real-app`: a asserção de movimento de `nebula`
não observou mudança nos 100 ms amostrados. Na repetição isolada, o cenário parou antes,
por timeout ao criar uma ligação entre bordas superiores. Portanto, a suíte visual
completa não foi aprovada nessa validação. Investigar sincronização da animação e
interações desse cenário; não tratar a ausência de erro de importação como sucesso funcional.

`canvas-security` também parou na inicialização dos terminais. A captura mostrou a recusa
do aplicativo: ambiente isolado não preparado. As asserções posteriores de autorização
não chegaram a executar. Preparar o isolamento e revisar a compatibilidade do probe
local com o contêiner antes de considerar esse cenário aprovado. Os testes de módulos
de segurança, o cenário `app-dialog` e o cenário `canvas-integrations` passaram.

## Docker e CLIs locais

```sh
npm run prepare:isolation
npm run test:docker
npm run test:isolation
npm run test:live
npm run test:live -- --agy-account <id-local>
```

`docker/isolated-headless.check.cjs` valida entrada, perfil persistente e ausência de disco do hospedeiro/socket Docker. `live/sol-agents.live.cjs` usa os CLIs locais de verdade; não faz parte de `npm test` ou da CI. Use contas próprias de teste e mantenha a saída em `out/`.

## Adicionar testes

- Funções e integrações locais: `unit/<área>/<recurso>.test.mjs`. O runner descobre os arquivos automaticamente; atualize este catálogo.
- Interface: `e2e/<recurso>.check.cjs`; use um perfil descartável em `out/` e inclua o cenário neste catálogo.
- Dependências reais: use `docker/` ou `live/` para que não entrem por acidente em `npm test`.
- Recursos compartilhados: `fixtures/`, somente dados fictícios e serviços locais.
- Roteiros e evidências textuais: `docs/testing/`. Capturas e logs gerados permanecem em `out/`.
