import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { membershipCheckout } from "../lib/membership-checkout";
import { MembershipCheckoutPage } from "../components/MembershipCheckout";
import { ToastProvider } from "../components/ui";
import type { Role, User } from "../lib/types";

const members: User[] = [
  {
    id: 3,
    fullName: "Nguyễn Hải An",
    email: "an@example.test",
    roleName: "MEMBER",
    status: "ACTIVE",
  },
  {
    id: 13,
    fullName: "Lê Bình",
    email: "binh@example.test",
    roleName: "MEMBER",
    status: "INACTIVE",
  },
];
function setup(role: Role = "RECEPTIONIST") {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-only",
      user: {
        id: 99,
        fullName: "Nhân viên TEST",
        email: "staff@example.test",
        roleName: role,
        status: "ACTIVE",
      },
    }),
  );
  const users = vi
    .spyOn(api, "users")
    .mockResolvedValue([
      ...members,
      { ...members[0], id: 50, fullName: "Huấn luyện viên", roleName: "COACH" },
    ]);
  const subscriptions = vi.spyOn(api, "subscriptions").mockResolvedValue([]);
  vi.spyOn(membershipCheckout, "packages").mockResolvedValue([
    {
      id: 1,
      name: "Gói TEST",
      price: 800000,
      durationDays: 30,
      status: "ACTIVE",
    },
  ]);
  vi.spyOn(membershipCheckout, "list").mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <MembershipCheckoutPage />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { users, subscriptions };
}

describe("Lễ tân chọn thành viên xem gói", () => {
  it("hiển thị tất cả thành viên, gồm tài khoản ngừng hoạt động và loại các vai trò khác", async () => {
    const { users, subscriptions } = setup();
    expect(await screen.findByText("Nguyễn Hải An")).toBeVisible();
    expect(screen.getByText("Lê Bình")).toBeVisible();
    expect(screen.queryByText("Huấn luyện viên")).not.toBeInTheDocument();
    expect(users).toHaveBeenCalled();
    expect(subscriptions).not.toHaveBeenCalled();
  });
  it("Enter tìm đúng ID, Xem tất cả khôi phục toàn bộ danh sách", async () => {
    setup();
    await screen.findByText("Lê Bình");
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Tìm thành viên xem gói"),
      "3{Enter}",
    );
    expect(screen.getByText("Nguyễn Hải An")).toBeVisible();
    expect(screen.queryByText("Lê Bình")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xem tất cả" }));
    expect(screen.getByText("Lê Bình")).toBeVisible();
  });
  it("nút tìm hỗ trợ tên không dấu, mã TV và trạng thái không có kết quả", async () => {
    setup();
    await screen.findByText("Lê Bình");
    const user = userEvent.setup();
    const search = screen.getByLabelText("Tìm thành viên xem gói");
    await user.type(search, "le binh");
    await user.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(screen.queryByText("Nguyễn Hải An")).not.toBeInTheDocument();
    expect(screen.getByText("Lê Bình")).toBeVisible();
    await user.clear(search);
    await user.type(search, "TV0003{Enter}");
    expect(screen.getByText("Nguyễn Hải An")).toBeVisible();
    await user.clear(search);
    await user.type(search, "9999{Enter}");
    expect(screen.queryByText("Nguyễn Hải An")).not.toBeInTheDocument();
    expect(screen.queryByText("Lê Bình")).not.toBeInTheDocument();
  });
  it("chọn Xem gói mới tải đúng lịch sử và cho thao tác đăng ký", async () => {
    const { subscriptions } = setup();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Xem gói của Nguyễn Hải An, TV0003",
      }),
    );
    await waitFor(() => expect(subscriptions).toHaveBeenCalledWith(3));
    expect(
      await screen.findByRole("button", { name: "Đăng ký gói tập" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Đăng ký gói tập" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Thành viên")).toHaveValue("3");
  });
  it("member xem gói của chính mình và không có danh sách thành viên khác", async () => {
    const { users, subscriptions } = setup("MEMBER");
    await waitFor(() => expect(subscriptions).toHaveBeenCalledWith(99));
    expect(users).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Tìm thành viên xem gói"),
    ).not.toBeInTheDocument();
  });
});
