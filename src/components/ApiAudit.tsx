import { useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, SearchInput } from "./ui";
interface Entry {
  id: number;
  createdAt: string;
  actor: string;
  action: string;
  detail: string;
}
/**
 * Chuẩn bị giao diện tra cứu nhật ký theo thời gian, nhóm thao tác và từ khóa.
 * Backend chưa cung cấp API nhật ký nên bảng rỗng; bộ lọc chưa truy vấn dữ liệu.
 * Không tự tạo lịch sử từ trình duyệt vì nhật ký chính thức phải do máy chủ lưu.
 */
export default function ApiAudit() {
  const [search, setSearch] = useState("");
  return (
    <>
      <PageHeader
        title="Nhật ký hoạt động"
        description="Tra cứu các thao tác quan trọng trên hệ thống."
      />
      <Notice>
        Đang chờ kết nối dữ liệu nhật ký từ backend. Chưa có lịch sử thao tác để
        tra cứu hoặc xuất.
      </Notice>
      <Panel className="panel-spaced" title="Lịch sử thao tác">
        <div className="form-grid">
          <Field label="Từ ngày">
            <input type="date" />
          </Field>
          <Field label="Đến ngày">
            <input type="date" />
          </Field>
          <Field label="Nhóm thao tác">
            <select defaultValue="all">
              <option value="all">Tất cả thao tác</option>
              <option>Thành viên & đội ngũ</option>
              <option>Lớp học & lịch</option>
              <option>Gói tập & thanh toán</option>
              <option>Vai trò tài khoản</option>
            </select>
          </Field>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Người thực hiện, thao tác, nội dung..."
        />
        <DataTable<Entry>
          rows={[]}
          columns={[
            { key: "date", label: "Thời gian", render: (e) => e.createdAt },
            { key: "actor", label: "Người thực hiện", render: (e) => e.actor },
            { key: "action", label: "Thao tác", render: (e) => e.action },
            { key: "detail", label: "Chi tiết", render: (e) => e.detail },
          ]}
        />
      </Panel>
    </>
  );
}
