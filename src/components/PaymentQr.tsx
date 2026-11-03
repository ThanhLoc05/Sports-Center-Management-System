import { useEffect, useState } from "react";
import { CenterBankSettings } from "./CenterBankSettings";
import { bankAccountApi } from "../lib/bank-account-api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePaymentMember } from "../lib/use-payment-member";
import type { Invoice } from "../lib/types";
import { useAuth } from "../lib/auth";
import {
  buildVietQr,
  transferContent,
  buildPreviewQr,
  clearBankConfig,
  getBankConfig,
  saveBankConfig,
  transferReference,
} from "../lib/payment-qr";
import type { BankConfig } from "../lib/payment-qr";
import { reportTransfer } from "../lib/center";
import { usePermissions } from "../lib/hooks";
import { money } from "../lib/utils";
import { banks } from "../lib/banks";
import { Button, Field, Modal, Notice, Panel, useToast } from "./ui";
/** API thật dùng cấu hình chung trong SQL; cấu hình local chỉ giữ cho kiểm thử dữ liệu mẫu. */
export function BankSettings() {
  const { session } = useAuth();
  return session?.mode === "api" ? (
    <CenterBankSettings />
  ) : (
    <LocalBankSettings />
  );
}
function LocalBankSettings() {
  const can = usePermissions();
  const toast = useToast();
  const [config, setConfig] = useState(getBankConfig);
  const [scope, setScope] = useState("local");
  const [review, setReview] = useState<BankConfig | null>(null);
  useEffect(() => {
    const refresh = () => setConfig(getBankConfig());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  return (
    <Panel className="panel-spaced"
      title="Tài khoản nhận tiền & QR"
      description="Nhập tài khoản ngân hàng trung tâm đang sử dụng. Mỗi hóa đơn tự điền số tiền và nội dung chuyển khoản."
    >
      <Notice>
        Cấu hình này chỉ dùng trên trình duyệt hiện tại, chưa được đồng bộ cho
        các máy khác. Khi đơn có tài khoản nhận tiền từ hệ thống, QR ưu tiên
        thông tin của đơn.
      </Notice>
      <p className="muted">
        Trạng thái dùng chung: đang chờ kết nối cấu hình ngân hàng từ backend.
      </p>
      {!can("roles.manage") ? (
        <p>Chỉ quản lý được thay đổi tài khoản nhận tiền.</p>
      ) : (
        <form
          key={scope + (config ? JSON.stringify(config) : "unconfigured")}
          className="form-fields"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const d = new FormData(e.currentTarget);
              const value: BankConfig = {
                bankBin: String(d.get("bankBin")).trim(),
                bankName:
                  banks.find((bank) => bank.bin === d.get("bankBin"))
                    ?.shortName || "",
                accountNo: String(d.get("accountNo")).trim(),
                accountName: String(d.get("accountName")).trim(),
              };
              if (scope === "center") {
                setReview(value);
                return;
              }
              saveBankConfig(value);
              setConfig(value);
              toast("Đã lưu tài khoản nhận tiền trên trình duyệt.");
            } catch (error) {
              toast(
                error instanceof Error
                  ? error.message
                  : "Không lưu được cấu hình.",
                "error",
              );
            }
          }}
        >
          <Field label="Phạm vi cấu hình ngân hàng">
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="local">Dùng trên trình duyệt này</option>
              <option value="center">Dùng chung toàn trung tâm</option>
            </select>
          </Field>
          {scope === "center" && (
            <Notice>
              Cấu hình dùng chung đang chờ API lưu từ backend. Bạn có thể nhập
              và xem lại; dữ liệu ngân hàng hiện tại chưa thay đổi.
            </Notice>
          )}
          <div className="form-grid">
            <Field label="Tên ngân hàng">
              <select
                name="bankBin"
                required
                defaultValue={config?.bankBin || ""}
              >
                <option value="">Chọn ngân hàng trung tâm đang sử dụng</option>
                {banks.map((bank) => (
                  <option key={bank.bin} value={bank.bin}>
                    {bank.shortName} — {bank.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số tài khoản nhận tiền">
              <input
                name="accountNo"
                inputMode="numeric"
                required
                pattern="[0-9]{6,19}"
                defaultValue={config?.accountNo}
              />
            </Field>
            <Field label="Tên chủ tài khoản">
              <input
                name="accountName"
                required
                maxLength={100}
                defaultValue={config?.accountName}
              />
            </Field>
          </div>
          <div className="row-actions">
            <Button type="submit">
              {scope === "center"
                ? "Xem lại cấu hình trung tâm"
                : "Lưu cấu hình QR"}
            </Button>
            {config && scope === "local" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  clearBankConfig();
                  setConfig(null);
                  toast("Đã gỡ tài khoản nhận tiền trên trình duyệt.");
                }}
              >
                Gỡ cấu hình QR
              </Button>
            )}
          </div>
        </form>
      )}
      {review && (
        <Modal
          className="content-preview-dialog"
          title="Xem lại tài khoản nhận tiền trung tâm"
          onClose={() => setReview(null)}
        >
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
          <Notice>
            Chưa lưu. Chức năng đồng bộ tài khoản nhận tiền toàn trung tâm đang
            chờ kết nối backend.
          </Notice>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setReview(null)}>
              Quay lại chỉnh sửa
            </Button>
            <Button disabled>Lưu cấu hình dùng chung</Button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
/** Chỉ tạo QR cho hóa đơn đang chờ. Quét/báo chuyển khoản không tự đổi thành PAID. */
export function PaymentQr({
  invoice,
  bankAccount,
  memberName,
}: {
  invoice: Invoice;
  bankAccount?: BankConfig;
  memberName?: string;
}) {
  const { session } = useAuth();
  const client = useQueryClient();
  const [localConfig, setConfig] = useState(getBankConfig);
  // Hóa đơn thuộc đơn gia hạn bắt buộc dùng tài khoản chụp trong đơn, không lấy nhầm cấu hình máy/global đã đổi.
  const sharedBank = useQuery({
    queryKey: ["center-bank-account"],
    queryFn: bankAccountApi.get,
    retry: false,
    enabled:
      session?.mode === "api" &&
      !invoice.membershipOrderId &&
      invoice.paymentMethod === "BANK_TRANSFER" &&
      !bankAccount,
  });
  const config =
    bankAccount ||
    (session?.mode === "demo"
      ? localConfig
      : !invoice.membershipOrderId
        ? sharedBank.data?.bankAccount
        : null);
  const member = usePaymentMember(invoice.memberId, memberName);
  let content = transferReference(invoice.id, invoice.memberId);
  let contentError = "";
  if (member.name) {
    try {
      content = transferContent(invoice.id, invoice.memberId, member.name);
    } catch (e) {
      contentError =
        e instanceof Error
          ? e.message
          : "Không tạo được nội dung chuyển khoản.";
    }
  } else if (config)
    contentError =
      "Đang chờ đúng tên thành viên để tạo QR. Không dùng tên người thu ngân.";
  const qrKey = JSON.stringify([
    invoice.id,
    invoice.memberId,
    invoice.amount,
    invoice.paymentStatus,
    invoice.paymentMethod,
    config,
    member.name,
  ]);
  const [imageKey, setImageKey] = useState("");
  const [image, setImage] = useState("");
  const visibleImage = imageKey === qrKey ? image : "";
  const [error, setError] = useState("");
  const [reported, setReported] = useState(!!invoice.transferReportedAt);
  const toast = useToast();
  useEffect(() => {
    const refresh = () => setConfig(getBankConfig());
    window.addEventListener("sportiva:bank-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("sportiva:bank-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  // Đổi hóa đơn hoặc lễ tân đã xác nhận thì bỏ trạng thái báo giao dịch của phiếu trước.
  useEffect(
    () => setReported(!!invoice.transferReportedAt),
    [invoice.id, invoice.transferReportedAt],
  );
  useEffect(() => {
    let current = true;
    setImage("");
    setError("");
    if (
      invoice.paymentStatus === "PENDING" &&
      invoice.paymentMethod === "BANK_TRANSFER"
    ) {
      if (contentError) {
        setError(contentError);
        return;
      }
      import("qrcode")
        .then((q) =>
          q.toDataURL(
            config
              ? buildVietQr(
                  config,
                  invoice.amount,
                  invoice.id,
                  invoice.memberId,
                  member.name,
                )
              : buildPreviewQr(
                  invoice.amount,
                  invoice.id,
                  invoice.memberId,
                  member.name,
                ),
            {
              width: 320,
              margin: 4,
              errorCorrectionLevel: "M",
            },
          ),
        )
        .then((data) => {
          if (current) {
            setImage(data);
            setImageKey(qrKey);
          }
        })
        .catch((e) => {
          if (current)
            setError(e instanceof Error ? e.message : "Không tạo được QR.");
        });
    }
    return () => {
      current = false;
    };
  }, [
    qrKey,
    config,
    invoice.id,
    invoice.amount,
    invoice.memberId,
    invoice.paymentStatus,
    invoice.paymentMethod,
    member.name,
    contentError,
  ]);
  if (
    invoice.paymentStatus !== "PENDING" ||
    invoice.paymentMethod !== "BANK_TRANSFER"
  )
    return null;
  return (
    <section className="payment-qr status-unpaid" aria-label="Thanh toán QR">
      <h3>Thanh toán bằng QR chuyển khoản</h3>
      <p>
        Thành viên:{" "}
        <strong>{member.name || "Chưa lấy được tên thành viên"}</strong> · TV
        {invoice.memberId}
      </p>
      {member.error && (
        <Notice>
          Không tải được tên thành viên.{" "}
          <Button variant="ghost" onClick={() => void member.refetch()}>
            Tải lại thông tin thành viên
          </Button>
        </Notice>
      )}
      {member.name && (
        <p>
          Nội dung QR: <strong>{content}</strong>. Tên được chuyển không dấu và
          có thể rút gọn; mã thanh toán giữ nguyên.
        </p>
      )}
      {!config ? (
        <>
          <Notice>
            QR MINH HỌA — KHÔNG DÙNG ĐỂ CHUYỂN TIỀN. Đơn chưa có tài khoản nhận
            tiền hợp lệ từ hệ thống; vui lòng liên hệ lễ tân trước khi chuyển
            khoản.
          </Notice>
          <div className="qr-layout">
            {visibleImage ? (
              <img
                src={visibleImage}
                width={260}
                height={260}
                alt={"QR minh họa hóa đơn " + invoice.id}
              />
            ) : (
              <p>{error || "Đang tạo QR minh họa..."}</p>
            )}
            <div className="qr-details">
              <strong>{money(invoice.amount)}</strong>
              <p>
                Hóa đơn: HD{invoice.id} · Thành viên: TV{invoice.memberId}
              </p>
              <p>
                Mã thanh toán: <strong>{content}</strong>
              </p>
              <p>
                Mã này chỉ chứa văn bản minh họa, không có số tài khoản và không
                thực hiện giao dịch ngân hàng.
              </p>
              <p>
                Hóa đơn vẫn chờ thanh toán. QR minh họa không gửi giao dịch đến
                ngân hàng hoặc tự xác nhận thu tiền.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="qr-layout">
            {visibleImage ? (
              <img
                src={visibleImage}
                width={260}
                height={260}
                alt={`QR chuyển khoản hóa đơn ${invoice.id}`}
              />
            ) : (
              <p>{error || "Đang tạo QR..."}</p>
            )}
            <div className="qr-details">
              <strong>{money(invoice.amount)}</strong>
              <p>
                {config.bankName} · {config.bankBin}
              </p>
              <p>
                Số tài khoản: <strong>{config.accountNo}</strong>
              </p>
              <p>Chủ tài khoản: {config.accountName}</p>
              <p className="muted">
                {bankAccount
                  ? "Tài khoản nhận tiền được lưu theo đơn này"
                  : session?.mode === "api"
                    ? "Tài khoản nhận tiền dùng chung của trung tâm"
                    : "Tài khoản cấu hình trên trình duyệt này"}
              </p>
              <p>
                Nội dung: <strong>{content}</strong>
              </p>
              <Button
                variant="secondary"
                disabled={!!contentError}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${config.bankName}\n${config.accountNo}\n${config.accountName}\n${invoice.amount}\n${content}`,
                    );
                    toast("Đã sao chép thông tin chuyển khoản.");
                  } catch {
                    toast(
                      "Không truy cập được clipboard. Bạn có thể chép thông tin hiển thị.",
                      "error",
                    );
                  }
                }}
              >
                Sao chép thông tin
              </Button>
              {visibleImage && (
                <a
                  className="btn btn-secondary"
                  href={visibleImage}
                  download={`QR-HD${invoice.id}.png`}
                >
                  Tải QR
                </a>
              )}
            </div>
          </div>
          <Notice>
            {session!.mode === "demo" ? "Hóa đơn demo. " : ""}Hóa đơn vẫn chờ
            thu cho đến khi hệ thống xác nhận đã nhận đủ tiền. Quét QR không tự
            hoàn tất đơn hoặc gia hạn gói.
          </Notice>
          {reported && (
            <p className="muted">
              Thành viên đã báo chuyển khoản; đang chờ lễ tân đối chiếu giao
              dịch.
            </p>
          )}
          {session!.user.id === invoice.memberId &&
            session!.mode === "demo" && (
              <Button
                disabled={reported}
                onClick={() => {
                  try {
                    reportTransfer(invoice.id);
                    setReported(true);
                    void client.invalidateQueries({ queryKey: ["invoices"] });
                    toast(
                      "Đã báo lễ tân kiểm tra giao dịch; hóa đơn chưa chuyển sang đã thu.",
                    );
                  } catch (e) {
                    toast(
                      e instanceof Error
                        ? e.message
                        : "Không gửi được thông báo.",
                      "error",
                    );
                  }
                }}
              >
                {reported
                  ? "Đã báo giao dịch · chờ đối chiếu"
                  : "Tôi đã chuyển khoản · báo lễ tân"}
              </Button>
            )}
        </>
      )}
    </section>
  );
}
