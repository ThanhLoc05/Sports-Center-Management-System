/** Kiểm thử URL, giới hạn cổng và lọc log; không dùng Authtoken hoặc giao dịch thật. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ngrokOrigin,
  ngrokArguments,
  ngrokEvent,
} from "./start-sepay-ngrok.mjs";

test("Domain cố định nhận HTTPS hợp lệ và chuẩn hóa tên được cấp", () => {
  assert.equal(
    ngrokOrigin("stable-webhook.ngrok-free.dev"),
    "https://stable-webhook.ngrok-free.dev",
  );
  assert.equal(
    ngrokOrigin("https://test.ngrok-free.app/"),
    "https://test.ngrok-free.app",
  );
  assert.equal(
    ngrokOrigin(" https://TEST.ngrok.dev/ "),
    "https://test.ngrok.dev",
  );
});
test("Không nhận domain ngoài ngrok, URL có tài khoản, cổng, đường dẫn hoặc tham số", () => {
  for (const input of [
    null,
    "",
    "http://test.ngrok.dev",
    "https://example.com",
    "https://a:b@test.ngrok.dev",
    "https://test.ngrok.dev:8080",
    "https://test.ngrok.dev/api",
    "https://test.ngrok.dev?x=1",
    "https://test.ngrok.dev#x",
    "test.ngrok-free.dev.evil.example",
    "test.ngrok-free.dev --url https://evil.example",
    "https://test.ngrok.dev\\@evil.example",
  ])
    assert.throws(() => ngrokOrigin(input));
});
test("Ngrok chỉ trỏ proxy 8091, giữ domain cố định và không đưa token vào tham số", () => {
  const args = ngrokArguments(
    "test.ngrok-free.dev",
    "E:/project/.local/ngrok/agent.yml",
  );
  assert.deepEqual(args.slice(0, 4), [
    "http",
    "http://127.0.0.1:8091",
    "--url",
    "https://test.ngrok-free.dev",
  ]);
  assert.ok(args.includes("--inspect=false"));
  assert.ok(
    !args.some(
      (value) => value.includes("8080") || value.includes("authtoken"),
    ),
  );
});
test("Chỉ báo sẵn sàng đúng domain và chỉ lấy mã lỗi thay vì in log/khóa", () => {
  const origin = "https://test.ngrok-free.dev";
  assert.deepEqual(
    ngrokEvent(JSON.stringify({ msg: "started tunnel", url: origin }), origin),
    { ready: true, codes: [] },
  );
  assert.equal(
    ngrokEvent(
      JSON.stringify({
        msg: "started tunnel",
        url: "https://other.ngrok-free.dev",
      }),
      origin,
    ).ready,
    false,
  );
  assert.deepEqual(
    ngrokEvent("secret-value ERR_NGROK_108 ERR_NGROK_108", origin),
    { ready: false, codes: ["ERR_NGROK_108"] },
  );
  assert.deepEqual(ngrokEvent("not json", origin), { ready: false, codes: [] });
});
