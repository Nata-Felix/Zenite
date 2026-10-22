import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const outfile = resolve('out/test/connection-effects.mjs');
await build({ entryPoints: ['src/renderer/connectionEffects.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { CONNECTION_EFFECTS, CONNECTION_TIMING, normalizeAnimation, normalizeEffectOptions, sampleRoute, routePoint, connectionEffectFrame } = await import(pathToFileURL(outfile));
const route = sampleRoute({ getTotalLength: () => 200, getPointAtLength: (n) => ({ x: 10, y: n + 20 }) });

test('preferências antigas e valores inválidos preservam uma animação utilizável', () => {
  assert.equal(normalizeAnimation(undefined), 'classic');
  assert.equal(normalizeAnimation('desconhecido'), 'classic');
  assert.equal(CONNECTION_EFFECTS.length, 13);
  for (const effect of CONNECTION_EFFECTS) assert.equal(normalizeAnimation(effect.id), effect.id);
  assert.deepEqual(normalizeEffectOptions(null), { color: '', activeSpeed: 1, idleSpeed: 1 });
  assert.deepEqual(normalizeEffectOptions({ color: 'red', activeSpeed: Infinity, idleSpeed: -2 }), { color: '', activeSpeed: 1, idleSpeed: 0 });
  assert.deepEqual(normalizeEffectOptions({ color: '#aabbcc', activeSpeed: 8, idleSpeed: 9 }), { color: '#aabbcc', activeSpeed: 4, idleSpeed: 3 });
});

test('partículas seguem a rota e o deslocamento é perpendicular à ligação', () => {
  const p = routePoint(route, 0.5, 5);
  assert.equal(p.x + route.x, 5);
  assert.equal(p.y + route.y, 120);
  assert.equal(p.angle, Math.PI / 2);
  assert.equal(routePoint(route, -1).y + route.y, 20);
  assert.equal(routePoint(route, 2).y + route.y, 220);
  assert.equal(routePoint(route, 0, 15).x + route.x, 10, 'efeito converge no início');
  assert.equal(routePoint(route, 1, 15).x + route.x, 10, 'efeito converge no fim');
});

function drawing(effect, active, reverse, state = { time: 0.7, energy: 0 }) {
  const shapes = connectionEffectFrame(route, effect, { color: '', activeSpeed: 1, idleSpeed: 1 }, state, 1 / 60, active, reverse);
  for (const shape of shapes) {
    for (const value of Object.values(shape)) if (typeof value === 'number') assert.ok(Number.isFinite(value), effect);
    assert.ok(shape.opacity >= 0 && shape.opacity <= 1);
    if (shape.kind === 'path') assert.doesNotMatch(shape.d, /NaN|Infinity/);
  }
  return shapes;
}

test('os 13 efeitos desenham em repouso e em transmissão nos dois sentidos', () => {
  const signatures = new Set();
  for (const { id } of CONNECTION_EFFECTS) {
    signatures.add(JSON.stringify(drawing(id, true, false)));
    assert.ok(drawing(id, false, false).length > 0);
    assert.notDeepEqual(drawing(id, true, true), drawing(id, true, false));
  }
  assert.equal(signatures.size, 13);
});

test('envio acelera, parada desacelera e velocidade zero congela o repouso', () => {
  const state = { time: 0, energy: 0 }, options = { color: '', activeSpeed: 1, idleSpeed: 0 };
  const frame = (active) => connectionEffectFrame(route, 'stardust', options, state, 1 / 60, active, false);
  frame(false); assert.equal(state.time, 0);
  for (let i = 0; i < 120; i++) frame(true);
  assert.ok(state.energy > 0.99);
  const energy = state.energy;
  frame(false); assert.ok(state.energy < energy);
  for (let i = 0; i < 1200; i++) frame(false);
  const stopped = state.time;
  frame(false); assert.equal(state.time, stopped);
});

test('velocidade padrão dos vetores usa os tempos da clássica e aceita os multiplicadores', () => {
  for (const active of [false, true]) {
    const state = { time: 0, energy: active ? 1 : 0, travel: 0 };
    const dt = 1 / 60, duration = active ? CONNECTION_TIMING.active : CONNECTION_TIMING.idle;
    const options = { color: '', activeSpeed: 1, idleSpeed: 1 };
    for (let i = 0; i < Math.round(duration / dt); i++) connectionEffectFrame(route, 'stardust', options, state, dt, active, false);
    assert.ok(Math.abs(state.travel - 1) < 1e-10, 'um percurso no tempo da clássica');
    const before = state.travel;
    connectionEffectFrame(route, 'stardust', { ...options, activeSpeed: 2, idleSpeed: 2 }, state, dt, active, false);
    assert.ok(Math.abs(state.travel - before - dt * 2 / duration) < 1e-10);
  }
});
