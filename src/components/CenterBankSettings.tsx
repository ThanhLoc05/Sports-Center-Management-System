import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bankAccountApi } from "../lib/bank-account-api";
import type { BankConfig } from "../lib/payment-qr";
import { validateBank } from "../lib/payment-qr";
import { banks } from "../lib/banks";
import { usePermissions } from "../lib/hooks";
import { errorText } from "../lib/utils";
import {
  Button,
  ErrorState,
  Field,
  Loading,
  Modal,
  Notice,
  Panel,
  useToast,
} from "./ui";

/** Màn cấu hình tài khoản nhận tiền thật dùng chung; chỉ báo đã lưu sau PUT thành công. */
export function CenterBankSettings() {
  const can = usePermissions();
  const toast = useToast();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["center-bank-account"],
    queryFn: bankAccountApi.get,
    retry: false,
  });
  const [review, setReview] = useState<BankConfig | "clear" | null>(null);
  const [reviewVersion, setReviewVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Panel className="panel-spaced"
      title="Tài khoản nhận tiền & QR"
      description="Tài khoản ngân hàng dùng chung cho toàn trung tâm."
    >
      <Notice>
        Đơn QR lưu tài khoản nhận tiền tại lúc tạo đơn. Đổi cấu hình chỉ áp dụng
        cho đơn mới; tài khoản trên hóa đơn cũ được giữ nguyên.
      </Notice>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : !can("roles.manage") ? (
        <p>Chỉ quản lý được thay đổi tài khoản nhận tiền.</p>
      ) : (
        <BankForm
          key={q.data?.version}
          initial={q.data?.bankAccount}
          onReview={(value) => {
            setError("");
            setReviewVersion(q.data?.version ?? null);
            setReview(value);
          }}
        />
      )}
      {q.data?.bankAccount && can("roles.manage") && (
        <Button
          variant="secondary"
          onClick={() => {
            setError("");
            setReviewVersion(q.data?.version ?? null);
            setReview("clear");
          }}
        >
          Gỡ cấu hình dùng chung
        </Button>
      )}
      {review && (
        <Modal
          className="content-preview-dialog"
          title={
            review === "clear"
              ? "Gỡ tài khoản nhận tiền"
              : "Xác nhận tài khoản nhận tiền trung tâm"
          }
          onClose={() => setReview(null)}
          dismissible={!busy}
        >
          {review === "clear" ? (
            <Notice>
              Đơn QR mới sẽ chưa được tạo khi chưa có tài khoản nhận tiền. Đơn
              đã tạo giữ thông tin nhận tiền cũ.
            </Notice>
          ) : (
            <div className="detail-grid">
              <div>
                <span>Ngân hàng</span>
                <strong>{review.bankName}</strong>
              </div>
              <div>
                <span>Số tài khoản</span>
                <strong>{review.accountNo}</strong>
              </div>
              <div>
                <span>Chủ tài khoản</span>
                <strong>{review.accountName}</strong>
              </div>
            </div>
          )}
          {q.data?.version !== reviewVersion && (
            <Notice>
              Cấu hình đã thay đổi trên hệ thống. Quay lại để kiểm tra trước khi
              lưu tiếp.
            </Notice>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Quay lại
            </Button>
            <Button
              loading={busy}
              disabled={
                !!q.error ||
                q.isFetching ||
                !q.data ||
                q.data.version !== reviewVersion
              }
              onClick={async () => {
                if (
                  !q.data ||
                  busy ||
                  reviewVersion === null ||
                  q.data.version !== reviewVersion
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  const settings =
                    review === "clear"
                      ? await bankAccountApi.clear(reviewVersion)
                      : await bankAccountApi.save(review, reviewVersion);
                  client.setQueryData(["center-bank-account"], settings);
                  setReview(null);
                  toast(
                    review === "clear"
                      ? "Đã gỡ cấu hình nhận tiền dùng chung."
                      : "Đã lưu tài khoản nhận tiền cho toàn trung tâm.",
                  );
                } catch (e) {
                  setError(errorText(e));
                  void q.refetch();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {review === "clear"
                ? "Xác nhận gỡ cấu hình"
                : "Lưu cấu hình dùng chung"}
            </Button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/** Nhập → xem lại → gửi server. Tên gateway chỉ dùng khi kết nối dịch vụ nhận giao dịch ngân hàng. */
function BankForm({
  initial,
  onReview,
}: {
  initial?: BankConfig | null;
  onReview: (v: BankConfig) => void;
}) {
  const [bin, setBin] = useState(initial?.bankBin || "");
  const [gateway, setGateway] = useState(
    initial?.gatewayName || initial?.bankName || "",
  );
  const [error, setError] = useState("");
  return (
    <form
      className="form-fields"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const value = {
          bankBin: bin,
          bankName: banks.find((b) => b.bin === bin)?.shortName || "",
          accountNo: String(d.get("accountNo")).trim(),
          accountName: String(d.get("accountName")).trim(),
          gatewayName: gateway.trim(),
        };
        try {
          validateBank(value);
          onReview(value);
        } catch (e) {
          setError(errorText(e));
        }
      }}
    >
      <Field label="Tên ngân hàng">
        <select
          required
          value={bin}
          onChange={(e) => {
            setBin(e.target.value);
            setGateway(
              banks.find((b) => b.bin === e.target.value)?.shortName || "",
            );
          }}
        >
          <option value="">Chọn ngân hàng nhận tiền</option>
          {banks.map((b) => (
            <option key={b.bin} value={b.bin}>
              {b.shortName} — {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Số tài khoản nhận tiền">
        <input
          name="accountNo"
          required
          pattern="[0-9]{6,19}"
          defaultValue={initial?.accountNo || ""}
        />
      </Field>
      <Field label="Tên chủ tài khoản">
        <input
          name="accountName"
          required
          maxLength={100}
          defaultValue={initial?.accountName || ""}
        />
      </Field>
      <Field label="Tên ngân hàng trên dịch vụ đối soát">
        <input
          value={gateway}
          maxLength={100}
          onChange={(e) => setGateway(e.target.value)}
        />
        <small>
          Dùng đúng tên ngân hàng do dịch vụ giao dịch trả về. Chưa kết nối dịch
          vụ thì có thể giữ tên ngân hàng đã chọn.
        </small>
      </Field>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="submit">Xem lại cấu hình trung tâm</Button>
    </form>
  );
}
