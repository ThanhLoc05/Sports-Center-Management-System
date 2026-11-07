/** Chọn PowerShell đã cho phép chạy script; không đổi ExecutionPolicy của Windows. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hint = path.join(root, ".local", "ngrok-powershell.txt");
const candidates = [
  ...new Set(
    [
      fs.existsSync(hint)
        ? fs
            .readFileSync(hint, "utf8")
            .replace(/^\uFEFF/, "")
            .trim()
        : "",
      "pwsh.exe",
      "powershell.exe",
    ].filter(Boolean),
  ),
];
let shell;
for (const binary of candidates) {
  const check = spawnSync(
    binary,
    ["-NoProfile", "-NonInteractive", "-Command", "Get-ExecutionPolicy"],
    { encoding: "utf8", windowsHide: true },
  );
  if (
    !check.error &&
    check.status === 0 &&
    ["RemoteSigned", "Unrestricted"].includes(check.stdout.trim())
  ) {
    shell = binary;
    break;
  }
}
if (!shell) {
  console.error(
    "Chưa tìm thấy PowerShell cho phép chạy script local. Mở PowerShell 7 rồi chạy scripts/setup-sepay-ngrok.ps1; không cần gửi khóa vào chat.",
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    shell,
    [
      "-NoProfile",
      "-File",
      path.join(root, "scripts", "setup-sepay-ngrok.ps1"),
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) console.error("Không mở được cửa sổ nhập cấu hình ngrok.");
  process.exitCode = result.status ?? 1;
}
