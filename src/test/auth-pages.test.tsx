import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { AuthProvider } from "../lib/auth";
import { readDemo } from "../lib/demo";
function page(url = "/login") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[url]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
async function register(confirm = "test-password") {
  await userEvent.type(screen.getByLabelText("Họ và tên"), "Thành viên thử");
  await userEvent.type(screen.getByLabelText("Số điện thoại"), "0919991101");
  await userEvent.type(
    screen.getByLabelText("Địa chỉ email"),
    "test@example.test",
  );
  await userEvent.type(
    screen.getByLabelText("Mật khẩu", { exact: true }),
    "test-password",
  );
  await userEvent.type(screen.getByLabelText("Xác nhận mật khẩu"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
}
describe("Form và không gian theo vai trò", () => {
  it.each([
    ["Quản lý trung tâm", "Chào Lộc, ngày mới tốt lành"],
    ["Huấn luyện viên", "Chào Hương, ngày mới tốt lành"],
    ["Thành viên", "Chào Anh, ngày mới tốt lành"],
    ["Nhân viên lễ tân", "Chào Trang, ngày mới tốt lành"],
  ])("opens %s and logs out", async (role, title) => {
    page();
    await userEvent.click(screen.getByRole("button", { name: role }));
    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(!!screen.queryByRole("link", { name: "Quyền truy cập" })).toBe(
      role === "Quản lý trung tâm",
    );
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(
      await screen.findByRole("button", { name: "Đăng nhập" }),
    ).toBeVisible();
    expect(sessionStorage.getItem("sportiva-session")).toBeNull();
  });
  it("rejects an incorrect password", async () => {
    page();
    await userEvent.type(
      screen.getByLabelText("Địa chỉ email"),
      "member1@sportiva.demo",
    );
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dùng tài khoản demo",
    );
    expect(sessionStorage.getItem("sportiva-session")).toBeNull();
  });
  it("does not register when password confirmation differs", async () => {
    page("/register");
    await register("different-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mật khẩu xác nhận chưa khớp",
    );
    expect(readDemo().users.some((u) => u.email === "test@example.test")).toBe(
      false,
    );
  });
  it("registers only a member and logs in without retaining the form password", async () => {
    page("/register");
    await register();
    expect(
      await screen.findByRole("button", { name: "Đăng nhập" }),
    ).toBeVisible();
    expect(
      readDemo().users.find((u) => u.email === "test@example.test")?.roleName,
    ).toBe("MEMBER");
    expect(localStorage.getItem("sportiva-auth-demo-v1")).not.toContain(
      "test-password",
    );
    await userEvent.type(
      screen.getByLabelText("Địa chỉ email"),
      "test@example.test",
    );
    await userEvent.type(
      screen.getByLabelText("Mật khẩu", { exact: true }),
      "Sportiva@123",
    );
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(
      await screen.findByRole("heading", {
        name: "Chào thử, ngày mới tốt lành",
      }),
    ).toBeVisible();
  });
});
