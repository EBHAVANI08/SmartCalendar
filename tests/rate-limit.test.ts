// npm run test:setup
import test from 'node:test';
import assert from 'node:assert/strict';
import { clear, clientIp, pausedFor, record } from '../src/lib/rate-limit';

test('a key is paused after the limit and released after the window', async () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 4; i++) record(key, 200);
  assert.equal(pausedFor(key, 5), 0, 'below the limit');
  record(key, 200);
  assert.ok(pausedFor(key, 5) > 0, 'paused at the limit');
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(pausedFor(key, 5), 0, 'window over');
});

test('clear resets a key; other keys are independent', () => {
  const a = `test:a:${Math.random()}`;
  const b = `test:b:${Math.random()}`;
  for (let i = 0; i < 5; i++) record(a, 60000);
  record(b, 60000);
  assert.ok(pausedFor(a, 5) > 0);
  assert.equal(pausedFor(b, 5), 0);
  clear(a);
  assert.equal(pausedFor(a, 5), 0);
});

test('client address comes from the proxy headers', () => {
  assert.equal(clientIp(new Request('http://x', { headers: { 'cf-connecting-ip': '1.2.3.4' } })), '1.2.3.4');
  assert.equal(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } })), '5.6.7.8');
  assert.equal(clientIp(new Request('http://x')), 'unknown');
});
