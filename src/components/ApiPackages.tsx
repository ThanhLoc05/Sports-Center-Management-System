import { PendingEditor } from "./PendingEditor";
import type { MembershipPackage } from "../lib/types";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { operations } from "../lib/operations-api";
import { money } from "../lib/utils";
import type { PackageInput } from "../lib/operations-api";
import {
  Button,
  Badge,
  DataTable,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Notice,
  PageHeader,
  Panel,
  useToast,
} from "./ui";
/**
 * Quản lý xem và tạo gói với học phí, thời hạn, cấp STANDARD/VIP từ backend.
 * Sau khi tạo thành công, tải lại cache danh mục để hiển thị dữ liệu vừa lưu.
 * Sửa gói chỉ cho xem lại bằng PendingEditor vì backend chưa có API cập nhật.
 */
export default function ApiPackages() {
  const q = useQuery({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
  });
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<MembershipPackage | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Danh mục gói tập"
        description="Học phí, thời hạn và cấp truy cập STANDARD/VIP."
        actions={<Button onClick={() => setCreate(true)}>Thêm gói tập</Button>}
      />
      <Panel>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={q.refetch} />
        ) : !q.data?.length ? (
          <Empty
            title="Chưa có gói tập"
            description="Thêm gói tập đầu tiên để mở đăng ký."
          />
        ) : (
          <DataTable
            rows={q.data || []}
            columns={[
              { key: "name", label: "Gói", render: (p) => p.packageName },
              { key: "price", label: "Học phí", render: (p) => money(p.price) },
              {
                key: "duration",
                label: "Thời hạn",
                render: (p) => p.durationDays + " ngày",
              },
              {
                key: "level",
                label: "Cấp gói",
                render: (p) => p.accessLevel || "Chưa xác định",
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (p) => <Badge status={p.status} />,
              },
              {
                key: "description",
                label: "Mô tả",
                render: (p) => p.description || "—",
              },
              {
                key: "action",
                label: "Thao tác",
                render: (p) => (
                  <Button variant="ghost" onClick={() => setEdit(p)}>
                    Chỉnh sửa gói
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Notice>
        Backend hỗ trợ xem và tạo gói. Chưa có API thay đổi học phí/thời hạn
        hoặc ngừng bán gói đã tạo; không ghi đè quyền lợi của kỳ đã mua.
      </Notice>
      {edit && (
        <PendingEditor
          title="Chỉnh sửa gói tập"
          onClose={() => setEdit(null)}
          fields={[
            { name: "packageName", label: "Tên gói", value: edit.packageName },
            {
              name: "price",
              label: "Học phí (VND)",
              type: "number",
              value: edit.price,
            },
            {
              name: "durationDays",
              label: "Thời hạn (ngày)",
              type: "number",
              value: edit.durationDays,
            },
            {
              name: "description",
              label: "Mô tả",
              type: "textarea",
              value: edit.description || "",
            },
            {
              name: "accessLevel",
              label: "Cấp gói",
              value: edit.accessLevel || "STANDARD",
              options: [
                { value: "STANDARD", label: "STANDARD" },
                { value: "VIP", label: "VIP" },
              ],
            },
            {
              name: "status",
              label: "Trạng thái bán",
              value: edit.status,
              options: [
                { value: "ACTIVE", label: "Đang bán" },
                { value: "INACTIVE", label: "Ngừng bán" },
              ],
            },
          ]}
        />
      )}
      {create && (
        <FormModal
          title="Thêm gói tập"
          onClose={() => setCreate(false)}
          onSubmit={async (d) => {
            await operations.createPackage({
              packageName: String(d.get("packageName")).trim(),
              durationDays: Number(d.get("durationDays")),
              price: Number(d.get("price")),
              accessLevel: String(
                d.get("accessLevel"),
              ) as PackageInput["accessLevel"],
              description: String(d.get("description")).trim(),
              status: String(d.get("status")) as PackageInput["status"],
            });
            await client.invalidateQueries({
              queryKey: ["membershipPackages"],
            });
            await client.invalidateQueries({
              queryKey: ["membership-packages"],
            });
            toast("Đã tạo gói tập.");
          }}
        >
          <Field label="Tên gói">
            <input name="packageName" required maxLength={150} />
          </Field>
          <Field label="Học phí (VND)">
            <input name="price" type="number" min={1} step={1} required />
          </Field>
          <Field label="Thời hạn (ngày)">
            <input
              name="durationDays"
              type="number"
              min={1}
              step={1}
              required
            />
          </Field>
          <Field label="Cấp gói">
            <select name="accessLevel">
              <option>STANDARD</option>
              <option>VIP</option>
            </select>
          </Field>
          <Field label="Mô tả">
            <textarea name="description" maxLength={2000} />
          </Field>
          <Field label="Trạng thái">
            <select name="status">
              <option value="ACTIVE">Đang bán</option>
              <option value="INACTIVE">Ngừng bán</option>
            </select>
          </Field>
        </FormModal>
      )}
    </>
  );
}
