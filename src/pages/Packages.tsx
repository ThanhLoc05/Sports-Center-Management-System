/** Danh mục gói demo: thêm/sửa/ngừng bán, không xóa lịch sử. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDemoData } from "../lib/hooks";
import type { Package } from "../lib/types";
import { savePackage } from "../lib/center";
import { money } from "../lib/utils";
import {
  Badge,
  Button,
  DataTable,
  Field,
  FormModal,
  Notice,
  PageHeader,
  Panel,
  useToast,
} from "../components/ui";
export function PackagesPage() {
  const db = useDemoData();
  const [edit, setEdit] = useState<Package | true | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Danh mục gói tập"
        description="Quản lý học phí, thời hạn, bộ môn được học và hạn mức đăng ký lớp."
        actions={
          <Button disabled={!db} onClick={() => setEdit(true)}>
            Thêm gói tập
          </Button>
        }
      />
      {!db && (
        <Notice>
          Đang chờ API danh mục/quyền lợi gói. Không sử dụng giá hoặc quyền lợi
          demo cho dữ liệu thật.
        </Notice>
      )}
      <Panel>
        <DataTable
          rows={db?.packages || []}
          columns={[
            {
              key: "name",
              label: "Gói",
              render: (p) => <strong>{p.name}</strong>,
            },
            { key: "price", label: "Học phí", render: (p) => money(p.price) },
            {
              key: "days",
              label: "Thời hạn",
              render: (p) => `${p.durationDays} ngày`,
            },
            {
              key: "sports",
              label: "Bộ môn",
              render: (p) =>
                p.sportIds
                  ?.map((id) => db?.sports.find((s) => s.id === id)?.name)
                  .join(", ") || "Tất cả bộ môn",
            },
            {
              key: "limit",
              label: "Lượt lớp",
              render: (p) => p.classLimit || "Không giới hạn",
            },
            {
              key: "status",
              label: "Trạng thái",
              render: (p) => <Badge status={p.status || "ACTIVE"} />,
            },
            {
              key: "actions",
              label: "Thao tác",
              render: (p) => (
                <Button variant="ghost" onClick={() => setEdit(p)}>
                  Chỉnh sửa
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      {edit && db && (
        <FormModal
          title={edit === true ? "Thêm gói tập" : "Chỉnh sửa gói tập"}
          onClose={() => setEdit(null)}
          onSubmit={async (d) => {
            savePackage(
              {
                name: String(d.get("name")).trim(),
                description: String(d.get("description")),
                price: Number(d.get("price")),
                durationDays: Number(d.get("days")),
                features: String(d.get("features")).split("\n").filter(Boolean),
                sportIds: d.getAll("sportIds").map(Number),
                classLimit: d.get("classLimit")
                  ? Number(d.get("classLimit"))
                  : null,
                status: String(d.get("status")),
              },
              edit === true ? undefined : edit.id,
            );
            await client.invalidateQueries();
            toast("Đã lưu quyền lợi gói demo.");
          }}
        >
          <div className="form-grid">
            <Field label="Tên gói">
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={edit === true ? "" : edit.name}
              />
            </Field>
            <Field label="Học phí (VND)">
              <input
                type="number"
                name="price"
                min="1"
                step="1"
                required
                defaultValue={edit === true ? undefined : edit.price}
              />
            </Field>
            <Field label="Thời hạn (ngày)">
              <input
                type="number"
                name="days"
                min="1"
                max="3650"
                required
                defaultValue={edit === true ? 30 : edit.durationDays}
              />
            </Field>
            <Field
              label="Số lượt lớp trong kỳ"
              hint="Để trống nếu không giới hạn."
            >
              <input
                type="number"
                name="classLimit"
                min="1"
                defaultValue={
                  edit === true ? undefined : edit.classLimit || undefined
                }
              />
            </Field>
          </div>
          <Field label="Mô tả">
            <textarea
              name="description"
              required
              defaultValue={edit === true ? "" : edit.description}
            />
          </Field>
          <fieldset>
            <legend>Bộ môn thành viên được đăng ký</legend>
            <div className="permission-grid">
              {db.sports.map((s) => (
                <label className="check-option" key={s.id}>
                  <input
                    type="checkbox"
                    name="sportIds"
                    value={s.id}
                    defaultChecked={
                      edit !== true && (edit.sportIds?.includes(s.id) ?? true)
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Quyền lợi (mỗi dòng một mục)">
            <textarea
              name="features"
              required
              defaultValue={edit === true ? "" : edit.features.join("\n")}
            />
          </Field>
          <Field label="Trạng thái bán">
            <select
              name="status"
              defaultValue={edit === true ? "ACTIVE" : edit.status || "ACTIVE"}
            >
              <option value="ACTIVE">Đang bán</option>
              <option value="INACTIVE">Ngừng bán</option>
            </select>
          </Field>
          <Notice>
            Ngừng bán không xóa lịch sử/gói đã mua. Thay đổi quyền lợi áp dụng
            cho việc kiểm tra booking tiếp theo trong demo.
          </Notice>
        </FormModal>
      )}
    </>
  );
}
