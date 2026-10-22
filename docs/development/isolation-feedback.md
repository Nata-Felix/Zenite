# Relatos técnicos de isolamento — 22/10/2026

Resumo de problemas relatados durante uso do aplicativo. Não representa uma nova execução
de testes. Dados de contas, caminhos locais e inventários de entregas de projetos pessoais
foram removidos; decisões e correções continuam no histórico Git.

## Transferência de arquivos

- Binários não podem passar por conversão UTF-8. Áudio, imagens e vídeos precisam preservar os bytes.
- `zn access read --out` e `write --file` usam base64 e partes de 512 KB. Interrupções podem deixar arquivos parciais; verificar tamanho e hash após concluir.
- O limite HTTP de 1 MB ainda afeta conteúdo inline grande. Não confundir o tamanho por requisição com o tamanho total de uma transferência em partes.
- A autorização precisa respeitar o recurso conectado e as regras do terminal em cada operação.

## Execução e recursos

- Pip, venv, xz, FFmpeg e bibliotecas do Chromium foram adicionados à imagem isolada.
- O runtime recebeu limites configuráveis de CPU/memória e ajustes de processos, `/dev/shm` e `/tmp`.
- A área `/exchange` permite troca de arquivos por galáxia sem compartilhar perfis de autenticação.
- Contêineres existentes podem precisar ser recriados para adotar a configuração nova.
- A disponibilidade de comandos no isolamento não equivale à validação de uma tarefa real de cada provedor.

## Comandos, permissões e interface

- Relatos envolveram `zn history`, criação/remoção de diretórios, espera por autorização e acesso a descendentes de pastas conectadas.
- Também foram relatadas falhas ao recrutar/reiniciar shells e agentes e ao configurar esforço por terminal.
- A escrita de tabelas precisa preservar separadores dentro de células CSV entre aspas.
- Interação com elementos deve restaurar a ferramenta anterior ao sair da seleção temporária.

Consulte as [pendências](pending.md), o [roteiro de isolamento](../testing/isolation.md)
e o [catálogo de testes](../../tests/README.md) para a situação e os comandos de validação.
