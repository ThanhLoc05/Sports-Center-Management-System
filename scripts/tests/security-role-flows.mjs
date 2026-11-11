// Opt-in isolated integration runner. Credentials arrive only through the parent test process.
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const root = path.resolve(process.env.SPORTIVA_TEST_EVIDENCE_ROOT || os.tmpdir());
if (root === repo || root.startsWith(repo + path.sep)) throw Error("Keep evidence outside the repository");
const base = process.env.SPORTIVA_TEST_FRONTEND_URL || "http://127.0.0.1:5175";
if (base !== "http://127.0.0.1:5175") throw Error("Only the isolated frontend on 127.0.0.1:5175 is allowed");
const accounts = JSON.parse(process.env.SPORTIVA_ROLE_ACCOUNTS || "[]");
const fixtureClass = Number(process.env.SPORTIVA_BROWSER_CLASS);
const expectedRoles = ["MEMBER", "COACH", "RECEPTIONIST", "CENTER_MANAGER"];
if (!Number.isSafeInteger(fixtureClass) || fixtureClass < 1 || accounts.length !== 4 ||
    expectedRoles.some(role => accounts.filter(a => a.role === role && a.email && a.password && Number.isSafeInteger(a.id)).length !== 1)) {
  throw Error("Missing isolated fixtures from the parent integration test");
}
fs.mkdirSync(root, { recursive: true });
const dir = fs.mkdtempSync(path.join(root, "SportivaSecurityChrome-"));
const result = { checks: [], api: [], pageErrors: [], unexpectedErrors: [], expectedEmptyResponses: [], directory: dir };
let role = "ANONYMOUS";
const add = (name, pass) => result.checks.push({ role, name, status: pass ? "PASS" : "FAIL" });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // Abort before login if Vite points at a different backend/database fixture.
  const preflight = await browser.newContext();
  try {
    const response = await preflight.request.get(`${base}/api/v1/classes/${fixtureClass}`);
    if (response.status() !== 200) throw Error("Isolated backend fixture unavailable");
    const row = await response.json();
    if (row.id !== fixtureClass || row.coachId !== accounts.find(a => a.role === "COACH").id || row.className !== "Browser isolated fixture") {
      throw Error("Frontend proxy does not match the isolated test fixture");
    }
  } finally { await preflight.close(); }

  for (const route of ["verify-email", "reset-password"]) {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`${base}/${route}?token=public-inert-browser-marker&source=email`);
      await page.waitForFunction(() => !new URL(location.href).searchParams.has("token"));
      add(`${route} query removed`, !new URL(page.url()).searchParams.has("token"));
      await page.reload();
      await page.getByText("Liên kết không còn token trong phiên này. Hãy mở lại liên kết trong email để tiếp tục.").waitFor();
      add(`${route} refresh guidance`, true);
      add(`${route} no stored capability`, await page.evaluate(() => !JSON.stringify(localStorage).includes("public-inert-browser-marker") && !JSON.stringify(sessionStorage).includes("public-inert-browser-marker") && !document.cookie.includes("public-inert-browser-marker")));
      await page.screenshot({ path: path.join(dir, `${route}-refresh.png`), fullPage: true });
    } finally { await ctx.close(); }
  }

  for (const a of accounts) {
    role = a.role;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const page = await ctx.newPage();
      await ctx.route("**/api/**", async route => {
        const q = route.request();
        if (!["GET", "HEAD", "OPTIONS"].includes(q.method()) && !q.url().endsWith("/users/login")) {
          result.unexpectedErrors.push({ role, reason: "Blocked unexpected write", path: new URL(q.url()).pathname });
          return route.abort();
        }
        return route.continue();
      });
      page.on("pageerror", e => result.pageErrors.push({ role, name: e.name }));
      page.on("response", r => {
        const endpoint = new URL(r.url()).pathname;
        if (!endpoint.startsWith("/api/")) return;
        result.api.push({ role, path: endpoint, status: r.status() });
        if (r.status() >= 400) {
          const empty = r.status() === 404 && endpoint === `/api/v1/memberships/members/${a.id}/active`;
          (empty ? result.expectedEmptyResponses : result.unexpectedErrors).push({ role, path: endpoint, status: r.status() });
        }
      });
      await page.goto(`${base}/login`);
      await page.getByLabel("Địa chỉ email").fill(a.email);
      await page.getByLabel("Mật khẩu", { exact: true }).fill(a.password);
      const login = page.waitForResponse(r => r.url().endsWith("/users/login"));
      await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
      add("login", (await login).status() === 200);
      await page.locator("#main-sidebar").waitFor();
      const sidebar = page.locator("#main-sidebar");
      add("admin menus", role === "CENTER_MANAGER" ? await sidebar.locator('a[href="/reports"]').count() === 1 : await sidebar.locator('a[href="/reports"],a[href="/audit"],a[href="/team"]').count() === 0);
      add("support menu", await sidebar.locator('a[href="/support"]').count() === (role === "COACH" ? 0 : 1));
      const paths = role === "MEMBER" ? ["/profile", "/memberships", "/classes", "/bookings", "/schedule", "/attendance", "/training", "/support", "/notifications"] :
        role === "COACH" ? ["/classes", "/students", "/bookings", "/schedule", "/attendance", "/training", "/notifications"] :
        role === "RECEPTIONIST" ? ["/members", "/memberships", "/bookings", "/attendance", "/payments", "/support"] :
        ["/members", "/team", "/classes", "/schedule", "/memberships", "/reports", "/audit"];
      for (const route of paths) {
        await page.goto(base + route);
        await page.locator("main").waitFor();
        await page.waitForTimeout(250);
        const text = await page.locator("main").innerText();
        add(`page ${route}`, text.trim().length > 0 && !text.includes("Ứng dụng cần tải lại.") && !text.includes("Bạn không có quyền"));
        if (route === "/bookings" && ["MEMBER", "COACH"].includes(role)) {
          await page.getByLabel("Lọc theo lớp học").selectOption(String(fixtureClass));
          await page.waitForTimeout(350);
          add("class booking filter", !result.api.some(x => x.role === role && x.status === 403));
        }
        if (route === "/schedule" && ["MEMBER", "COACH"].includes(role)) {
          await page.getByRole("button", { name: "Danh sách", exact: true }).click();
          await page.waitForTimeout(400);
          if (await page.locator(".schedule-list-item").count() === 0) await page.getByRole("button", { name: "Tuần sau" }).click();
          add("calendar public Coach name", (await page.locator(".schedule-list").innerText()).includes("Isolated COACH"));
        }
      }
      await page.screenshot({ path: path.join(dir, `${role}.png`), fullPage: true });
      await page.getByRole("button", { name: "Mở menu tài khoản" }).click();
      await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
      await page.waitForURL("**/login");
      add("logout", true);
    } finally { await ctx.close(); }
  }
} catch (error) {
  // Do not serialize Playwright call logs, request bodies or credential values on failure.
  result.runnerFailure = error.name;
} finally {
  await browser.close();
  fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(result, null, 2));
  console.log("SECURITY_CHROME_EVIDENCE=" + dir);
}
if (result.runnerFailure || result.checks.some(x => x.status === "FAIL") || result.pageErrors.length || result.unexpectedErrors.length) process.exitCode = 1;
