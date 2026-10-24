import assert from "node:assert/strict";

const origin = (
  process.env.API_TEST_FRONTEND_URL || "http://127.0.0.1:5173"
).replace(/\/$/, "");
const email = process.env.API_TEST_EMAIL;
const password = process.env.API_TEST_PASSWORD;

async function call(path, init = {}) {
  let response;
  try {
    response = await fetch(`${origin}/api/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new Error(
      `Cannot reach frontend/API at ${origin}. Start the frontend and backend, and check API_PROXY_TARGET.`,
    );
  }
  const text = await response.text();
  assert(
    !response.headers.get("content-type")?.includes("text/html"),
    "Received HTML instead of an API response; check the proxy.",
  );
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

try {
  console.log(`Testing real backend through frontend: ${origin}/api/v1`);
  const invalid = await call("/users/login", { method: "POST", body: "{}" });
  assert.equal(
    invalid.status,
    400,
    `Expected backend validation HTTP 400; received ${invalid.status}. Backend may be down or the API contract differs.`,
  );
  console.log(
    "PASS: backend received the login POST and rejected invalid input (HTTP 400).",
  );

  const anonymous = await call("/classes");
  assert(
    [401, 403].includes(anonymous.status),
    `Expected unauthenticated HTTP 401/403; received ${anonymous.status}.`,
  );
  console.log(
    `PASS: protected API requires authentication (HTTP ${anonymous.status}).`,
  );

  if (email || password) {
    assert(email && password, "Set both API_TEST_EMAIL and API_TEST_PASSWORD.");
    const login = await call("/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200, `Login failed (HTTP ${login.status}).`);
    assert(
      login.data?.token && login.data?.user?.id,
      "Invalid login response.",
    );
    const headers = { Authorization: `Bearer ${login.data.token}` };
    const profile = await call(`/users/${login.data.user.id}`, { headers });
    assert.equal(
      profile.status,
      200,
      `Profile read failed (HTTP ${profile.status}).`,
    );
    assert.equal(
      profile.data?.id,
      login.data.user.id,
      "Profile does not match the logged-in account.",
    );
    const classes = await call("/classes", { headers });
    assert.equal(
      classes.status,
      200,
      `Class list failed (HTTP ${classes.status}).`,
    );
    assert(Array.isArray(classes.data), "Class response must be an array.");
    console.log(
      `PASS: login, JWT authentication, profile read and class list (${classes.data.length} classes).`,
    );
  } else {
    console.log(
      "SKIP: account/database flow requires API_TEST_EMAIL and API_TEST_PASSWORD. No data was created.",
    );
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
