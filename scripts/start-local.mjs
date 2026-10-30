/** Khởi động FE + backend hiện có để trình bày local. Không sửa source/schema backend. */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Backend mới nằm ở gốc cùng pom.xml; backend/ là bản cũ được lưu lại.
const backendRoot = fs.existsSync(path.join(root, "pom.xml"))
  ? root
  : path.join(root, "backend");
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
function start(binary, args, cwd, name) {
  const out = fs.openSync(path.join(local, name + ".stdout.log"), "a"),
    err = fs.openSync(path.join(local, name + ".stderr.log"), "a");
  const child = spawn(binary, args, {
    cwd,
    env,
    // Windows: chạy cùng phiên console để CMD/Maven không thoát im lặng.
    // stdio ghi ra file và unref giúp launcher kết thúc khi dịch vụ đã sẵn sàng.
    detached: false,
    windowsHide: true,
    stdio: ["ignore", out, err],
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
      "mvnw.cmd",
      `-Djava.version=${localJavaVersion()}`,
      "spring-boot:run",
    ],
    backendRoot,
    "backend",
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
function localJavaVersion() {
  // Ghi đè phiên bản cho lần chạy local, giữ nguyên pom.xml của nhóm backend.
  const value = env.LOCAL_JAVA_VERSION || "17";
  if (!/^\d+$/.test(value) || Number(value) < 17)
    throw Error("LOCAL_JAVA_VERSION phải là phiên bản Java từ 17 trở lên.");
  return value;
}
