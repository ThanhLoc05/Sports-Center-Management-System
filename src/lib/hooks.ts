// [VAI TRÒ] Hook dùng chung: tải danh sách người dùng, lớp học... cho các trang Lễ tân/Member.
/**
 * CÁC HOOK ĐỌC/GHI DỮ LIỆU DÙNG LẠI GIỮA NHIỀU TRANG.
 * useQuery dành cho tải dữ liệu; useMutation dành cho thao tác thay đổi dữ liệu.
 * queryKey định danh cache; enabled quyết định khi nào một query được phép chạy.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import { isManager } from "./types";
import { useSyncExternalStore } from "react";
import { readDemo } from "./demo";
import { can } from "./permissions";
import type { Permission } from "./permissions";
import { useToast } from "../components/ui";
import { errorText } from "./utils";
function subscribeDemo(listener: () => void) {
  window.addEventListener("sportiva:demo-changed", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("sportiva:demo-changed", listener);
    window.removeEventListener("storage", listener);
  };
}
/** Snapshot chuỗi ổn định giúp menu/quyền/thông báo cập nhật ngay khi dữ liệu demo đổi. */
export function useDemoData() {
  const { session } = useAuth();
  useSyncExternalStore(
    subscribeDemo,
    () =>
      session?.mode === "demo"
        ? localStorage.getItem("sportiva-demo-v1") ||
          localStorage.getItem("sportiva-auth-demo-v1") ||
          ""
        : "",
    () => "",
  );
  return session?.mode === "demo" ? readDemo() : null;
}
/** Các trang gọi can("payments.collect")/can("reports.read") để quyết định nút và phần nội dung được hiển thị. */
export function usePermissions() {
  const { session } = useAuth();
  const db = useDemoData();
  return (permission: Permission) => can(session, permission, db || undefined);
}
/**
 * Chỉ màn tra cứu thành viên bật danh sách cho lễ tân; các màn khác giữ quyền tải cũ.
 */
export function useUsers(allowReceptionist = false) {
  const { session } = useAuth();
  return useQuery({
    // Dùng chung cache danh sách người dùng để tìm tên trên hóa đơn và đếm Member ở báo cáo.
    queryKey: ["users"],
    // [API] api.users → GET /users
    queryFn: api.users,
    enabled:
      !!session &&
      (session.mode === "demo" || isManager(session.user.roleName) ||
        (allowReceptionist && session.user.roleName === "RECEPTIONIST")),
  });
}
/**
 * HLV gửi coachId của chính mình để tải lịch phụ trách; vai trò khác không
 * thêm bộ lọc đó. coachId cũng nằm trong queryKey để không dùng nhầm cache.
 */
export function useClasses({ enabled = true, ...options }: {
  refetchOnMount?: boolean | "always";
  enabled?: boolean;
} = {}) {
  const { session } = useAuth();
  // Khi Quản lý mở báo cáo, coachId để trống nên danh sách lớp không bị giới hạn theo một HLV.
  const coachId =
    session?.user.roleName === "COACH" ? session.user.id : undefined;
  return useQuery({
    queryKey: ["classes", coachId],
    // [API] api.classes → GET /classes/my-classes | /classes…
    queryFn: () => api.classes(coachId),
    enabled: !!session && enabled,
    ...options,
  });
}
/**
 * Bọc một thao tác ghi để dùng chung cách báo thành công/thất bại.
 * Chỉ sau khi Promise thành công mới đánh dấu cache cũ bằng invalidateQueries;
 * các query đang hiển thị sẽ được lấy lại để bảng và thống kê cập nhật.
 */
export function useAction<T>(
  fn: (value: T) => Promise<unknown> | unknown,
  success = "Đã lưu thay đổi.",
) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (value: T) => fn(value),
    onSuccess: () => {
      void client.invalidateQueries();
      toast(success);
    },
    onError: (e) => toast(errorText(e), "error"),
  });
}
