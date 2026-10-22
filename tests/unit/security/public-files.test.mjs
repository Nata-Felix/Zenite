import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'zenite-public-files-'));
  mkdirSync(join(root, 'scripts/security'), { recursive: true });
  cpSync('scripts/security/check-public-files.mjs', join(root, 'scripts/security/check-public-files.mjs'));
  execFileSync('git', ['init', '--quiet', root]);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return { root, scan: () => spawnSync(process.execPath, ['scripts/security/check-public-files.mjs'], { cwd: root, encoding: 'utf8' }) };
}

test('publicação recusa .env forçado no Git mesmo quando o arquivo está ignorado', () => {
  const f = fixture({ '.gitignore': '.env\n', '.env': 'QA_VALUE=valor-ficticio\n' });
  execFileSync('git', ['-C', f.root, 'add', '--force', '.env']);
  const result = f.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.env: arquivo local ou sensível/);
  assert.ok(!result.stderr.includes('valor-ficticio'), 'não imprime o conteúdo sensível');
});

test('publicação permite exemplos fictícios e ignora metadados públicos do lockfile', () => {
  const upstream = 'maintainer' + '@' + 'upstream.invalid';
  const f = fixture({ '.env.example': 'QA_VALUE=preencha-localmente\n', 'README.md': 'Teste: conta@example.com\n', 'package-lock.json': JSON.stringify({ deprecated: upstream }) });
  const result = f.scan();
  assert.equal(result.status, 0, result.stderr);
});

test('publicação recusa e-mails pessoais e artefatos de contas sem mostrar valores', () => {
  const personal = 'person' + '@' + 'privacy.invalid';
  const f = fixture({ 'fixture.txt': personal, 'profile/auth.json': '{}', 'sample.env.local': 'QA_VALUE=ficticio' });
  const result = f.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture.txt:1/);
  assert.match(result.stderr, /profile\/auth.json/);
  assert.match(result.stderr, /sample.env.local/);
  assert.ok(!result.stderr.includes(personal));
});
