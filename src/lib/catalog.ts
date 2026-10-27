/** Tên bộ môn/phòng được đọc API thật; demo chỉ dùng trong phiên demo. */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { useDemoData } from "./hooks";
import { api } from "./api";
export function useCatalog() {
  const { session } = useAuth(),
    db = useDemoData(),
    demo = session?.mode === "demo";
  const sportsQuery = useQuery({
    queryKey: ["sports"],
    queryFn: api.sports,
    enabled: !!session && !demo,
  });
  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: api.rooms,
    enabled: !!session && !demo,
  });
  const sportsRows = demo ? db?.sports || [] : sportsQuery.data || [];
  const roomRows = demo ? db?.rooms || [] : roomsQuery.data || [];
  return {
    sports: Object.fromEntries(sportsRows.map((s) => [s.id, s.name])) as Record<
      number,
      string
    >,
    rooms: Object.fromEntries(roomRows.map((r) => [r.id, r.name])) as Record<
      number,
      string
    >,
    roomRows,
    loading: !demo && (sportsQuery.isPending || roomsQuery.isPending),
    error: !demo ? sportsQuery.error || roomsQuery.error : null,
    retry: () => {
      void sportsQuery.refetch();
      void roomsQuery.refetch();
    },
  };
}
