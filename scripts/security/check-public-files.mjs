// Verifica nomes de arquivos e dados pessoais óbvios sem imprimir seus valores.
// Credenciais são verificadas pelo Gitleaks na CI, inclusive no histórico.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const problems = [];
const allowedEmail = /@(?:example\.(?:com|org|net)|exemplo\.com|users\.noreply\.github\.com)$/i;
for (const file of files) {
  const full = resolve(root, file);
  if (!existsSync(full) || !statSync(full).isFile()) continue;
  const name = basename(file);
  const example = /^\.env\.(?:example|sample|template)$/.test(name);
  const sensitive = (!example && /^(?:\.env(?:$|\.)|.+\.env(?:$|\.)|\.envrc$)/i.test(name))
    || /^(?:auth|credentials|secrets)\.json(?:$|[.-])/i.test(name)
    || /\.(?:pem|key|p12|pfx|log|zenite|zenite-galaxia)$/i.test(name)
    || /^(?:id_rsa|id_ed25519)(?:$|\.)/.test(name)
    || /(?:^|\/)(?:\.aws|\.ssh|\.zenite|\.claude)\//.test(file)
    || /^(?:out|output|dist|dist-bench|coverage|test-results|playwright-report|contas|segredos|backups|workspaces|universos|galaxias-importadas)\//.test(file);
  if (sensitive) problems.push(`${file}: arquivo local ou sensível não deve ser publicado`);
  // O lockfile contém metadados públicos dos autores de dependências do npm.
  if (file === 'package-lock.json' || !/\.(?:md|[cm]?js|tsx?|json|ya?ml|toml|txt|cs|xaml)$/.test(name)) continue;
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const emails = lines[index].match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [];
    if (emails.some(email => !allowedEmail.test(email))) problems.push(`${file}:${index + 1}: substitua o e-mail por um endereço example.com ou use o noreply do GitHub`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.log(`Publicação: ${files.length} caminhos verificados; nenhum arquivo proibido ou e-mail pessoal detectado.`);
