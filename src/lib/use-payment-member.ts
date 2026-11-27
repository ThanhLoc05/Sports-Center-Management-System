// [VAI TRÒ] Hook chọn thành viên trên trang Thanh toán (Lễ tân) / lấy chính mình (Member).
/**
 * Lấy đúng danh tính chủ hóa đơn để hiển thị và điền nội dung QR.
 * Ưu tiên thông tin gắn với đơn, tiếp theo là phiên chính chủ, cuối cùng GET /users/:id.
 * Không dùng tài khoản lễ tân đang đăng nhập làm tên người mua; không lưu thông tin này vào localStorage.
 */
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";

export function usePaymentMember(
  memberId?: number,
  name?: string,
  email?: string,
) {
  const { session } = useAuth();
  const self =
    session && session.user.id === memberId ? session.user : undefined;
  const knownName = name?.trim() || self?.fullName;
  const knownEmail = email?.trim() || self?.email;
  // Chỉ chủ đơn hoặc nhân viên được phép tra tên; kiểm tra này hỗ trợ UI, BE vẫn kiểm tra quyền API.
  const allowed =
    !!self ||
    ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"].includes(
      session?.user.roleName || "",
    );
  const query = useQuery({
    queryKey: ["payment-member", memberId],
    queryFn: async () => {
      // [API] api.user → GET /users/{id}
      const user = await api.user(memberId!);
      if (
        user.id !== memberId ||
        !user.fullName?.trim() ||
        user.roleName !== "MEMBER"
      )
        throw new ApiError(
          "Chưa lấy được đúng thông tin thành viên của hóa đơn.",
        );
      return user;
    },
    // Chỉ gọi API dự phòng khi snapshot/phiên chính chủ chưa có tên, tránh tải thêm không cần thiết.
    enabled: !!memberId && allowed && !knownName,
    retry: false,
    staleTime: 60_000,
  });
  return {
    name: knownName || query.data?.fullName,
    email: knownEmail || query.data?.email,
    loading: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
