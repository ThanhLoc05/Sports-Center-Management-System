/** Ghi hồ sơ demo; không giả lập thành công khi thiếu API cập nhật. */
import type { User } from "./types";
import { ApiError, getSession, updateDemo } from "./api";
import { readDemo } from "./demo";
import { can, defaultPermissions } from "./permissions";
import type { Permission } from "./permissions";
import { dateTimeLocal } from "./utils";
export function requireDemoPermission(permission: Permission) {
  const session = getSession();
  if (!session || session.mode !== "demo")
    throw new ApiError(
      "Backend chưa có API cho thao tác này. Thay đổi chưa được lưu.",
    );
  const user = readDemo().users.find((u) => u.id === session.user.id);
  if (
    !user ||
    user.status !== "ACTIVE" ||
    !can({ ...session, user }, permission, readDemo())
  )
    throw new ApiError("Bạn không có quyền thực hiện thao tác này.", 403);
  return user;
}
export function saveUser(input: Omit<User, "id">, id?: number) {
  const actor = getSession();
  const self = id === actor?.user.id;
  if (!self)
    requireDemoPermission(
      input.roleName === "MEMBER" ? "members.update" : "team.manage",
    );
  return updateDemo(
    id ? "Cập nhật hồ sơ" : "Tạo nhân viên",
    input.fullName,
    (db) => {
      if (
        !actor ||
        !input.fullName.trim() ||
        !/^\S+@\S+\.\S+$/.test(input.email) ||
        !/^[+0-9 ()-]{9,20}$/.test(input.phone)
      )
        throw new ApiError("Kiểm tra họ tên, email và số điện thoại.");
      if (
        db.users.some(
          (u) =>
            u.id !== id &&
            (u.email.toLowerCase() === input.email.toLowerCase() ||
              u.phone === input.phone),
        )
      )
        throw new ApiError("Email hoặc số điện thoại đã được sử dụng.");
      const old = db.users.find((u) => u.id === id);
      if (!defaultPermissions[input.roleName])
        throw new ApiError("Vai trò không hợp lệ.");
      if (
        !old &&
        ["CENTER_MANAGER", "MANAGER"].includes(input.roleName) &&
        !can(actor, "roles.manage", db)
      )
        throw new ApiError("Không có quyền tạo quản lý.", 403);
      if (
        old &&
        ["CENTER_MANAGER", "MANAGER"].includes(old.roleName) &&
        input.status !== "ACTIVE" &&
        db.users.filter(
          (u) =>
            ["CENTER_MANAGER", "MANAGER"].includes(u.roleName) &&
            u.status === "ACTIVE",
        ).length <= 1
      )
        throw new ApiError("Không thể khóa quản lý cuối cùng.");
      if (
        self &&
        old &&
        (input.roleName !== old.roleName || input.status !== old.status)
      )
        throw new ApiError(
          "Không tự thay đổi vai trò hoặc trạng thái bản thân.",
          403,
        );
      const user = {
        ...input,
        roleName: old?.roleName || input.roleName,
        createdAt: old?.createdAt || dateTimeLocal(),
        id: id || Math.max(0, ...db.users.map((u) => u.id)) + 1,
      };
      if (id) db.users = db.users.map((u) => (u.id === id ? user : u));
      else db.users.push(user);
      return user;
    },
  );
}
