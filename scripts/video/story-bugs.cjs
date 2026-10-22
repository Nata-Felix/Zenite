// História 1 do comercial: trabalho real dos terminais que o Sol recruta.
//   node story-bugs.cjs seed DIR   cria o projeto da loja com bugs plantados (git já iniciado pelo estúdio)
//   node story-bugs.cjs hunter     varre os arquivos, acha os bugs e preenche a tabela Bugs
//   node story-bugs.cjs fixer      corrige cada bug no arquivo, commita e marca a tabela
// As escritas na tabela passam pelo zn do próprio terminal (só funciona ligado à tabela).
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const cli = process.env.ZN_CLI || join(__dirname, '../../out/cli/index.js');
const zn = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const c = (rgb, t) => `\x1b[38;2;${rgb}m${t}\x1b[0m`;
const pink = '255;122;147', green = '79;209;165', gold = '242;196;109', dim = '125;134;159', blue = '142;162;255';

// Cada bug: arquivo, padrão errado, correção e descrição curta para a tabela.
const BUGS = [
  { file: 'carrinho.js', bad: 'for (let i = 0; i <= itens.length; i++)', good: 'for (let i = 0; i < itens.length; i++)', label: 'Laço passa do fim da lista' },
  { file: 'carrinho.js', bad: 'if (total == "0")', good: 'if (total === 0)', label: 'Comparação frouxa com texto' },
  { file: 'carrinho.js', bad: '  console.log("debug", itens);\n', good: '', label: 'console.log esquecido' },
  { file: 'checkout.js', bad: 'const resposta = await fetch(url);', good: 'const resposta = await fetch(url).catch(() => null);\n  if (!resposta?.ok) return mostrarErro();', label: 'Pagamento sem tratar falha' },
  { file: 'index.html', bad: '<img src="logo.png">', good: '<img src="logo.png" alt="Loja Aurora">', label: 'Imagem sem texto alternativo' },
  { file: 'index.html', bad: '<head>\n', good: '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n', label: 'Sem viewport no celular' },
  { file: 'estilos.css', bad: 'color: #fffff;', good: 'color: #ffffff;', label: 'Cor inválida no botão' },
];

function seed(dir) {
  writeFileSync(join(dir, 'carrinho.js'), `// Carrinho da Loja Aurora\nexport function totalDoCarrinho(itens) {\n  let total = 0;\n  for (let i = 0; i <= itens.length; i++) {\n    total += itens[i].preco * itens[i].qtd;\n  }\n  console.log("debug", itens);\n  if (total == "0") return "Carrinho vazio";\n  return total.toFixed(2);\n}\n`);
  writeFileSync(join(dir, 'checkout.js'), `// Pagamento\nexport async function pagar(url, pedido) {\n  const resposta = await fetch(url);\n  return resposta.json();\n}\n`);
  writeFileSync(join(dir, 'index.html'), `<!doctype html>\n<html lang="pt-BR">\n<head>\n<title>Loja Aurora</title>\n<link rel="stylesheet" href="estilos.css">\n</head>\n<body>\n  <img src="logo.png">\n  <button class="comprar">Comprar</button>\n</body>\n</html>\n`);
  writeFileSync(join(dir, 'estilos.css'), `.comprar {\n  background: #6c5ce7;\n  color: #fffff;\n  border-radius: 10px;\n}\n`);
}

const csv = rows => ['#;Bug;Arquivo;Status', ...rows.map(r => r.join(';'))].join('\n');
const stateFile = dir => join(dir, '.bugs.json');

async function hunter() {
  const dir = process.cwd();
  console.log(c(pink, 'CAÇADOR DE BUGS') + c(dim, '  varrendo o projeto…\n'));
  // Espera o Sol criar a tabela Bugs e ligá-la a este terminal.
  for (;;) { try { zn('table', 'read', 'Bugs'); break; } catch { await sleep(400); } }
  while (!existsSync(join(dir, '.start-hunt'))) await sleep(250);
  await sleep(600);
  const found = [], state = [];
  for (const [i, bug] of BUGS.entries()) {
    const file = join(dir, bug.file);
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    process.stdout.write(c(dim, `  lendo ${bug.file.padEnd(12)}`));
    await sleep(500);
    if (!text.includes(bug.bad)) { console.log(c(green, ' ok')); continue; }
    const line = text.slice(0, text.indexOf(bug.bad)).split('\n').length;
    found.push([String(found.length + 1), bug.label, `${bug.file}:${line}`, 'Aberto']);
    state.push({ row: found.at(-1), bug: i });
    console.log(c(pink, ` ✗ ${bug.label}`) + c(dim, ` (linha ${line})`));
    zn('table', 'write', 'Bugs', csv(found));
    writeFileSync(stateFile(dir), JSON.stringify(state));
    await sleep(700 + (i % 3) * 200);
  }
  console.log('\n' + c(gold, `  ${found.length} bugs anotados na tabela Bugs`));
  writeFileSync(join(dir, '.hunter-done'), '1');
}

async function fixer() {
  const dir = process.cwd();
  console.log(c(green, 'CORRETOR') + c(dim, '  aguardando a lista de bugs…\n'));
  while (!existsSync(join(dir, '.hunter-done'))) await sleep(400);
  await sleep(800);
  const rows = JSON.parse(readFileSync(stateFile(dir), 'utf8'));
  const touched = new Set();
  for (const [n, { row, bug }] of rows.entries()) {
    const b = BUGS[bug];
    zn('table', 'set', 'Bugs', String(n + 2), '4', 'Corrigindo…');
    console.log(c(blue, `  #${row[0]} `) + b.label);
    await sleep(700);
    const file = join(dir, b.file);
    writeFileSync(file, readFileSync(file, 'utf8').replace(b.bad, b.good));
    touched.add(b.file);
    console.log(c(green, `     ✓ corrigido em ${b.file}`));
    zn('table', 'set', 'Bugs', String(n + 2), '4', 'Corrigido ✓');
    await sleep(500);
  }
  execFileSync('git', ['-C', dir, 'add', '-A', '--', ...touched]);
  execFileSync('git', ['-C', dir, 'commit', '--quiet', '-m', `Corrige ${rows.length} bugs da Loja Aurora`]);
  console.log('\n' + c(gold, `  ${rows.length} bugs corrigidos · ${touched.size} arquivos · commit feito`));
  writeFileSync(join(dir, '.fixer-done'), JSON.stringify({ bugs: rows.length, files: [...touched] }));
}

module.exports = { seed };
if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'hunter') hunter().catch(e => console.error(e.message));
  else if (mode === 'fixer') fixer().catch(e => console.error(e.message));
  setInterval(() => {}, 1 << 30);
}
