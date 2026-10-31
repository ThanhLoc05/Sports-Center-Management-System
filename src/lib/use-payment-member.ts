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
  const allowed =
    !!self ||
    ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"].includes(
      session?.user.roleName || "",
    );
  const query = useQuery({
    queryKey: ["payment-member", memberId],
    queryFn: async () => {
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
