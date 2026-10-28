import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Invoice } from "../lib/types";
import { useAuth } from "../lib/auth";
import {
  buildVietQr,
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
import { Button, Field, Notice, Panel, useToast } from "./ui";
export function BankSettings() {
  const can = usePermissions();
  const toast = useToast();
  const [config, setConfig] = useState(getBankConfig);
  useEffect(() => {
    const refresh = () => setConfig(getBankConfig());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  return (
    <Panel
      title="Tài khoản nhận tiền & QR"
      description="Nhập tài khoản ngân hàng trung tâm đang sử dụng. Mỗi hóa đơn tự điền số tiền và nội dung chuyển khoản."
    >
      <Notice>
        Cấu hình nhận tiền hiện lưu riêng trên trình duyệt này; backend chưa có
        API đồng bộ cấu hình ngân hàng/đối soát giao dịch.
      </Notice>
      {!can("roles.manage") ? (
        <p>Chỉ quản lý được thay đổi tài khoản nhận tiền.</p>
      ) : (
        <form
          key={config ? JSON.stringify(config) : "unconfigured"}
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
            <Button type="submit">Lưu cấu hình QR</Button>
            {config && (
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
    </Panel>
  );
}
/** Chỉ tạo QR cho hóa đơn đang chờ. Quét/báo chuyển khoản không tự đổi thành PAID. */
export function PaymentQr({
  invoice,
  bankAccount,
}: {
  invoice: Invoice;
  bankAccount?: BankConfig;
}) {
  const { session } = useAuth();
  const client = useQueryClient();
  const [localConfig, setConfig] = useState(getBankConfig);
  const config = bankAccount || localConfig;
  const [image, setImage] = useState("");
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
      import("qrcode")
        .then((q) =>
          q.toDataURL(
            config
              ? buildVietQr(
                  config,
                  invoice.amount,
                  invoice.id,
                  invoice.memberId,
                )
              : buildPreviewQr(invoice.amount, invoice.id, invoice.memberId),
            {
              width: 320,
              margin: 4,
              errorCorrectionLevel: "M",
            },
          ),
        )
        .then((data) => {
          if (current) setImage(data);
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
    config,
    invoice.id,
    invoice.amount,
    invoice.memberId,
    invoice.paymentStatus,
    invoice.paymentMethod,
  ]);
  if (
    invoice.paymentStatus !== "PENDING" ||
    invoice.paymentMethod !== "BANK_TRANSFER"
  )
    return null;
  return (
    <section className="payment-qr" aria-label="Thanh toán QR">
      <h3>Thanh toán bằng QR chuyển khoản</h3>
      {!config ? (
        <>
          <Notice>
            QR MINH HỌA — KHÔNG DÙNG ĐỂ CHUYỂN TIỀN. Quản lý vào Cài đặt → Tài
            khoản nhận tiền & QR để cấu hình ngân hàng sau.
          </Notice>
          <div className="qr-layout">
            {image ? (
              <img
                src={image}
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
                Mã thanh toán:{" "}
                <strong>
                  {transferReference(invoice.id, invoice.memberId)}
                </strong>
              </p>
              <p>
                Mã này chỉ chứa văn bản minh họa, không có số tài khoản và không
                thực hiện giao dịch ngân hàng.
              </p>
              <p>
                Hóa đơn vẫn chờ thanh toán. Nhân viên chỉ xác nhận đã thu sau
                khi kiểm tra thực tế.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="qr-layout">
            {image ? (
              <img
                src={image}
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
              <p>
                Nội dung:{" "}
                <strong>
                  {transferReference(invoice.id, invoice.memberId)}
                </strong>
              </p>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${config.bankName}\n${config.accountNo}\n${config.accountName}\n${invoice.amount}\n${transferReference(invoice.id, invoice.memberId)}`,
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
              {image && (
                <a
                  className="btn btn-secondary"
                  href={image}
                  download={`QR-HD${invoice.id}.png`}
                >
                  Tải QR
                </a>
              )}
            </div>
          </div>
          <Notice>
            {session!.mode === "demo" ? "Hóa đơn demo. " : ""}Hóa đơn vẫn chờ
            thu cho đến khi nhân viên kiểm tra đã nhận tiền. Hệ thống chưa tự
            đối soát ngân hàng.
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
