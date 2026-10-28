import type { DemoDatabase } from "./types";
import { dateTimeLocal } from "./utils";
/** Tách bản ghi theo người nhận để thông báo không lộ giữa các tài khoản. */
export function notify(
  db: DemoDatabase,
  recipients: number[],
  title: string,
  content: string,
  link: string,
  senderId = 0,
  kind = "GENERAL",
) {
  db.notifications ||= [];
  for (const recipientId of new Set(recipients)) {
    if (!db.users.some((u) => u.id === recipientId)) continue;
    db.notifications.unshift({
      id: Math.max(0, ...db.notifications.map((n) => n.id)) + 1,
      recipientId,
      senderId,
      title,
      content,
      link,
      kind,
      createdAt: dateTimeLocal(),
    });
  }
}
