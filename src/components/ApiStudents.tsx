import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAssignedStudents } from "../lib/use-coach-data";
import { operations } from "../lib/operations-api";
import { matches } from "../lib/utils";
import {
  Button,
  DataTable,
  ErrorState,
  Loading,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
} from "./ui";
/**
 * Tra cứu học viên trong phạm vi được giao; tìm kiếm trên danh sách đã tải.
 * Khi mở chi tiết mới gọi API hồ sơ để xem mục tiêu và thông tin cá nhân.
 */
export default function ApiStudents() {
  const q = useAssignedStudents();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <PageHeader
        title="Học viên phụ trách"
        description="Danh sách và mục tiêu lấy từ các lớp bạn được giao."
      />
      <Panel>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm học viên, email, mục tiêu..."
        />
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={q.refetch} />
        ) : (
          <DataTable
            rows={q.data
              .filter((s) =>
                matches(search, s.fullName, s.email, s.phone, s.fitnessGoals),
              )
              .map((s) => ({ ...s, id: s.memberId }))}
            columns={[
              {
                key: "name",
                label: "Học viên",
                render: (s) => (
                  <Button
                    variant="ghost"
                    onClick={() => setSelected(s.memberId)}
                  >
                    {s.fullName}
                  </Button>
                ),
              },
              { key: "email", label: "Email", render: (s) => s.email },
              { key: "phone", label: "Điện thoại", render: (s) => s.phone },
              {
                key: "goals",
                label: "Mục tiêu",
                render: (s) => s.fitnessGoals || "Chưa cung cấp",
              },
            ]}
          />
        )}
      </Panel>
      {selected && (
        <StudentProfile id={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
export function StudentProfile({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["member-profile", id],
    queryFn: () => operations.profile(id),
  });
  return (
    <Modal title="Mục tiêu và thông tin học viên" onClose={onClose}>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <div className="detail-grid">
          <div>
            <span>Ngày sinh</span>
            <strong>{q.data?.dob || "Chưa cung cấp"}</strong>
          </div>
          <div>
            <span>Giới tính</span>
            <strong>{q.data?.gender || "Chưa cung cấp"}</strong>
          </div>
          <div>
            <span>Địa chỉ</span>
            <strong>{q.data?.address || "Chưa cung cấp"}</strong>
          </div>
          <div>
            <span>Mục tiêu</span>
            <strong>{q.data?.fitnessGoals || "Chưa cung cấp"}</strong>
          </div>
        </div>
      )}
    </Modal>
  );
}
