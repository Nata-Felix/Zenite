// Agente de mentira para os testes da caixa de mensagem: depois de 3 s mostra uma pergunta
// com opções (como o Codex/Antigravity pedindo permissão), pede atenção com zn notify,
// redesenha o menu nas setas e grava a opção escolhida no Enter.
//   node menu-agent.cjs ARQUIVO_RECEBIDO CAMINHO_DO_CLI
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const [received, cli] = process.argv.slice(2);
const options = ['Yes, run command', 'Yes, and always allow', 'No, cancel'];
let at = 0;
let shown = false;
const draw = () => {
  process.stdout.write('\x1b[2J\x1b[H');
  console.log(['Requesting permission for: npm test', '', 'Run this command?', ...options.map((o, i) => `${i === at ? '›' : ' '} ${i + 1}. ${o}`), '', '↑/↓ Navigate · enter select'].join('\n'));
};
process.stdin.setRawMode?.(true);
process.stdin.on('data', (d) => {
  fs.appendFileSync(received, d);
  if (!shown) return;
  const s = d.toString('latin1');
  // Cada seta conta (o Zênite manda várias de uma vez).
  at = Math.min(Math.max(at + s.split('\x1b[B').length - s.split('\x1b[A').length, 0), options.length - 1);
  if (s.includes('\r')) {
    fs.appendFileSync(received, `\nESCOLHIDO=${at + 1}`);
    shown = false;
    process.stdout.write('\x1b[2J\x1b[Hok\n');
    return;
  }
  draw();
});
setTimeout(() => {
  shown = true;
  draw();
  execFileSync(process.execPath, [cli, 'notify', 'Posso rodar os testes?']);
}, 3000);
