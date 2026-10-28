import type { DemoDatabase, Session } from "./types";
import { coachMembers } from "./entitlements";
import { can } from "./permissions";
/** Mô phỏng có ngữ cảnh; không được gọi là kết quả từ mô hình AI. */
export function workoutSuggestion(
  db: DemoDatabase,
  session: Session,
  memberId: number,
  goal: string,
  level: string,
  duration: number,
) {
  const user = db.users.find(
    (u) => u.id === memberId && u.roleName === "MEMBER",
  );
  if (
    !user ||
    (session.user.roleName === "MEMBER"
      ? memberId !== session.user.id
      : !can(session, "training.manage", db))
  )
    throw new Error("Không có quyền xem ngữ cảnh học viên này.");
  if (
    session.user.roleName === "COACH" &&
    !coachMembers(db, session.user.id).some((u) => u.id === memberId)
  )
    throw new Error("Học viên không thuộc phạm vi phụ trách.");
  if (![20, 30, 45].includes(duration) || !goal.trim() || !level.trim())
    throw new Error("Kiểm tra mục tiêu, trình độ và thời lượng.");
  const history = db.logs
    .filter((l) => l.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rounds = level === "Mới bắt đầu" || history.length < 2 ? 2 : 3;
  const exercises =
    goal === "Cải thiện linh hoạt"
      ? [
          "Cat-cow · 8 lần",
          "Bird-dog · 8 lần mỗi bên",
          "Giãn cơ hông · 30 giây mỗi bên",
        ]
      : goal === "Tăng sức mạnh"
        ? [
            "Squat trọng lượng cơ thể · 8–12 lần",
            "Chống đẩy tường · 8–12 lần",
            "Glute bridge · 12 lần",
          ]
        : [
            "Đi bộ nhanh tại chỗ · 3 phút",
            "Step touch · 2 phút",
            "Squat nhẹ · 8 lần",
          ];
  return `MẪU THEO QUY TẮC DEMO — CHƯA GỌI MÔ HÌNH AI\nHọc viên: ${user.fullName}\nMục tiêu hồ sơ: ${user.fitnessGoals || "Chưa cập nhật"}\nMục tiêu buổi tập: ${goal} · Trình độ: ${level}\nLịch sử: ${history.length} kết quả đã ghi${history[0] ? `; gần nhất: ${history[0].result}` : ""}\n\nDự kiến khoảng ${duration} phút; điều chỉnh cùng HLV.\nKhởi động nhẹ · 5 phút\n${exercises.map((e) => `${e} × ${rounds} hiệp`).join("\n")}\nGiãn cơ và thả lỏng · 5 phút\nHLV xem lại kỹ thuật và nhận xét buổi trước trước khi áp dụng.`;
}
