/** Chỉ đổi vai trò tài khoản. Quyền của từng vai trò là bảng cố định trong permissions.ts. */
import { ApiError, getSession, request } from "./api";
import { can } from "./permissions";
import { readDemo } from "./demo";
import { saveRole } from "./center";
import type { Role, User } from "./types";
export const assignableRoles = [
  "CENTER_MANAGER",
  "COACH",
  "RECEPTIONIST",
  "MEMBER",
] as const;
export async function assignTeamRole(
  userId: number,
  roleName: Role,
): Promise<User> {
  const session = getSession();
  if (
    !session ||
    !can(
      session,
      "roles.manage",
      session.mode === "demo" ? readDemo() : undefined,
    )
  )
    throw new ApiError("Chỉ quản lý trung tâm được phân vai trò.", 403);
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    !assignableRoles.includes(roleName as (typeof assignableRoles)[number])
  )
    throw new ApiError("Tài khoản hoặc vai trò không hợp lệ.");
  if (session.user.id === userId)
    throw new ApiError(
      "Không tự thay đổi vai trò tài khoản đang đăng nhập.",
      403,
    );
  // Nhánh fixture chỉ chạy trong test; ứng dụng API không lưu vai trò giả vào trình duyệt.
  if (session.mode === "demo") {
    saveRole(userId, roleName);
    return readDemo().users.find((u) => u.id === userId)!;
  }
  try {
    // Endpoint đã có trong backend mới trên main. Backend local cũ có thể chưa hỗ trợ.
    const updated = await request<User>(
      `/users/${userId}/role?roleName=${encodeURIComponent(roleName)}`,
      { method: "PATCH" },
    );
    if (
      !updated ||
      updated.id !== userId ||
      updated.roleName !== roleName ||
      !updated.fullName ||
      !updated.email ||
      !updated.status
    )
      throw new ApiError("Phản hồi đổi vai trò không khớp tài khoản đã chọn.");
    return updated;
  } catch (error) {
    if (error instanceof ApiError && [404, 405, 501].includes(error.status))
      throw new ApiError(
        "Máy chủ hiện chưa hỗ trợ cập nhật vai trò. Vai trò chưa được thay đổi.",
        error.status,
      );
    throw error;
  }
}
