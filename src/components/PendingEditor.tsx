import { useState } from "react";
import { Button, Field, Modal, Notice } from "./ui";
interface InputField {
  name: string;
  label: string;
  value: string | number;
  type?: "text" | "number" | "email" | "textarea";
  options?: { value: string; label: string }[];
}
/**
 * Dùng cho các form chỉnh sửa chưa có API: nhập thay đổi → xem lại → quay lại sửa.
 * Dữ liệu chỉ nằm trong state, không ghi localStorage hoặc giả thông báo đã lưu.
 * Nút lưu vô hiệu hóa để người dùng biết thông tin trong hệ thống chưa thay đổi.
 */
export function PendingEditor({
  title,
  fields,
  onClose,
}: {
  title: string;
  fields: InputField[];
  onClose: () => void;
}) {
  const [review, setReview] = useState<Record<string, string> | null>(null);
  return (
    <Modal title={review ? "Xem lại thay đổi" : title} onClose={onClose}>
      <Notice>
        Chức năng lưu thay đổi đang chờ kết nối backend. Thông tin gốc trong hệ
        thống chưa thay đổi.
      </Notice>
      {review ? (
        <>
          <div className="detail-grid">
            {fields.map((f) => (
              <div key={f.name}>
                <span>{f.label}</span>
                <strong>
                  {f.options?.find((o) => o.value === review[f.name])?.label ||
                    review[f.name] ||
                    "—"}
                </strong>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setReview(null)}>
              Quay lại chỉnh sửa
            </Button>
            <Button disabled>Lưu thay đổi</Button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setReview(
              Object.fromEntries(
                [...new FormData(e.currentTarget)].map(([k, v]) => [
                  k,
                  String(v),
                ]),
              ),
            );
          }}
        >
          {fields.map((f) => (
            <Field key={f.name} label={f.label}>
              {f.options ? (
                <select name={f.name} defaultValue={f.value}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea name={f.name} defaultValue={f.value} />
              ) : (
                <input
                  name={f.name}
                  type={f.type || "text"}
                  defaultValue={f.value}
                  required
                  min={f.type === "number" ? 1 : undefined}
                />
              )}
            </Field>
          ))}
          <div className="modal-footer">
            <Button type="button" variant="secondary" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit">Xem lại thay đổi</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
