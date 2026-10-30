import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { demoSession } from "../lib/demo";
import { getBankConfig, saveBankConfig } from "../lib/payment-qr";
import { BankSettings } from "../components/PaymentQr";
import { ToastProvider } from "../components/ui";

it("removing bank configuration also clears visible account fields", async () => {
  const user = userEvent.setup();
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify(demoSession("CENTER_MANAGER")),
  );
  saveBankConfig({
    bankBin: "970422",
    bankName: "MBBank",
    accountNo: "0000000000",
    accountName: "TEST KHONG CHUYEN TIEN",
  });
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <BankSettings />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("Số tài khoản nhận tiền")).toHaveValue(
    "0000000000",
  );
  await user.click(screen.getByRole("button", { name: "Gỡ cấu hình QR" }));
  expect(getBankConfig()).toBeNull();
  expect(screen.getByLabelText("Số tài khoản nhận tiền")).toHaveValue("");
  expect(screen.getByLabelText("Tên chủ tài khoản")).toHaveValue("");
  expect(screen.getByLabelText("Tên ngân hàng")).toHaveValue("");
  client.clear();
});
