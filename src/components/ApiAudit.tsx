import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "../lib/audit-api";
import type { AuditLogQuery } from "../lib/audit-api";
import { dateLabel, errorText, timeLabel } from "../lib/utils";
import {
  Button,
  DataTable,
  ErrorState,
  Field,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
} from "./ui";

const entityLabels: Record<string, string> = {
  USER: "Tài khoản",
  USER_PROFILE: "Hồ sơ tài khoản",
  CLASS: "Lớp học",
  BOOKING: "Đăng ký lớp",
  ATTENDANCE: "Điểm danh",
  MEMBERSHIP: "Gói hội viên",
  MEMBERSHIP_PACKAGE: "Danh mục gói",
  MEMBERSHIP_ORDER: "Đơn gói tập",
  INVOICE: "Hóa đơn / thanh toán",
  SPORT: "Bộ môn",
  ROOM: "Phòng tập",
  SUPPORT_TICKET: "Yêu cầu hỗ trợ",
  WORKOUT_PLAN: "Kế hoạch tập",
  WORKOUT_LOG: "Nhật ký tập luyện",
  FEEDBACK: "Đánh giá",
};

const actionLabels: Record<string, string> = {
  CREATE: "Tạo mới",
  UPDATE: "Cập nhật",
  DELETE: "Xóa",
  CANCEL: "Hủy",
  CONFIRM_PAYMENT: "Xác nhận thanh toán",
  PAYMENT: "Thanh toán",
  REFUND: "Hoàn tiền",
  RESOLVE: "Xử lý hỗ trợ",
  RENEW: "Gia hạn",
  STATUS_CHANGE: "Đổi trạng thái",
  ROLE_CHANGE: "Đổi vai trò",
};

function downloadCsvFile(content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "audit-logs.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ApiAudit() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entityType, setEntityType] = useState("");
  const [filters, setFilters] = useState<AuditLogQuery>({
    page: 0,
    size: 25,
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const query = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => auditApi.list(filters),
    retry: false,
  });

  async function exportCsv() {
    setExporting(true);
    setExportError("");
    try {
      downloadCsvFile(await auditApi.export(filters));
    } catch (error) {
      setExportError(errorText(error));
    } finally {
      setExporting(false);
    }
  }

  const entries = query.data?.content || [];
  const page = query.data?.page || 0;
  const totalPages = query.data?.totalPages || 0;

  return (
    <>
      <PageHeader
        title="Nhật ký hoạt động"
        description="Theo dõi các thao tác thay đổi dữ liệu đã được máy chủ xử lý thành công."
        actions={
          <Button
            variant="secondary"
            disabled={exporting || !query.data?.totalElements}
            loading={exporting}
            onClick={() => void exportCsv()}
          >
            Xuất CSV
          </Button>
        }
      />
      <Notice>
        Nhật ký lưu người thao tác, loại thao tác, dữ liệu liên quan, thời gian
        và IP. Không lưu mật khẩu hoặc nội dung request nhạy cảm. Sự kiện chỉ
        bắt đầu được ghi sau khi áp dụng migration audit log và khởi động lại
        backend.
      </Notice>
      {exportError && <Notice tone="warning">{exportError}</Notice>}
      <Panel className="panel-spaced" title="Lịch sử thao tác">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({
              keyword: search.trim() || undefined,
              from: from || undefined,
              to: to || undefined,
              entityType: entityType || undefined,
              page: 0,
              size: 25,
            });
          }}
        >
          <Field label="Từ ngày">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="Đến ngày">
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field label="Nhóm thao tác">
            <select
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              <option value="">Tất cả thao tác</option>
              {Object.entries(entityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Người thực hiện, thao tác, nội dung..."
          />
          <Button type="submit">Lọc nhật ký</Button>
        </form>

        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable
              rows={entries}
              label="Nhật ký hoạt động"
              columns={[
                {
                  key: "time",
                  label: "Thời gian",
                  render: (entry) => (
                    <div className="contact-cell">
                      <strong>{timeLabel(entry.createdAt)}</strong>
                      <small>{dateLabel(entry.createdAt)}</small>
                    </div>
                  ),
                },
                {
                  key: "actor",
                  label: "Người thực hiện",
                  render: (entry) => (
                    <div className="contact-cell">
                      <strong>{entry.actorName || entry.actorEmail}</strong>
                      <small>{entry.actorEmail}</small>
                    </div>
                  ),
                },
                {
                  key: "action",
                  label: "Thao tác",
                  render: (entry) => actionLabels[entry.action] || entry.action,
                },
                {
                  key: "entity",
                  label: "Dữ liệu liên quan",
                  render: (entry) => (
                    <div className="contact-cell">
                      <strong>
                        {entityLabels[entry.entityType] || entry.entityType}
                        {entry.entityId ? ` #${entry.entityId}` : ""}
                      </strong>
                      <small>{entry.details}</small>
                    </div>
                  ),
                },
                {
                  key: "ip",
                  label: "IP",
                  render: (entry) => entry.ipAddress || "—",
                },
              ]}
            />
            <div className="table-footer">
              <span>
                Trang {totalPages ? page + 1 : 0}/{totalPages} ·{" "}
                <strong>{query.data?.totalElements || 0}</strong> sự kiện
              </span>
              <div className="pagination">
                <Button
                  variant="secondary"
                  disabled={page <= 0}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      page: Math.max(0, (current.page || 0) - 1),
                    }))
                  }
                >
                  Trước
                </Button>
                <Button
                  variant="secondary"
                  disabled={!totalPages || page + 1 >= totalPages}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      page: (current.page || 0) + 1,
                    }))
                  }
                >
                  Tiếp
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
