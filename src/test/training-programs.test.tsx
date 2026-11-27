import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { trainingApi } from "../lib/training-api";
import type { TrainingProgram } from "../lib/training-api";
import TrainingPrograms from "../pages/TrainingPrograms";
import App from "../App";

function setup(course = false, route?: string, role = "MEMBER", courseEnabled = true) {
  vi.spyOn(api, "features").mockResolvedValue({ courseEnabled });
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: `e30.${payload}.test`,
      user: {
        id: 42,
        fullName: "Học viên",
        email: "member@example.test",
        roleName: role,
        status: "ACTIVE",
      },
    }),
  );
  vi.spyOn(api, "sports").mockResolvedValue([
    { id: 1, name: "Yoga", description: "" },
  ]);
  vi.spyOn(api, "rooms").mockResolvedValue([
    { id: 1, name: "Phòng 1", capacity: 20, description: "" },
  ]);
  vi.spyOn(api, "coaches").mockResolvedValue([
    {
      coachId: 3,
      fullName: "HLV Mai",
      professionalLevel: null,
      specialties: null,
      bio: null,
    },
  ]);
  vi.spyOn(trainingApi, "access").mockResolvedValue({
    hasActiveMembership: true,
    accessLevel: "VIP",
    endDate: "2099-12-31",
    maxConcurrentClasses: 2,
    activeClassCount: 0,
    sportLimit: null,
    courseDiscountPercent: 10,
  });
  const program: TrainingProgram = {
    id: 8,
    kind: course ? "COURSE" : "REGULAR",
    name: course ? "Yoga 12 buổi" : "Yoga chiều",
    sportId: 1,
    sportName: "Yoga",
    description: "Luyện thăng bằng",
    trainingLevel: "Cơ bản",
    maxCapacity: 20,
    requiredAccessLevel: "STANDARD",
    status: course ? "OPEN" : "ACTIVE",
    slots: [1, 3, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: "17:50:00",
      endTime: "18:50:00",
      coachId: 3,
      roomId: 1,
      coachName: "HLV Mai",
      roomName: "Phòng 1",
    })),
    discountPercent: course ? 10 : 0,
    remainingCapacity: 15,
    eligible: true,
    eligibilityReason: "",
    registered: false,
    ...(course
      ? {
          startDate: "2099-12-01",
          endDate: "2099-12-31",
          totalSessions: 12,
          price: 1000000,
          payableAmount: 900000,
        }
      : {}),
  };
  if (route) {
    vi.spyOn(api, "classes").mockResolvedValue([]);
    vi.spyOn(api, "bookings").mockResolvedValue([]);
    vi.spyOn(api, "managedClasses").mockResolvedValue({ items: [], total: 0, pageCount: 0 });
  }
  const search = vi.spyOn(trainingApi, "search").mockResolvedValue([program]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={route ? [route] : undefined}>
        <AuthProvider>
          <ToastProvider>
            {route ? <App /> : <TrainingPrograms kind={course ? "COURSE" : "REGULAR"} />}
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { search, program, user: userEvent.setup() };
}
describe("Course feature flag", () => {
  it.each([
    ["MEMBER", "/courses?orderId=99", "Buổi tập theo gói"],
    ["MEMBER", "/my-courses", "Buổi tập theo gói"],
    ["CENTER_MANAGER", "/courses", "Buổi tập theo gói"],
    ["COACH", "/courses", "Buổi tập theo gói"],
    ["RECEPTIONIST", "/course-orders", "Buổi tập theo gói"],
  ])("blocks the Course route for %s at %s", async (role, path, heading) => {
    const { search } = setup(false, path, role, false);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Khóa học|Đơn khóa học/ })).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });
});

describe("sport-first registration", () => {
  it("offers two learning paths and keeps the course flow", async () => {
    const { search, user } = setup(false, "/classes");
    expect(await screen.findByRole("heading", { name: "Lớp học của tôi" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Chọn nhiều buổi" })).not.toBeInTheDocument();
    expect(await screen.findByText("Chưa có buổi học đã đặt")).toBeVisible();
    expect(search).not.toHaveBeenCalled();
    const sidebar = within(screen.getByRole("navigation", { name: "Điều hướng chính" }));
    expect(sidebar.getByRole("link", { name: "Lớp học" })).toHaveAttribute("href", "/classes");
    expect(sidebar.getByRole("link", { name: "Đăng ký lớp" })).toHaveAttribute("href", "/sessions");
    for (const name of ["Buổi học linh hoạt", "Lớp thường", "Khóa học", "Đơn khóa học", "Đặt buổi", "Ghi danh lớp thường"]) {
      expect(sidebar.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    const mine = within(screen.getByRole("navigation", { name: "Các mục lớp học của tôi" }));
    expect(mine.queryByRole("link", { name: "Lớp thường đã ghi danh" })).not.toBeInTheDocument();
    expect(mine.getByRole("link", { name: "Khóa học đã mua" })).toHaveAttribute("href", "/my-courses");
    await user.click(sidebar.getByRole("link", { name: "Đăng ký lớp" }));
    expect(await screen.findByRole("heading", { name: "Buổi tập theo gói" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Các mục đăng ký lớp" })).toBeVisible();
    const tabs = () => within(screen.getByRole("navigation", { name: "Các mục đăng ký lớp" }));
    expect(tabs().getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Buổi tập theo gói", "Khóa học chuyên sâu",
    ]);
    await user.click(tabs().getByRole("link", { name: "Khóa học chuyên sâu" }));
    expect(await screen.findByRole("heading", { name: "Khóa học chuyên sâu" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /^Yoga$/ }));
    await waitFor(() => expect(search).toHaveBeenLastCalledWith("COURSE", expect.objectContaining({ sportId: 1 })));
  });
  it.each(["MEMBER", "CENTER_MANAGER", "COACH", "RECEPTIONIST"])(
    "redirects the legacy regular-class URL for %s without loading its catalog",
    async (role) => {
      const { search } = setup(false, "/regular-classes", role);
      expect(await screen.findByRole("heading", { name: "Buổi tập theo gói" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Tạo lớp thường" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Lớp thường|Lớp theo lịch cố định/ })).not.toBeInTheDocument();
      expect(search).not.toHaveBeenCalled();
    },
  );
  it("waits for sport selection and sends availability as an additional filter", async () => {
    const { search, user } = setup();
    expect(await screen.findByText("Chọn bộ môn bạn muốn học")).toBeVisible();
    expect(search).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Yoga" }));
    expect(
      await screen.findByRole("heading", { name: "Yoga chiều" }),
    ).toBeVisible();
    expect(search).toHaveBeenLastCalledWith(
      "REGULAR",
      expect.objectContaining({ sportId: 1, memberId: 42, availability: [] }),
    );
    await user.click(screen.getByRole("button", { name: "Thêm khoảng rảnh" }));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "REGULAR",
        expect.objectContaining({ availability: [{ dayOfWeek: 1 }] }),
      ),
    );
  });
  it("registers the parent class rather than one dated session", async () => {
    const { user } = setup();
    const register = vi
      .spyOn(trainingApi, "register")
      .mockResolvedValue({
        id: 9,
        regularClassId: 8,
        className: "Yoga chiều",
        memberId: 42,
        subscriptionId: 1,
        validFrom: "2099-12-01",
        validUntil: "2099-12-31",
        status: "ACTIVE",
      });
    await user.click(
      await screen.findByRole("button", { name: "Yoga" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Đăng ký lịch lớp" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(register).toHaveBeenCalledWith(8, 42));
  });
  it("shows course dates, total sessions and discounted tuition", async () => {
    const { user } = setup(true);
    await user.click(
      await screen.findByRole("button", { name: "Yoga" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Yoga 12 buổi" }),
    ).toBeVisible();
    expect(screen.getByText(/3 buổi\/tuần · 12 buổi/)).toBeVisible();
    expect(screen.getByText("Giảm 10% theo gói")).toBeVisible();
  });
});
