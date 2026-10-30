import ApiAudit from "../components/ApiAudit";
/**
 * Phiên API dùng ApiAudit: giao diện tra cứu đang chờ nguồn nhật ký từ backend.
 * LegacyAudit giữ dữ liệu mẫu cho kiểm thử, không dùng làm nhật ký chính thức.
 */
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { readDemo } from "../lib/demo";
import { dateLabel, downloadCsv, matches, timeLabel } from "../lib/utils";
import {
  Avatar,
  DataTable,
  DemoOnly,
  ExportButton,
  PageHeader,
  Panel,
  SearchInput,
} from "../components/ui";
export default function Audit() {
  const { session } = useAuth();
  return session?.mode === "api" ? <ApiAudit /> : <LegacyAudit />;
}
function LegacyAudit() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [search, setSearch] = useState("");
  /**
   * Tìm trong actor/action/detail của nhật ký demo. API mode không tự coi
   * log trên trình duyệt là nhật ký thao tác chính thức của server.
   */
  const rows = (demo ? readDemo().audit : []).filter((a) =>
    matches(search, a.actor, a.action, a.detail),
  );
  return (
    <>
      <PageHeader
        eyebrow="CLARITY BUILDS TRUST"
        title="Nhật ký hoạt động"
        description="Theo dõi những thao tác quan trọng trong không gian vận hành."
        actions={
          <ExportButton
            onClick={() =>
              downloadCsv("nhat-ky-demo.csv", [
                ["Thời gian", "Người thực hiện", "Thao tác", "Chi tiết"],
                ...rows.map((a) => [a.createdAt, a.actor, a.action, a.detail]),
              ])
            }
          />
        }
      />
      <DemoOnly>
        {demo
          ? "Nhật ký này chỉ ghi thao tác demo trên trình duyệt. Không phải audit log máy chủ và có thể bị thay đổi/xóa bằng công cụ trình duyệt."
          : "Backend chưa có endpoint audit log. Không suy diễn lịch sử máy chủ từ các thao tác trên frontend."}
      </DemoOnly>
      <Panel
        title="Lịch sử thao tác"
        action={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm người dùng, thao tác..."
          />
        }
      >
        <DataTable
          rows={rows}
          columns={[
            {
              key: "time",
              label: "Thời gian",
              render: (a) => (
                <div className="contact-cell">
                  <strong>{timeLabel(a.createdAt)}</strong>
                  <small>{dateLabel(a.createdAt)}</small>
                </div>
              ),
            },
            {
              key: "actor",
              label: "Người thực hiện",
              render: (a) => (
                <div className="person-cell">
                  <Avatar name={a.actor} size="small" />
                  <strong>{a.actor}</strong>
                </div>
              ),
            },
            {
              key: "action",
              label: "Thao tác",
              render: (a) => (
                <span className="audit-action">
                  <ShieldCheck size={15} />
                  {a.action}
                </span>
              ),
            },
            { key: "detail", label: "Chi tiết", render: (a) => a.detail },
          ]}
        />
      </Panel>
    </>
  );
}
