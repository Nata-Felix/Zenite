// Agente de mentira que responde como o Codex: tela com a mensagem da pessoa (› …), a
// resposta (• …), a caixa de digitação e o rodapé. "status" responde sem perguntar;
// "home" pergunta com opções numeradas. Grava tudo o que recebe.
//   node reply-agent.cjs ARQUIVO_RECEBIDO
const fs = require('node:fs');
const [received] = process.argv.slice(2);
let typed = '';
const frame = (asked, reply) => {
  process.stdout.write('\x1b[2J\x1b[H');
  console.log([`› ${asked}`, '', ...reply, '', '› Ask Codex to do anything', '', '  GPT-6.1-Sol medium · C:\\projeto', '  ↵ for agents · ? for shortcuts'].join('\n'));
};
frame('…', ['• Pronto para começar.']);
process.stdin.setRawMode?.(true);
process.stdin.on('data', (d) => {
  fs.appendFileSync(received, d);
  const s = d.toString('utf8').replace(/\x1b\[20[01]~/g, '');
  if (!s.includes('\r')) { typed += s; return; }
  const asked = (typed + s.split('\r')[0]).trim();
  typed = '';
  setTimeout(() => {
    // Respostas do tamanho das de um CLI real (o Zênite só conta como trabalho a partir de 400 bytes).
    const intro = ['• Li o briefing, a pasta src/ e os componentes que já existem no projeto.', '  Comparei com as referências ligadas no canvas e com o que a equipe pediu na nota.', '  Rodei os testes de interface e conferi o tempo de carga da página inicial.', ''];
    if (/home/i.test(asked)) frame(asked, [...intro, '  Posso montar a home de dois jeitos:', '', '  **Qual você prefere?**', '  1. Hero grande com vídeo', '  2. Grade de produtos']);
    else frame(asked, [...intro, '  Tudo pronto. Os **testes** passaram.']);
  }, 400);
});
