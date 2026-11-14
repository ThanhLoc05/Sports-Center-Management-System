import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { demoSession, readDemo } from "../lib/demo";
import { ToastProvider } from "../components/ui";
import Bookings from "../pages/Bookings";

function setup() {
  const db = readDemo();
  const session = demoSession("RECEPTIONIST");
  sessionStorage.setItem("sportiva-session", JSON.stringify(session));
  const members = [
    {
      ...db.users.find((u) => u.roleName === "MEMBER")!,
      id: 3,
      fullName: "Nguyễn Hải An",
    },
    {
      ...db.users.find((u) => u.roleName === "MEMBER")!,
      id: 13,
      fullName: "Lê Bình",
    },
  ];
  vi.spyOn(api, "users").mockResolvedValue(members);
  vi.spyOn(api, "classes").mockResolvedValue(db.classes.slice(0, 2));
  const bookings = vi
    .spyOn(api, "bookings")
    .mockImplementation(async (_memberId, classId) => [
      {
        id: classId === db.classes[0].id ? 800 : 3,
        memberId: classId === db.classes[0].id ? 3 : 13,
        classId: classId!,
        status: "BOOKED",
        bookedAt: "2026-11-14T08:00:00",
      },
    ]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Bookings />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { bookings, db };
}

describe("Lễ tân tra cứu và đăng ký lớp hộ thành viên", () => {
  it("tải đăng ký của tất cả lớp khi mở trang, không yêu cầu nhập từng ID", async () => {
    const { bookings, db } = setup();
    expect(await screen.findByText("Nguyễn Hải An")).toBeVisible();
    expect(await screen.findByText("Lê Bình")).toBeVisible();
    expect(bookings).toHaveBeenCalledWith(undefined, db.classes[0].id);
    expect(bookings).toHaveBeenCalledWith(undefined, db.classes[1].id);
  });

  it("Enter tìm đúng ID thành viên, bỏ kết quả chỉ trùng một phần ID hoặc mã đăng ký", async () => {
    setup();
    await screen.findByText("Lê Bình");
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Tìm đăng ký theo ID hoặc tên thành viên"),
      "3{Enter}",
    );
    expect(screen.getByText("Nguyễn Hải An")).toBeVisible();
    expect(screen.queryByText("Lê Bình")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xem tất cả" }));
    expect(screen.getByText("Lê Bình")).toBeVisible();
  });

  it("nút Tìm kiếm hỗ trợ tên không dấu và mã TV", async () => {
    setup();
    await screen.findByText("Lê Bình");
    const user = userEvent.setup();
    const input = screen.getByLabelText(
      "Tìm đăng ký theo ID hoặc tên thành viên",
    );
    await user.type(input, "le binh");
    await user.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    expect(screen.queryByText("Nguyễn Hải An")).not.toBeInTheDocument();
    expect(screen.getByText("Lê Bình")).toBeVisible();
    await user.clear(input);
    await user.type(input, "TV0003{Enter}");
    expect(screen.getByText("Nguyễn Hải An")).toBeVisible();
    expect(screen.queryByText("Lê Bình")).not.toBeInTheDocument();
  });

  it("form hiển thị danh sách thành viên và tìm tên bằng Enter mà không gửi đăng ký", async () => {
    setup();
    await screen.findByText("Nguyễn Hải An");
    const user = userEvent.setup();
    const book = vi.spyOn(api, "book");
    await user.click(screen.getByRole("button", { name: "Đăng ký lớp" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByRole("option", { name: /TV0003.*Nguyễn Hải An/ }),
    ).toBeVisible();
    expect(
      dialog.getByRole("option", { name: /TV0013.*Lê Bình/ }),
    ).toBeVisible();
    await user.type(
      dialog.getByLabelText("Tìm thành viên để đăng ký lớp"),
      "hai an{Enter}",
    );
    expect(
      dialog.queryByRole("option", { name: /Lê Bình/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText("Thành viên"), "3");
    expect(dialog.getByLabelText("Thành viên")).toHaveValue("3");
    expect(book).not.toHaveBeenCalled();
  });

  it("báo lỗi khi một lớp không tải được, tránh hiển thị danh sách thiếu như đã đầy đủ", async () => {
    const { bookings } = setup();
    bookings.mockRejectedValue(new Error("Không tải được đăng ký"));
    expect(await screen.findByText("Không tải được đăng ký")).toBeVisible();
  });
});
