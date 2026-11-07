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
  Confirm,
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
 * Sửa gói gọi PUT /memberships/packages/{id} và tải lại danh mục sau khi lưu.
 */
export default function ApiPackages() {
  const q = useQuery({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
  });
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<MembershipPackage | null>(null);
  const [remove, setRemove] = useState<MembershipPackage | null>(null);
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
                  <div className="row-actions">
                    <Button variant="ghost" onClick={() => setEdit(p)}>
                      Chỉnh sửa gói
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={`Xóa gói ${p.packageName}`}
                      onClick={() => setRemove(p)}
                    >
                      Xóa
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Notice>
        Chỉ xóa được gói chưa có đơn hàng hoặc kỳ đăng ký liên quan. Gói đã có
        lịch sử cần được ngừng bán thay vì xóa.
      </Notice>
      {remove && (
        <Confirm
          title="Xóa gói tập?"
          description={`Xóa "${remove.packageName}" khỏi danh mục. Chỉ thực hiện được khi gói chưa có đơn hàng hoặc kỳ đăng ký liên quan; thao tác này không thể hoàn tác.`}
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await operations.deletePackage(remove.id);
            await client.invalidateQueries({
              queryKey: ["membershipPackages"],
            });
            await client.invalidateQueries({
              queryKey: ["membership-packages"],
            });
            setRemove(null);
            toast("Đã xóa gói tập.");
          }}
        />
      )}
      {edit && (
        <FormModal
          title="Chỉnh sửa gói tập"
          onClose={() => setEdit(null)}
          submitLabel="Lưu thay đổi"
          onSubmit={async (d) => {
            await operations.updatePackage(edit.id, {
              packageName: String(d.get("packageName")),
              price: Number(d.get("price")),
              durationDays: Number(d.get("durationDays")),
              accessLevel: String(d.get("accessLevel")) as PackageInput["accessLevel"],
              description: String(d.get("description")),
              status: String(d.get("status")) as PackageInput["status"],
            });
            await client.invalidateQueries({
              queryKey: ["membershipPackages"],
            });
            await client.invalidateQueries({
              queryKey: ["membership-packages"],
            });
            setEdit(null);
            toast("Đã cập nhật gói tập.");
          }}
        >
          <Field label="Tên gói">
            <input name="packageName" required maxLength={150} defaultValue={edit.packageName} />
          </Field>
          <Field label="Học phí (VND)">
            <input name="price" type="number" min={1} step={1} required defaultValue={edit.price} />
          </Field>
          <Field label="Thời hạn (ngày)">
            <input name="durationDays" type="number" min={1} step={1} required defaultValue={edit.durationDays} />
          </Field>
          <Field label="Cấp gói">
            <select name="accessLevel" required defaultValue={edit.accessLevel || "STANDARD"}>
              <option value="STANDARD">STANDARD</option>
              <option value="VIP">VIP</option>
            </select>
          </Field>
          <Field label="Mô tả">
            <textarea name="description" maxLength={255} defaultValue={edit.description || ""} />
          </Field>
          <Field label="Trạng thái bán">
            <select name="status" required defaultValue={edit.status}>
              <option value="ACTIVE">Đang bán</option>
              <option value="INACTIVE">Ngừng bán</option>
            </select>
          </Field>
        </FormModal>
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
            <textarea name="description" maxLength={255} />
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
