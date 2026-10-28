/** Fixture chỉ phục vụ kiểm thử; nhánh production được loại khỏi dữ liệu mẫu khi build. */
import type { DemoDatabase, Role, Session } from "./types";
import * as fixture from "../test/fixtures/demo-fixture";
export function readDemo(): DemoDatabase {
  if (import.meta.env.MODE === "test") return fixture.readDemo();
  throw Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function saveDemo(db: DemoDatabase) {
  if (import.meta.env.MODE === "test") return fixture.saveDemo(db);
  throw Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function demoSession(role: Role): Session {
  if (import.meta.env.MODE === "test") return fixture.demoSession(role);
  throw Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
export function demoAudit(db: DemoDatabase, action: string, detail: string) {
  if (import.meta.env.MODE === "test")
    return fixture.demoAudit(db, action, detail);
  throw Error("Dữ liệu mẫu đã bị tắt. Vui lòng sử dụng backend thật.");
}
