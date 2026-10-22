// História 2 do comercial: canal de culinária fictício. Terminais que o Sol recruta
// escrevem o roteiro, preenchem títulos e hashtags e geram as thumbs (FFmpeg local).
//   node story-youtube.cjs writer | research | thumbs
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const cli = join(__dirname, '../../out/cli/index.js');
const ffmpeg = join(__dirname, '../../out/video-tools/package/ffmpeg.exe');
const zn = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const c = (rgb, t) => `\x1b[38;2;${rgb}m${t}\x1b[0m`;
const pink = '255;122;147', green = '79;209;165', gold = '242;196;109', dim = '125;134;159';
const ready = async (kind, name) => { for (;;) { try { zn(kind, 'read', name); return; } catch { await sleep(400); } } };
const go = async () => { while (!existsSync(join(process.cwd(), '.start-work'))) await sleep(250); };

const SCRIPT = [
  '# Roteiro · Bolo de cenoura de 1 minuto',
  '**Gancho (0–5 s):** "Bolo de cenoura em 1 minuto no micro-ondas. Sério."',
  '**Cena 1:** ingredientes na bancada, cortes rápidos',
  '**Cena 2:** liquidificador + caneca, close na massa',
  '**Cena 3:** micro-ondas, contagem regressiva na tela',
  '**Virada:** cobertura de chocolate escorrendo',
  '**CTA:** "Comenta a próxima receita de 1 minuto"',
];
const TITLES = [
  ['Bolo de cenoura em 1 minuto 🥕', '#bolodecaneca #receitafacil', 'Alta'],
  ['Fiz bolo no micro-ondas e deu certo', '#microondas #doce', 'Média'],
  ['O bolo mais rápido do mundo', '#receitarapida #shorts', 'Alta'],
  ['3 ingredientes, 60 segundos', '#cozinhafacil #lanche', 'Média'],
];

async function writer() {
  console.log(c(gold, 'ROTEIRISTA') + c(dim, '  escrevendo na nota Roteiro…\n'));
  await ready('note', 'Roteiro'); await go();
  let text = '';
  for (const line of SCRIPT) {
    text += (text ? '\n\n' : '') + line;
    zn('note', 'write', 'Roteiro', text);
    console.log(c(green, '  + ') + line.replace(/\*\*/g, '').slice(0, 60));
    await sleep(900);
  }
  console.log('\n' + c(gold, '  roteiro pronto'));
}

async function research() {
  console.log(c(pink, 'PESQUISADOR') + c(dim, '  títulos e hashtags…\n'));
  await ready('table', 'Títulos e hashtags'); await go();
  await sleep(1200);
  const rows = [];
  for (const row of TITLES) {
    rows.push(row);
    zn('table', 'write', 'Títulos e hashtags', ['Título;Hashtags;Potencial', ...rows.map(r => r.join(';'))].join('\n'));
    console.log(c(green, '  + ') + row[0]);
    await sleep(1100);
  }
  console.log('\n' + c(gold, `  ${rows.length} títulos com hashtags`));
}

async function thumbs() {
  const out = join(process.cwd(), 'thumbs');
  mkdirSync(out, { recursive: true });
  console.log(c(gold, 'GERAR IMAGEM') + c(dim, '  salvando em thumbs/\n'));
  await go();
  await sleep(2500);
  const looks = [['0xff7a3d', '0x2b1406', 'BOLO EM 1 MINUTO'], ['0xf2c46d', '0x1f1a07', 'DEU CERTO?!'], ['0x4fd1a5', '0x06231a', '60 SEGUNDOS']];
  for (const [i, [accent, bg, text]] of looks.entries()) {
    const file = join(out, `thumb-${i + 1}.png`);
    console.log(c(dim, `  gerando thumb-${i + 1}.png…`));
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${bg}:s=1280x720`, '-vf',
      `drawbox=x=0:y=0:w=iw:h=ih:color=${accent}@0.18:t=fill,drawbox=x=60:y=470:w=1160:h=190:color=${accent}:t=fill,` +
      `drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf':text='${text}':fontsize=118:fontcolor=0x111111:x=(w-text_w)/2:y=505,` +
      `drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf':text='🥕':fontsize=10:fontcolor=white:x=10:y=10`, '-frames:v', '1', file]);
    console.log(c(green, `  ✓ thumbs/thumb-${i + 1}.png`));
    await sleep(900);
  }
  console.log('\n' + c(gold, '  3 thumbs salvas na pasta'));
  require('node:fs').writeFileSync(join(process.cwd(), '.thumbs-done'), '1');
}

const mode = process.argv[2];
({ writer, research, thumbs })[mode]?.().catch(e => console.error(e.message));
setInterval(() => {}, 1 << 30);
