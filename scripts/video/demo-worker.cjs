// Executa operações locais reais no projeto de demonstração. Não simula respostas de IA.
const { request } = require('node:http');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const label = process.argv[2] || 'Execução local';
const call = (path, body) => new Promise((resolve, reject) => {
  const req = request({ socketPath: process.env.O_PIPE, path, method: 'POST', headers: { 'content-type': 'application/json', 'x-o-terminal': process.env.O_TERMINAL_ID, 'x-o-token': process.env.O_TOKEN } }, res => {
    let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(text)) : reject(Error('Operação local recusada')));
  }); req.on('error', reject); req.end(JSON.stringify(body));
});
let round = 0;
async function run() {
  const note = await call('/note', { action: 'read', target: 'briefing' });
  const words = note.content.trim().split(/\s+/).length;
  const report = { projeto: 'Aurora', leitura: ++round, palavras: words, verificacoes: ['briefing conectado', 'identidade da sessão', 'arquivo local'] };
  writeFileSync(join(process.cwd(), 'relatorio-local.json'), JSON.stringify(report, null, 2));
  process.stdout.write('\x1b[2J\x1b[H');
  console.log('\x1b[38;2;153;174;255m' + label.toUpperCase() + '\x1b[0m');
  console.log('Projeto Aurora · demonstração local\n');
  console.log('\x1b[32m✓\x1b[0m Sessão autenticada no canvas');
  console.log('\x1b[32m✓\x1b[0m Briefing conectado: ' + words + ' palavras');
  console.log('\x1b[32m✓\x1b[0m Relatório JSON salvo no projeto');
  console.log('\nLeituras concluídas: ' + round);
  console.log('\nNode.js real · sem chamada a modelo');
}
setTimeout(() => { run().catch(error => console.error(error.message)); setInterval(() => run().catch(() => {}), 4500); }, 1200);
