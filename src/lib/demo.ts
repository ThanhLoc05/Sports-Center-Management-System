/** Adapter chỉ cho bộ test. Ứng dụng thật không được sinh/đọc tài khoản hay dữ liệu mẫu. */
import type { DemoDatabase, Role, Session } from "./types";
import * as fixture from "../test/fixtures/demo-fixture";
export function seedDatabase(): DemoDatabase {
  if (import.meta.env.MODE === "test") return fixture.seedDatabase();
  throw new Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function readDemo(): DemoDatabase {
  if (import.meta.env.MODE === "test") return fixture.readDemo();
  throw new Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function saveDemo(db: DemoDatabase): void {
  if (import.meta.env.MODE === "test") return fixture.saveDemo(db);
  throw new Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function resetDemo(): DemoDatabase {
  if (import.meta.env.MODE === "test") return fixture.resetDemo();
  throw new Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function demoSession(role: Role): Session {
  if (import.meta.env.MODE === "test") return fixture.demoSession(role);
  throw new Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function demoAudit(
  db: DemoDatabase,
  action: string,
  detail: string,
): void {
  if (import.meta.env.MODE === "test")
    return fixture.demoAudit(db, action, detail);
  throw new Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
