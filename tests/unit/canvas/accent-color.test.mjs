import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const outfile = resolve('out/test/accent-color.mjs');
await build({ entryPoints: ['src/renderer/accentColor.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { normalizeAccentHex, accentTextColor } = await import(pathToFileURL(outfile));
test('cor personalizada aceita formatos curtos, completos e sem cerquilha', () => {
  assert.equal(normalizeAccentHex(' #ABC '), '#aabbcc');
  assert.equal(normalizeAccentHex('12Ab34'), '#12ab34');
  assert.equal(normalizeAccentHex('#000000'), '#000000');
});
test('entradas incompletas ou inválidas não viram cores aplicáveis', () => {
  for (const value of [null, undefined, {}, '#', '#12', '#12345g', 'red', '#12345678', 'red;--bg:black']) assert.equal(normalizeAccentHex(value), null);
});
test('texto dos botões mantém contraste nas cores claras e escuras', () => {
  assert.equal(accentTextColor('#ffffff'), '#000000');
  assert.equal(accentTextColor('#ffff00'), '#000000');
  assert.equal(accentTextColor('#777777'), '#000000');
  assert.equal(accentTextColor('#000000'), '#ffffff');
  assert.equal(accentTextColor('#000080'), '#ffffff');
});
