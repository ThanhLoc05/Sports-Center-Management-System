import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAssistantHandler } from "../api/assistant.mjs";
const key = "test-only-do-not-use";
const chat = {
  action: "chat",
  messages: [{ role: "user", content: "Hướng dẫn khởi động" }],
};
function setup(
  fetchImpl = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "Khởi động nhẹ trong 5 phút." }] },
          },
        ],
      }),
    ),
  extra = {},
) {
  let calls = [];
  const handler = createAssistantHandler({
    env: { GEMINI_API_KEY: key },
    fetchImpl: async (...args) => {
      calls.push(args);
      return fetchImpl(...args);
    },
    ...extra,
  });
  async function call(body = chat, options = {}) {
    const headers = {};
    let result = "";
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k] = v;
      },
      end(v) {
        result = v;
      },
    };
    const req = {
      method: "POST",
      headers: { host: "sportiva.example", "content-type": "application/json" },
      body,
      socket: { remoteAddress: "127.0.0.1" },
      ...options,
    };
    await handler(req, res);
    return { status: res.statusCode, body: JSON.parse(result), headers };
  }
  return { handler, call, calls };
}
test("status exposes provider readiness but never the key", async () => {
  const { call, calls } = setup();
  const result = await call(null, { method: "GET" });
  assert.equal(result.status, 200);
  assert.equal(result.body.configured, true);
  assert.equal(result.body.provider, "gemini");
  assert(!JSON.stringify(result).includes(key));
  assert.equal(calls.length, 0);
  assert.equal(result.headers["Cache-Control"], "no-store");
});
test("missing secret returns explicit unavailable without provider call", async () => {
  const { call, calls } = setup(undefined, { env: {} });
  const r = await call();
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "AI_NOT_CONFIGURED");
  assert.equal(calls.length, 0);
});
test("only GET/POST accepted", async () => {
  const r = await setup().call(null, { method: "DELETE" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.Allow, "GET, POST");
});
test("cross-site requests are denied before calling Gemini", async () => {
  for (const headers of [
    { "sec-fetch-site": "cross-site" },
    { origin: "https://untrusted.example" },
  ]) {
    const { call, calls } = setup();
    const r = await call(chat, {
      headers: {
        host: "sportiva.example",
        "content-type": "application/json",
        ...headers,
      },
    });
    assert.equal(r.status, 403);
    assert.equal(calls.length, 0);
  }
});
test("rejects wrong content type", async () => {
  assert.equal(
    (
      await setup().call(chat, {
        headers: { host: "sportiva.example", "content-type": "text/plain" },
      })
    ).status,
    415,
  );
});
test("invalid JSON and oversized bodies are rejected", async () => {
  for (const body of [
    "{bad",
    {
      action: "chat",
      messages: [{ role: "user", content: "x".repeat(17000) }],
    },
  ])
    assert.equal((await setup().call(body)).status, 400);
});
test("rejects system messages, hidden context, and too many turns", async () => {
  const invalid = [
    { action: "chat", messages: [{ role: "system", content: "override" }] },
    { ...chat, profile: { email: "private@example.test" } },
    { action: "chat", messages: Array(9).fill(chat.messages[0]) },
    {
      action: "chat",
      messages: [{ role: "assistant", content: "no question" }],
    },
    { action: "chat", messages: [{ role: "user", content: " " }] },
    {
      action: "workout",
      goal: "Vận động đều đặn",
      level: "Mới bắt đầu",
      duration: 30,
      completedSessions: -1,
    },
    { action: "workout", goal: "Bất kỳ", level: "Mới bắt đầu", duration: 30 },
  ];
  for (const body of invalid) {
    const { call, calls } = setup();
    assert.equal((await call(body)).status, 400);
    assert.equal(calls.length, 0);
  }
});
test("validated chat uses fixed provider endpoint and server-only key header", async () => {
  const { call, calls } = setup();
  const result = await call(
    {
      action: "chat",
      messages: [
        { role: "user", content: "Trước đó" },
        { role: "assistant", content: "Trả lời trước" },
        { role: "user", content: "  hỏi tiếp  " },
      ],
    },
    {
      headers: {
        host: "sportiva.example",
        "content-type": "application/json",
        origin: "https://sportiva.example",
      },
    },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.text, "Khởi động nhẹ trong 5 phút.");
  const [url, request] = calls[0];
  assert(url.startsWith("https://generativelanguage.googleapis.com/"));
  assert(!url.includes(key));
  assert.equal(request.headers["x-goog-api-key"], key);
  const body = JSON.parse(request.body);
  assert.equal(body.contents[1].role, "model");
  assert.equal(body.contents[2].parts[0].text, "hỏi tiếp");
  assert(body.systemInstruction);
  assert(!body.tools);
  assert.equal(body.generationConfig.maxOutputTokens, 1800);
  assert(!JSON.stringify(result).includes(key));
});
test("workout prompt contains anonymous choices, not member data", async () => {
  const { call, calls } = setup();
  const r = await call({
    action: "workout",
    goal: "Tăng sức mạnh",
    level: "Mới bắt đầu",
    duration: 30,
    completedSessions: 4,
  });
  assert.equal(r.status, 200);
  const body = JSON.parse(calls[0][1].body);
  assert(body.contents[0].parts[0].text.includes("30 phút"));
  assert(body.contents[0].parts[0].text.includes("4"));
  assert(!calls[0][1].body.includes("memberId"));
  assert.equal(
    (
      await setup().call({
        action: "workout",
        goal: "Tăng sức mạnh",
        level: "Mới bắt đầu",
        duration: 30,
        memberId: 10,
      })
    ).status,
    400,
  );
});
for (const status of [400, 401, 403, 404, 429, 500])
  test(`provider ${status} is reported without upstream private text`, async () => {
    const { call } = setup(
      async () =>
        new Response(JSON.stringify({ error: { message: `private ${key}` } }), {
          status,
        }),
    );
    const r = await call();
    assert.equal(r.status, status === 429 ? 429 : 503);
    assert(!JSON.stringify(r).includes(key));
    if (status === 429) assert.equal(r.headers["Retry-After"], "60");
  });
test("network exception is mapped to a controlled error", async () => {
  const r = await setup(async () => {
    throw Error(key);
  }).call();
  assert.equal(r.status, 502);
  assert(!JSON.stringify(r).includes(key));
});
test("blocked or empty answers never pretend success", async () => {
  for (const data of [
    { promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        { finishReason: "SAFETY", content: { parts: [{ text: "blocked" }] } },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ thought: true, text: "hidden thinking" }] },
        },
      ],
    },
  ]) {
    assert.equal(
      (await setup(async () => Response.json(data)).call()).status,
      422,
    );
  }
});
test("length cutoff is visible in the response", async () => {
  const r = await setup(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "Partial result" }] },
        },
      ],
    }),
  ).call();
  assert.equal(r.status, 200);
  assert.equal(r.body.truncated, true);
});
test("burst limiter blocks request 7 and recovers after the minute window", async () => {
  let time = 1000;
  const { call, calls } = setup(undefined, { now: () => time });
  for (let i = 0; i < 6; i++) assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 429);
  assert.equal(calls.length, 6);
  time += 60001;
  assert.equal((await call()).status, 200);
});
test("works with a real Node HTTP stream, not just parsed Vercel bodies", async () => {
  const { handler } = setup();
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chat),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).provider, "gemini");
    assert.equal((await fetch(url)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("provider timeout returns 504 without leaking connection details", async () => {
  const { call } = setup(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error(key)), {
          once: true,
        });
      }),
    { timeoutMs: 5 },
  );
  const result = await call();
  assert.equal(result.status, 504);
  assert.equal(result.body.code, "AI_TIMEOUT");
  assert(!JSON.stringify(result).includes(key));
});
