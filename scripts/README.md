# Ferramentas do projeto

| Pasta | Ferramentas | Uso |
|---|---|---|
| `build/` | `prepare-win.mjs`, `pack-app-update.mjs`, `build-installer-ui.mjs` | Empacotamento Windows e atualização; usadas por `npm run dist:win` e `npm run release:win`. O instalador visual exige .NET Framework/MSBuild compatível. |
| `isolation/` | `prepare-isolation.cjs` | Prepara a imagem Docker por `npm run prepare:isolation`. |
| `assets/` | `make-icon.cjs`, `export-icons.cjs` | Geração/exportação de ícones. `make-icon` exige Playwright instalado globalmente; `export-icons` usa as dependências do projeto. |
| `security/` | `check-public-files.mjs` | Recusa dados locais e e-mails pessoais no conteúdo publicável; usado por `npm run security:check`. |
| `video/` | `studio.cjs`, `demo-worker.cjs`, `score.py`, `render.py`, `film.json` | Estúdio, roteiro e montagem do comercial; veja [a documentação](../docs/marketing/commercial.md). Capturas e renders ficam em `out/`. |

Execute na raiz do repositório. Exemplo: `node scripts/assets/export-icons.cjs out/icones`.

Os testes ficam em [`tests/`](../tests/README.md), separados das ferramentas de distribuição e desenvolvimento.
