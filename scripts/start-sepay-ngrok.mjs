/** Chạy tunnel ngrok cố định cho webhook; chỉ công khai proxy 8091, không mở API quản trị. */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWebhookProxy, WEBHOOK_PATH } from "./sepay-webhook-proxy.mjs";

export function ngrokOrigin(value) {
  if (typeof value !== "string" || !value.trim() || /[\s\\]/.test(value.trim()))
    throw Error("Domain ngrok không hợp lệ.");
  let url;
  try {
    url = new URL(
      value.includes("://") ? value.trim() : `https://${value.trim()}`,
    );
  } catch {
    throw Error("Domain ngrok không hợp lệ.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ngrok(?:-free)?\.(?:dev|app)$/.test(
      url.hostname,
    )
  )
    throw Error(
      "Dùng domain HTTPS được cấp trong dashboard ngrok, không kèm đường dẫn.",
    );
  return url.origin;
}

export function ngrokArguments(origin, config) {
  return [
    "http",
    "http://127.0.0.1:8091",
    "--url",
    ngrokOrigin(origin),
    "--config",
    config,
    "--inspect=false",
    "--log=stdout",
    "--log-format=json",
    "--log-level=info",
  ];
}

// Chỉ lấy sự kiện sẵn sàng/mã lỗi; không in toàn bộ log có thể chứa thông tin tài khoản.
export function ngrokEvent(line, expectedOrigin) {
  const codes = [...new Set(line.match(/ERR_NGROK_\d+/g) || [])];
  let ready = false;
  try {
    const event = JSON.parse(line);
    ready =
      event?.msg === "started tunnel" &&
      ngrokOrigin(event.url) === ngrokOrigin(expectedOrigin);
  } catch {
    /* Dòng log khác không quyết định tunnel đã sẵn sàng. */
  }
  return { ready, codes };
}

const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.setTimeout(1000);
    let done = false;
    const finish = (value) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(value);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });

export async function startSepayNgrok() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const configFolder = path.join(root, ".local", "ngrok");
  const agentConfig = path.join(configFolder, "agent.yml");
  const settingsFile = path.join(configFolder, "settings.json");
  const binary = path.join(root, ".local", "bin", "ngrok.exe");
  if (!fs.existsSync(binary))
    throw Error("Chưa cài ngrok tại .local/bin/ngrok.exe.");
  if (!fs.existsSync(agentConfig) || !fs.existsSync(settingsFile))
    throw Error(
      "Chưa cấu hình ngrok. Chạy npm run setup:sepay và nhập Authtoken trên máy.",
    );
  let origin;
  try {
    origin = ngrokOrigin(
      JSON.parse(fs.readFileSync(settingsFile, "utf8").replace(/^\uFEFF/, ""))
        .origin,
    );
  } catch {
    throw Error("Domain đã lưu không hợp lệ. Chạy lại npm run setup:sepay.");
  }
  // Dùng đúng file riêng của dự án; không để biến NGROK_* khác đổi tài khoản hay cấu hình tunnel.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.toUpperCase().startsWith("NGROK_"),
    ),
  );
  const check = spawnSync(
    binary,
    ["config", "check", "--config", agentConfig],
    { env, windowsHide: true, encoding: "utf8" },
  );
  if (check.error || check.status !== 0)
    throw Error("Cấu hình ngrok chưa hợp lệ. Chạy lại npm run setup:sepay.");
  if (!(await listening(8080)))
    throw Error(
      "Backend chưa chạy. Mở terminal khác và chạy npm run start:local trước.",
    );
  const proxy = createWebhookProxy();
  // Không dùng lại cổng đang bận: tránh tunnel trỏ nhầm một dịch vụ khác trên 8091.
  await new Promise((resolve, reject) => {
    proxy.once("error", () =>
      reject(
        Error("Cổng 8091 đang được dùng; hãy dừng proxy webhook cũ trước."),
      ),
    );
    proxy.listen(8091, "127.0.0.1", resolve);
  });
  console.log("Đang mở ngrok tới proxy webhook 127.0.0.1:8091...");
  const child = spawn(binary, ngrokArguments(origin, agentConfig), {
    env,
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false,
    stopping = false;
  const readers = [child.stdout, child.stderr].map((stream) =>
    createInterface({ input: stream }),
  );
  let timeout;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill();
    proxy.close();
    readers.forEach((reader) => reader.close());
  };
  const onSignal = () => {
    console.log("Đã dừng tunnel và proxy webhook. Backend/SQL vẫn giữ nguyên.");
    stop();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  timeout = setTimeout(() => {
    console.error(
      "Ngrok chưa kết nối sau 30 giây. Kiểm tra mạng, domain và Authtoken.",
    );
    process.exitCode = 1;
    stop();
  }, 30000);
  for (const reader of readers)
    reader.on("line", (line) => {
      const event = ngrokEvent(line, origin);
      if (event.codes.length)
        console.error(
          `Ngrok: ${event.codes.join(", ")}. Kiểm tra tài khoản/domain trong dashboard.`,
        );
      if (event.ready && !ready && !stopping) {
        ready = true;
        clearTimeout(timeout);
        const webhook = origin + WEBHOOK_PATH;
        fs.writeFileSync(
          path.join(configFolder, "webhook-url.txt"),
          webhook + "\n",
        );
        console.log(`Webhook cố định: ${webhook}`);
        console.log(
          "Giữ cửa sổ này mở khi demo. Nhấn Ctrl+C để dừng; lần chạy sau URL vẫn giữ nguyên.",
        );
      }
    });
  child.once("error", () => {
    console.error("Không khởi động được ngrok.");
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code) => {
    const wasStopping = stopping;
    stop();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (!wasStopping) {
      console.error(
        "Ngrok đã thoát. Kiểm tra mạng và tài khoản rồi chạy lại npm run start:sepay.",
      );
      process.exitCode = code || 1;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startSepayNgrok().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
