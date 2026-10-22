# Desenvolvimento do Zênite

Referência para continuar o projeto público. Consulte o [README](../../README.md), as
[pendências](pending.md) e o [catálogo de testes](../../tests/README.md). Use `git log`
para recuperar decisões e versões anteriores; `package.json` é a referência de versão atual.

## Arquitetura

- `src/main/`: processo principal do Electron. `index.ts` conecta janela, IPC, serviços, terminais e confirmações.
- `ptyManager.ts`, `shell.ts`, `processes.ts`: sessões reais, escolha de shell e processos.
- `controlServer.ts`, `canvasGraph.ts`, `src/cli/`: API local, conexões e comando `zn` dos agentes.
- `accounts.ts`, `secrets.ts`, `canvasAccess.ts`, `sunAuthority.ts`: perfis, cofre e autoridade/permissões.
- `isolatedRuntime.ts`, `isolatedFiles.ts`: contêineres e transferência de arquivos autorizada pelo canvas.
- `universes.ts`, `gitMemory.ts`, `gitSetup.ts`: worktrees, histórico e integração Git.
- `updater.ts`, `appUpdate.ts`: atualização completa e troca dos arquivos do aplicativo.
- `backup.ts`, `workspaceStore.ts`, `elements.ts`, `galaxyArchive.ts`: persistência, elementos e arquivos exportados.
- `src/preload/`: ponte `window.o`; os contratos estão em `src/shared/types.ts`.
- `src/renderer/`: interface React. `Canvas.tsx` coordena o canvas; componentes em `components/`, desenho em `draw/`.
- `src/shared/`: tipos e regras compartilhadas de fluxos, conexões e operações do canvas.

## Ambiente de desenvolvimento

```sh
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Para testes manuais do app, defina `ZENITE_DATA_DIR` para uma pasta descartável dentro de
`out/` antes de abrir o Electron. Sem isso, o aplicativo usa os projetos e terminais reais
da pessoa. Os testes de interface do catálogo já criam perfis descartáveis próprios.

Os dados de instalações novas ficam em `%APPDATA%\Zenite`; instalações antigas podem
continuar usando `%APPDATA%\o`. Esses dados não pertencem ao repositório.

## Distribuição

As ferramentas de empacotamento estão em [`scripts/build/`](../../scripts/build/).
`npm run dist:win` gera os artefatos em `dist/`; o workflow
[release-win.yml](../../.github/workflows/release-win.yml) publica tags `v*`.
Consulte o [README](../../README.md#publicar-uma-versão) e confirme que os arquivos
referenciados pelo manifesto de atualização existem no release antes de publicá-lo.

## Convenções

- Commits pequenos, em português, explicando o motivo. Use e-mail noreply do GitHub para commits públicos.
- Nunca versione `.env`, credenciais, perfis de contas, logs ou capturas com dados reais.
- Fixtures usam dados fictícios. Casos de caminhos com espaços e acentos devem continuar cobertos.
- Textos do aplicativo em português, com botões descrevendo a ação.
- Antes de ler módulos inteiros, busque a decisão no histórico Git.

Relatos técnicos de isolamento foram preservados em [isolation-feedback.md](isolation-feedback.md),
sem inventário de arquivos ou caminhos de projetos pessoais.
