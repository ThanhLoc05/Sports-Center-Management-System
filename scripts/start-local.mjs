/** Khởi động FE + backend hiện có để trình bày local. Không sửa source/schema backend. */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Chỉ chạy Backend chính, không tự quay về source cũ ở gốc.
const backendRoot = path.join(root, "backend");
const local = path.join(root, ".local");
fs.mkdirSync(local, { recursive: true });
const env = { ...process.env, VITE_DATA_MODE: "api" };
const config = path.join(root, ".env.backend.local");
if (!fs.existsSync(config))
  throw Error("Thiếu .env.backend.local chứa cấu hình SQL/JWT của máy.");
for (const line of fs.readFileSync(config, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
// Kiểm tra JDK trước khi chạy Maven; không hạ phiên bản Java của Backend.
if (!env.JAVA_HOME) throw Error("Hãy đặt JAVA_HOME tới JDK 27 trong terminal hiện tại.");
const java = path.join(env.JAVA_HOME, "bin", "java.exe");
const javac = path.join(env.JAVA_HOME, "bin", "javac.exe");
for (const binary of [java, javac]) {
  const check = spawnSync(binary, ["-version"], { encoding: "utf8", windowsHide: true });
  if (check.error || check.status !== 0 || !/version "27(?:[."]|$)|javac 27(?:[.\s]|$)/m.test(`${check.stdout || ""}\n${check.stderr || ""}`))
    throw Error("JAVA_HOME phải trỏ tới JDK 27 có cả java.exe và javac.exe.");
}
// Windows có thể dùng tên Path; giữ các lệnh hệ thống khi thêm JDK vào đầu PATH.
const existingPath = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
const inheritedPath = existingPath ? env[existingPath] : "";
if (existingPath && existingPath !== "PATH") delete env[existingPath];
env.PATH = `${path.join(env.JAVA_HOME, "bin")}${path.delimiter}${inheritedPath}`;

env.SERVER_TOMCAT_BASEDIR = path.join(local, "tomcat").replaceAll("\\", "/");
const listening = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.setTimeout(800);
    const done = (value) => {
      s.destroy();
      resolve(value);
    };
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
    s.once("timeout", () => done(false));
  });
async function wait(port, label, child) {
  for (let i = 0; i < 90; i++) {
    if (await listening(port)) return;
    if (child?.startupError) throw child.startupError;
    if (child && child.exitCode !== null)
      throw Error(
        label +
          " đã thoát (mã " +
          child.exitCode +
          "). Xem .local/" +
          label +
          ".stderr.log và .stdout.log.",
      );
    if (i % 15 === 0) console.log(`Đang chờ ${label}...`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error(`${label} chưa chạy. Xem log trong .local.`);
}
function start(binary, args, cwd, name, windowsVerbatimArguments = false) {
  const out = fs.openSync(path.join(local, name + ".stdout.log"), "a"),
    err = fs.openSync(path.join(local, name + ".stderr.log"), "a");
  const child = spawn(binary, args, {
    cwd,
    // Vite không tự tắt khi stdin đóng do launcher chạy nền; chỉ áp dụng cho frontend.
    env: name === "frontend" ? { ...env, CI: "true" } : env,
    // Tách Vite khỏi console của launcher để frontend tiếp tục chạy khi lệnh kết thúc.
    // CMD/Maven vẫn dùng cùng phiên console để backend không thoát im lặng.
    detached: name === "frontend",
    windowsHide: true,
    stdio: ["ignore", out, err],
    windowsVerbatimArguments,
  });
  child.unref();
  child.on("error", (error) => {
    child.startupError = Error(
      "Không khởi động được " + name + ": " + error.message,
    );
  });
  fs.closeSync(out);
  fs.closeSync(err);
  return child;
}
if (!(await listening(1433)))
  throw Error(
    "SQL Server chưa nghe cổng 1433. Hãy bật SQL Server local trước.",
  );
if (!(await listening(8080))) {
  // Maven wrapper có sẵn chạy qua CMD; không dùng file .ps1 bị ExecutionPolicy chặn.
  // Không sửa wrapper, source/config backend hoặc chính sách bảo mật Windows.
  const child = start(
    process.env.ComSpec || "cmd.exe",
    [
      "/d",
      "/c",
      `"${path.join(backendRoot, "mvnw.cmd")}" spring-boot:run`,
    ],
    backendRoot,
    "backend",
    true,
  );
  await wait(8080, "backend", child);
}
if (!(await listening(5173))) {
  const child = start(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    root,
    "frontend",
  );
  await wait(5173, "frontend", child);
}
console.log("Frontend: http://127.0.0.1:5173");
console.log("Backend: http://127.0.0.1:8080 — dữ liệu SQL Server thật");
console.log(
  "Đăng nhập bằng tài khoản backend. Không có lối đăng nhập theo vai trò mẫu.",
);
