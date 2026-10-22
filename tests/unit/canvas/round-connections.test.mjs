import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const outfile = resolve('out/test/round-connections.mjs');
await build({ entryPoints: ['src/renderer/roundConnections.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { summaryCircle, circleEndpoint } = await import(pathToFileURL(outfile));
test('conexão chega à circunferência em qualquer direção', () => {
  const circle = { x: 72, y: 44, radius: 44 };
  for (let i = 0; i < 16; i++) {
    const angle = Math.PI * i / 8;
    const toward = { x: circle.x + Math.cos(angle) * 400, y: circle.y + Math.sin(angle) * 400 };
    const p = circleEndpoint(circle, toward);
    assert.ok(Math.abs(Math.hypot(p.x - circle.x, p.y - circle.y) - 44) < 1e-8);
    assert.ok(Math.abs((p.x - circle.x) * (toward.y - circle.y) - (p.y - circle.y) * (toward.x - circle.x)) < 1e-8);
  }
});
test('rótulos não alteram o centro; Sol usa o círculo dos raios', () => {
  const node = { type: 'summary', width: 144, internals: { positionAbsolute: { x: 100, y: 200 } }, data: {} };
  assert.deepEqual(summaryCircle(node), { x: 172, y: 244, radius: 44 });
  assert.deepEqual(summaryCircle({ ...node, measured: { width: 600 } }), { x: 172, y: 244, radius: 44 }, 'medida antiga do cartão expandido não desloca a ligação');
  assert.deepEqual(summaryCircle({ ...node, width: 168, data: { terminal: { sun: true } } }), { x: 184, y: 259, radius: 59 });
  assert.equal(summaryCircle({ ...node, type: 'note' }), undefined);
});
test('sobrepor centros mantém coordenadas finitas e extremos opostos', () => {
  const circle = { x: 10, y: 20, radius: 44 };
  assert.equal(circleEndpoint(circle, circle).x, 54);
  assert.equal(circleEndpoint(circle, circle, -1).x, -34);
});
