/**
 * Dùng chung danh sách học viên cho màn học viên phụ trách, tập luyện và AI.
 * useClasses đã lọc coachId của HLV; chỉ tải danh sách học viên từ các lớp đó.
 * Quản lý dùng danh sách tài khoản có quyền đọc; useUsers không gọi API cho HLV.
 */
import { useQuery } from "@tanstack/react-query";
import { useClasses, useUsers } from "./hooks";
import { useAuth } from "./auth";
import { operations } from "./operations-api";
import type { ClassStudent } from "./operations-api";
export function useAssignedStudents() {
  const { session } = useAuth();
  const classes = useClasses();
  const users = useUsers();
  const own = session?.user.roleName === "COACH";
  const query = useQuery({
    queryKey: [
      "assigned-students",
      session?.user.id,
      classes.data?.map((c) => c.id),
    ],
    queryFn: async () => {
      const batches = await Promise.all(
        (classes.data || []).map((c) => operations.students(c.id)),
      );
      // Một học viên có thể học nhiều lớp: gộp theo memberId và bỏ lượt đã hủy.
      const map = new Map<number, ClassStudent>();
      for (const s of batches.flat())
        if (s.bookingStatus === "BOOKED") map.set(s.memberId, s);
      return [...map.values()];
    },
    enabled: session?.mode === "api" && own && !!classes.data,
  });
  const data = own
    ? query.data
    : (users.data || [])
        .filter((u) => u.roleName === "MEMBER")
        .map(
          (u) =>
            ({
              memberId: u.id,
              fullName: u.fullName,
              email: u.email,
              phone: u.phone,
              bookingStatus: "BOOKED",
              bookedAt: "",
            }) as ClassStudent,
        );
  return {
    data: data || [],
    isPending: own ? classes.isPending || query.isPending : users.isPending,
    error: own ? classes.error || query.error : users.error,
    refetch: () => {
      void classes.refetch();
      void users.refetch();
      void query.refetch();
    },
  };
}
