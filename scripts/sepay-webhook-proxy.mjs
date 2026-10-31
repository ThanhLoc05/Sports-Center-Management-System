/** TẠO MỚI: cổng demo webhook riêng để tunnel không công khai các API quản trị của backend. */
/**
 * Cổng nhận webhook khi demo local: tunnel chỉ trỏ vào cổng này, không công khai toàn bộ backend.
 * Khóa SePay được backend kiểm tra; proxy chỉ chuyển đúng POST webhook, không ghi header/body vào log.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const WEBHOOK_PATH = '/api/v1/payments/webhooks/sepay';
const MAX_BODY = 64 * 1024;

export function createWebhookProxy(backendOrigin = 'http://127.0.0.1:8080') {
  const target = new URL(backendOrigin);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/' || target.search || target.hash || target.username || target.password)
    throw Error('Proxy chỉ được chuyển tới backend HTTP trên 127.0.0.1.');
  const server = http.createServer((req, res) => {
    const reply = (status, body) => {
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    // So khớp URL nguyên vẹn; không chấp nhận đường dẫn khác, query hoặc biến thể mã hóa.
    if (req.url !== WEBHOOK_PATH) { req.resume(); reply(404, { success: false }); return; }
    if (req.method !== 'POST') { req.resume(); reply(405, { success: false }); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      req.resume(); reply(415, { success: false }); return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { chunks.length = 0; reply(413, { success: false }); return; }
      if (!res.writableEnded) chunks.push(chunk);
    });
    req.on('error', () => reply(400, { success: false }));
    req.on('end', async () => {
      if (res.writableEnded || res.destroyed) return;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (req.headers.authorization) headers.Authorization = req.headers.authorization;
        const upstream = await fetch(new URL(WEBHOOK_PATH, target), {
          method: 'POST', headers, body: Buffer.concat(chunks),
          redirect: 'error', signal: AbortSignal.timeout(25000),
        });
        // Giữ mã HTTP và JSON của backend để SePay biết có cần gửi lại hay không.
        const body = Buffer.from(await upstream.arrayBuffer());
        if (res.writableEnded || res.destroyed) return;
        res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
      } catch {
        // Không trả stack trace, địa chỉ nội bộ hoặc bí mật khi backend chưa sẵn sàng.
        reply(502, { success: false });
      }
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SEPAY_PROXY_PORT || 8091);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Cổng proxy không hợp lệ.');
  const server = createWebhookProxy();
  server.listen(port, '127.0.0.1', () => console.log(`Webhook proxy: http://127.0.0.1:${port}${WEBHOOK_PATH}`));
  server.on('error', () => { console.error('Không mở được cổng proxy webhook.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
}
