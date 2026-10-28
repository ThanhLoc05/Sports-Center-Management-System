/** Báo cáo thành viên và booking; chỉ thống kê dữ liệu thực sự tải được. */
import { useQuery } from "@tanstack/react-query";
import { useDemoData, useClasses, useUsers } from "../lib/hooks";
import { api } from "../lib/api";
import { dateLabel, downloadCsv } from "../lib/utils";
import { Panel, Notice, DataTable, Button } from "./ui";
export function OperationsReport({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const db = useDemoData();
  const classes = useClasses();
  const users = useUsers();
  const classRows = (classes.data || []).filter(
    (c) =>
      c.scheduleTime.slice(0, 10) >= start &&
      c.scheduleTime.slice(0, 10) <= end,
  );
  const query = useQuery({
    queryKey: ["class-booking-report", classRows.map((c) => c.id)],
    queryFn: async () => {
      const batches = await Promise.all(
        classRows.map((c) => api.bookings(undefined, c.id)),
      );
      return batches.flat();
    },
    enabled: !db && classRows.length > 0,
  });
  const bookings = db?.bookings || query.data || [];
  const inPeriod = bookings.filter(
    (b) => b.bookedAt.slice(0, 10) >= start && b.bookedAt.slice(0, 10) <= end,
  );
  const newMembers = (users.data || []).filter(
    (u) =>
      u.roleName === "MEMBER" &&
      u.createdAt &&
      u.createdAt.slice(0, 10) >= start &&
      u.createdAt.slice(0, 10) <= end,
  );
  const rows = classRows.map((c) => ({
    ...c,
    booked: bookings.filter((b) => b.classId === c.id && b.status === "BOOKED")
      .length,
    cancelled: bookings.filter(
      (b) => b.classId === c.id && b.status === "CANCELLED",
    ).length,
  }));
  return (
    <Panel
      title="Thành viên & tình trạng đăng ký lớp"
      description={`Theo khoảng ${dateLabel(start)} – ${dateLabel(end)}`}
    >
      <div className="mini-stats">
        <div>
          <p>Thành viên có ngày tạo trong kỳ</p>
          <strong>{newMembers.length}</strong>
        </div>
        <div>
          <p>Lượt đăng ký ghi nhận trong kỳ</p>
          <strong>{inPeriod.length}</strong>
        </div>
        <div>
          <p>Lượt đang BOOKED của các lớp</p>
          <strong>{rows.reduce((a, c) => a + c.booked, 0)}</strong>
        </div>
      </div>
      {users.data?.some((u) => u.roleName === "MEMBER" && !u.createdAt) && (
        <Notice>
          Một số tài khoản chưa có ngày tạo từ API/dữ liệu cũ, không được tính
          vào số thành viên mới theo kỳ.
        </Notice>
      )}
      {query.error && (
        <Notice>
          Không tải được đầy đủ booking theo lớp. Vui lòng thử lại trước khi
          xuất báo cáo.
        </Notice>
      )}
      <DataTable
        rows={rows}
        columns={[
          { key: "name", label: "Lớp", render: (c) => c.className },
          {
            key: "booked",
            label: "Đang đăng ký",
            render: (c) => `${c.booked}/${c.maxCapacity}`,
          },
          { key: "cancel", label: "Đã hủy", render: (c) => c.cancelled },
          {
            key: "rate",
            label: "Tỷ lệ lấp đầy",
            render: (c) => `${Math.round((c.booked / c.maxCapacity) * 100)}%`,
          },
        ]}
      />
      <Button
        variant="secondary"
        disabled={
          !!query.error || (!db && query.isPending && classRows.length > 0)
        }
        onClick={() =>
          downloadCsv("bao-cao-dang-ky-lop.csv", [
            ["Lớp", "BOOKED", "CANCELLED", "Sức chứa"],
            ...rows.map((c) => [
              c.className,
              c.booked,
              c.cancelled,
              c.maxCapacity,
            ]),
          ])
        }
      >
        Xuất báo cáo lớp
      </Button>
    </Panel>
  );
}
