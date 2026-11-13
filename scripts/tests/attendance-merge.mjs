// Opt-in companion to AttendanceMergeSqlServerIT. Credentials exist only in the parent/child process.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.resolve(process.env.SPORTIVA_TEST_EVIDENCE_ROOT || os.tmpdir());
if (evidenceRoot === repo || evidenceRoot.startsWith(repo + path.sep)) throw Error("Evidence must be outside the checkout");
const accounts = JSON.parse(process.env.SPORTIVA_ATTENDANCE_ACCOUNTS || "[]");
const fixture = JSON.parse(process.env.SPORTIVA_ATTENDANCE_FIXTURES || "{}");
if (!["MEMBER", "COACH", "OTHER_COACH", "RECEPTIONIST"].every(role => accounts.filter(a => a.role === role && a.email && a.password && Number.isSafeInteger(a.id)).length === 1) ||
    ![fixture.open, fixture.closed, fixture.grace, fixture.graceAttendance, fixture.receptionOpen].every(id => Number.isSafeInteger(id) && id > 0)) throw Error("Isolated fixtures missing");
const base = "http://127.0.0.1:5175";
fs.mkdirSync(evidenceRoot, { recursive: true });
const directory = fs.mkdtempSync(path.join(evidenceRoot, "AttendanceMergeChrome-"));
const result = { fixture, checks: [], clicks: [], api: [], probes: [], pageErrors: [], directory };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [];
const click = async (page, name, locator) => { await locator.click(); result.clicks.push({ role: page.role, name }); };
const check = async (name, test) => {
  try { if (await test() === false) throw Error("Assertion failed"); result.checks.push({ name, status: "PASS" }); }
  catch (error) { result.checks.push({ name, status: "FAIL", error: error.name }); }
};
const rosterName = page => page.locator(".check-in-person strong").filter({ hasText: "Isolated MEMBER" });
const history = page => page.getByRole("row").filter({ hasText: "Isolated MEMBER" });
const selectClass = async (page, id) => {
  await page.getByLabel("Lớp cần điểm danh").selectOption(String(id));
  await page.waitForTimeout(150);
};
async function login(page, actor) {
  await page.goto(base + "/login");
  await page.getByLabel("Địa chỉ email").fill(actor.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(actor.password);
  const response = page.waitForResponse(r => r.url().endsWith("/users/login"));
  await click(page, "Login", page.getByRole("button", { name: "Đăng nhập", exact: true }));
  const token = (await (await response).json()).token;
  await page.locator("#main-sidebar").waitFor();
  return token;
}
try {
  const preflight = await browser.newContext();
  const response = await preflight.request.get(base + "/api/v1/classes/" + fixture.open);
  const value = await response.json();
  await preflight.close();
  if (response.status() !== 200 || value.className !== "Browser isolated fixture" || value.coachId !== accounts.find(a => a.role === "COACH").id)
    throw Error("Frontend does not match isolated backend fixture");
  const sessions = {};
  for (const role of ["COACH", "RECEPTIONIST"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    await context.route("**/api/assistant", route => route.fulfill({ status: 503, json: { error: "External provider disabled in integration test" } }));
    const page = await context.newPage(); page.role = role; page.setDefaultTimeout(15000);
    page.on("pageerror", error => result.pageErrors.push({ role, name: error.name }));
    page.on("response", response => { const endpoint = new URL(response.url()).pathname; if (endpoint.startsWith("/api/")) result.api.push({ role, path: endpoint, status: response.status() }); });
    const actor = accounts.find(a => a.role === role);
    const token = await login(page, actor);
    sessions[role] = { page, context, token, actor };
    await page.goto(base + "/attendance?classId=" + fixture.open);
    await rosterName(page).first().waitFor();
    await check(role + " full names in open roster and enabled Present/Absent", async () => {
      const present = page.getByRole("button", { name: "Có mặt", exact: true }).first();
      const absent = page.getByRole("button", { name: "Vắng", exact: true }).first();
      await page.screenshot({ path: path.join(directory, role + "-open.png"), fullPage: true });
      return await present.isEnabled() && await absent.isEnabled() && !(await page.locator(".check-in-roster").innerText()).includes("Thành viên #" + accounts.find(a => a.role === "MEMBER").id);
    });
    await check(role + " outside window disables controls and backend rejects direct POST", async () => {
      await selectClass(page, fixture.closed); await rosterName(page).first().waitFor();
      const disabled = await page.getByRole("button", { name: "Có mặt", exact: true }).first().isDisabled() && await page.getByRole("button", { name: "Vắng", exact: true }).first().isDisabled() && await page.getByRole("button", { name: "Điểm danh thành viên", exact: true }).isDisabled();
      const probe = await context.request.post(base + "/api/v1/attendance", { headers: { Authorization: "Bearer " + token }, data: { classId: fixture.closed, memberId: accounts.find(a => a.role === "MEMBER").id, status: "PRESENT" } });
      result.probes.push({ role, action: "outside-window check-in", status: probe.status() });
      await page.screenshot({ path: path.join(directory, role + "-closed.png"), fullPage: true });
      await selectClass(page, fixture.open); await rosterName(page).first().waitFor();
      return disabled && probe.status() === 400;
    });
  }
  const coach = sessions.COACH, reception = sessions.RECEPTIONIST;
  await check("Coach names use own students API without private users request", async () => result.api.some(x => x.role === "COACH" && x.path === "/api/v1/classes/" + fixture.open + "/students" && x.status === 200) && !result.api.some(x => x.role === "COACH" && x.path === "/api/v1/users"));
  await check("Receptionist retains permitted user catalogue", async () => result.api.some(x => x.role === "RECEPTIONIST" && x.path === "/api/v1/users" && x.status === 200));
  await check("Coach Absent turns into make-up control and disables repeated Absent", async () => {
    const response = coach.page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/attendance" && r.request().method() === "POST");
    await click(coach.page, "Mark Absent", coach.page.getByRole("button", { name: "Vắng", exact: true }).first());
    const saved = await response; await coach.page.getByRole("button", { name: "Điểm danh bù", exact: true }).waitFor();
    return saved.status() === 201 && await coach.page.getByRole("button", { name: "Vắng", exact: true }).first().isDisabled();
  });
  await check("Receptionist sees absence with name but cannot make up", async () => {
    await reception.page.reload(); await history(reception.page).first().waitFor();
    const response = await reception.context.request.patch(base + "/api/v1/attendance/" + fixture.graceAttendance + "/make-up", { headers: { Authorization: "Bearer " + reception.token } });
    result.probes.push({ role: "RECEPTIONIST", action: "make-up forbidden", status: response.status() });
    return await reception.page.getByRole("button", { name: "Điểm danh bù", exact: true }).count() === 0 && response.status() === 403;
  });
  await check("Coach make-up PATCH preserves name, history and one record after F5", async () => {
    const response = coach.page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith("/make-up"));
    await click(coach.page, "Make up open class", coach.page.getByRole("button", { name: "Điểm danh bù", exact: true }));
    const saved = await response; await coach.page.reload(); await history(coach.page).first().waitFor();
    await coach.page.getByPlaceholder("Tìm thành viên...").fill("Isolated MEMBER");
    await coach.page.screenshot({ path: path.join(directory, "COACH-history.png"), fullPage: true });
    return saved.status() === 200 && (await history(coach.page).innerText()).includes("Có mặt");
  });
  await check("Completed class still supports assigned Coach make-up inside grace period", async () => {
    await selectClass(coach.page, fixture.grace);
    await coach.page.getByRole("button", { name: "Điểm danh bù", exact: true }).waitFor();
    const response = coach.page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith("/make-up"));
    await click(coach.page, "Make up completed class", coach.page.getByRole("button", { name: "Điểm danh bù", exact: true }));
    const saved = await response; await history(coach.page).first().waitFor();
    await coach.page.screenshot({ path: path.join(directory, "COACH-completed-grace.png"), fullPage: true });
    return saved.status() === 200;
  });
  await check("Receptionist history name/search survives F5 and opens normal attendance form", async () => {
    await reception.page.reload(); await history(reception.page).first().waitFor();
    await reception.page.getByPlaceholder("Tìm thành viên...").fill("Isolated MEMBER");
    await history(reception.page).first().waitFor();
    await click(reception.page, "Open attendance form", reception.page.getByRole("button", { name: "Điểm danh thành viên", exact: true }));
    await reception.page.getByRole("dialog").waitFor();
    await click(reception.page, "Close attendance form", reception.page.getByRole("button", { name: "Đóng hộp thoại", exact: true }));
    await reception.page.screenshot({ path: path.join(directory, "RECEPTIONIST-history.png"), fullPage: true });
    return true;
  });
  await check("Receptionist normal Present uses POST and full name survives F5", async () => {
    await reception.page.getByPlaceholder("Tìm thành viên...").fill("");
    await selectClass(reception.page, fixture.receptionOpen); await rosterName(reception.page).first().waitFor();
    const response = reception.page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/attendance" && r.request().method() === "POST");
    await click(reception.page, "Receptionist Present", reception.page.getByRole("button", { name: "Có mặt", exact: true }).first());
    const saved = await response; await history(reception.page).first().waitFor();
    await reception.page.goto(base + "/attendance?classId=" + fixture.receptionOpen);
    await reception.page.reload(); await history(reception.page).first().waitFor();
    return saved.status() === 201 && (await history(reception.page).innerText()).includes("Có mặt");
  });
  await check("Coach history name survives logout/login", async () => {
    await click(coach.page, "Account menu", coach.page.getByRole("button", { name: "Mở menu tài khoản", exact: true }));
    await click(coach.page, "Logout", coach.page.getByRole("button", { name: "Đăng xuất", exact: true }));
    await coach.page.waitForURL("**/login"); await login(coach.page, coach.actor);
    await coach.page.goto(base + "/attendance?classId=" + fixture.grace); await history(coach.page).first().waitFor(); return true;
  });
} catch (error) { result.runnerFailure = error.name; }
finally {
  for (const context of contexts) await context.close();
  await browser.close();
  fs.writeFileSync(path.join(directory, "evidence.json"), JSON.stringify(result, null, 2));
  console.log("ATTENDANCE_MERGE_CHROME_EVIDENCE=" + directory);
}
if (result.runnerFailure || result.checks.some(x => x.status !== "PASS") || result.pageErrors.length) process.exitCode = 1;
