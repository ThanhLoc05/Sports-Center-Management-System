/** TẠO MỚI: kiểm tra proxy chỉ chuyển đúng webhook, giữ xác thực và từ chối upstream ngoài máy. */
/** Kiểm thử cổng tunnel bằng HTTP thật trên máy, không gọi ngân hàng hoặc thay đổi đơn thật. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createWebhookProxy, WEBHOOK_PATH } from './sepay-webhook-proxy.mjs';

test('Proxy chỉ chuyển đúng webhook JSON, giữ khóa/status và chặn đường dẫn ngoài phạm vi', async () => {
  const calls = [];
  const backend = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      calls.push({ path: req.url, key: req.headers.authorization, body: Buffer.concat(chunks).toString() });
      const ok = req.headers.authorization === 'Apikey test-only';
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: ok }));
    });
  });
  await new Promise(r => backend.listen(0, '127.0.0.1', r));
  const proxy = createWebhookProxy('http://127.0.0.1:' + backend.address().port);
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + proxy.address().port;
  try {
    for (const endpoint of ['/api/v1/users', WEBHOOK_PATH + '?target=/api/v1/users', '/api/v1/payments/webhooks/%73epay'])
      assert.equal((await fetch(base + endpoint)).status, 404);
    assert.equal((await fetch(base + WEBHOOK_PATH)).status, 405);
    assert.equal((await fetch(base + WEBHOOK_PATH, { method: 'POST', body: '{}' })).status, 415);
    assert.equal(calls.length, 0);
    const body = JSON.stringify({ id: 0 });
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Apikey test-only' }, body };
    const ok = await fetch(base + WEBHOOK_PATH, options);
    assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { success: true });
    assert.deepEqual(calls[0], { path: WEBHOOK_PATH, key: 'Apikey test-only', body });
    assert.equal((await fetch(base + WEBHOOK_PATH, { ...options, headers: { 'Content-Type': 'application/json' } })).status, 401);
    assert.equal((await fetch(base + WEBHOOK_PATH, { ...options, body: 'x'.repeat(65537) })).status, 413);
    assert.equal(calls.length, 2);
    await new Promise(r => backend.close(r));
    const unavailable = await fetch(base + WEBHOOK_PATH, options);
    assert.equal(unavailable.status, 502);
    assert.deepEqual(await unavailable.json(), { success: false });
  } finally {
    proxy.closeAllConnections(); backend.closeAllConnections();
    await Promise.all([new Promise(r => proxy.close(r)), new Promise(r => backend.close(r))]);
  }
});

test('Proxy từ chối cấu hình upstream ra Internet', () => {
  for (const url of ['https://example.com', 'http://localhost:8080', 'http://127.0.0.1:8080/other', 'http://a:b@127.0.0.1:8080'])
    assert.throws(() => createWebhookProxy(url));
});
