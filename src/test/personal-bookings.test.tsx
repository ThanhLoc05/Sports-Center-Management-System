import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PersonalBookings from "../components/PersonalBookings";
import { ToastProvider } from "../components/ui";
import { api, request } from "../lib/api";
import type { Booking, SportClass } from "../lib/types";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ session: { user: { id: 5 } } }) }));
vi.mock("../lib/catalog", () => ({ useCatalog: () => ({ rooms: { 1: "Sân A" } }) }));
vi.mock("../lib/hooks", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  const { api } = await import("../lib/api");
  return { useClasses: () => useQuery({ queryKey: ["classes"], queryFn: () => api.classes() }) };
});
vi.mock("../lib/api", () => ({
  api: { bookings: vi.fn(), classes: vi.fn(), coaches: vi.fn(), cancelBooking: vi.fn(), attendance: vi.fn() },
  request: vi.fn(),
}));

function session(id: number, className: string, scheduleTime: string, extra: Partial<SportClass> = {}): SportClass {
  return {
    id, className, scheduleTime, sportId: 1, roomId: 1, coachId: 3, durationMinutes: 60,
    maxCapacity: 5, status: "SCHEDULED", requiredAccessLevel: "STANDARD", ...extra,
  };
}
let bookings: Booking[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-11-26T05:00:00Z"));
  vi.mocked(api.classes).mockResolvedValue([
    session(1, "Buổi xa", "2026-11-27T14:00:00"),
    session(2, "Buổi gần", "2026-11-26T16:00:00"),
    session(3, "Buổi đã tham gia", "2026-11-25T10:00:00"),
    session(4, "Buổi vắng", "2026-11-24T11:00:00"),
    session(5, "Buổi chờ điểm danh", "2026-11-23T11:00:00"),
    session(6, "Buổi hủy cũ", "2026-11-24T14:00:00"),
    session(7, "Buổi hủy mới", "2026-11-30T14:00:00"),
    session(8, "Buổi có lời mời", "2026-11-27T18:00:00"),
    session(9, "Buổi trong hàng chờ", "2026-11-28T18:00:00"),
    session(10, "Khóa riêng", "2026-11-28T18:00:00", { courseId: 5 }),
    session(11, "Lớp cố định riêng", "2026-11-28T18:00:00", { regularClassId: 6 }),
  ]);
  bookings = [1, 2, 3, 4, 5, 6, 7, 10, 11].map(id => ({
    id, classId: id, memberId: 5, bookedAt: id === 7 ? "2026-11-24T09:00:00" : "2026-11-22T10:00:00",
    status: id === 6 || id === 7 ? "CANCELLED" : "BOOKED",
  }));
  vi.mocked(api.bookings).mockImplementation(async () => bookings);
  vi.mocked(api.coaches).mockResolvedValue([{ coachId: 3, fullName: "Coach Lan", specialties: null, professionalLevel: null, bio: null }]);
  vi.mocked(api.attendance).mockResolvedValue([
    { id: 40, memberId: 5, classId: 3, status: "PRESENT", checkedInAt: "2026-11-25T10:00:00" },
    { id: 41, memberId: 5, classId: 4, status: "ABSENT", checkedInAt: "2026-11-24T11:00:00" },
  ]);
  vi.mocked(request).mockResolvedValue([
    { classId: 8, status: "INVITED", inviteUntil: "2026-11-26T12:15:00" },
    { classId: 9, status: "QUEUED", inviteUntil: null },
  ]);
});
afterEach(() => vi.useRealTimers());

function open() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><PersonalBookings /></ToastProvider></MemoryRouter>
  </QueryClientProvider>);
  return userEvent.setup();
}

const titles = () => screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent);
function card(name: string) {
  return screen.getByRole("heading", { name }).closest("li")!;
}

it("lists only flexible bookings in chronological groups and expands booking details", async () => {
  const user = open();
  await screen.findByRole("heading", { name: "Buổi gần" });
  expect(titles()).toEqual(["Buổi gần", "Buổi xa"]);
  expect(screen.getByText("Hôm nay · 26/11/2026")).toBeVisible();
  expect(screen.getByText("Ngày mai · 27/11/2026")).toBeVisible();
  expect(screen.getAllByText("Buổi gần nhất")).toHaveLength(1);
  expect(within(card("Buổi gần")).getByText("16:00–17:00")).toBeVisible();
  expect(within(card("Buổi gần")).getByText("Coach Lan · Sân A")).toBeVisible();
  expect(screen.getByRole("link", { name: "Đăng ký thêm" })).toHaveAttribute("href", "/sessions");
  const details = within(card("Buổi gần")).getByText("Xem chi tiết");
  await user.click(details);
  expect(details.closest("details")).toHaveAttribute("open");
  expect(within(card("Buổi gần")).getByText("Ngày đặt chỗ")).toBeVisible();
  await user.click(details);
  expect(details.closest("details")).not.toHaveAttribute("open");
});

it("shows attendance only from the API and shows cancellation history by booked date", async () => {
  const user = open();
  await user.click(await screen.findByRole("button", { name: "Đã diễn ra (3)" }));
  expect((await screen.findAllByText("Đã tham gia"))[0]).toBeVisible();
  expect(screen.getAllByText("Vắng đã xác nhận")[0]).toBeVisible();
  expect(screen.getAllByText("Chờ cập nhật điểm danh")[0]).toBeVisible();
  expect(titles()).toEqual(["Buổi đã tham gia", "Buổi vắng", "Buổi chờ điểm danh"]);
  expect(api.attendance).toHaveBeenCalledWith(5, undefined, "2026-11-23", "2026-11-26");
  await user.click(screen.getByRole("button", { name: "Đã hủy (2)" }));
  expect(titles()).toEqual(["Buổi hủy mới", "Buổi hủy cũ"]);
});

it("distinguishes both cancellation deadlines and changes status only after successful cancellation", async () => {
  vi.mocked(api.cancelBooking).mockRejectedValueOnce(new Error("Không hủy được")).mockImplementationOnce(async () => {
    bookings = bookings.map(booking => booking.id === 2 ? { ...booking, status: "CANCELLED" } : booking);
  });
  const user = open();
  await screen.findByRole("heading", { name: "Buổi xa" });
  async function confirmFor(name: string) {
    const row = within(card(name));
    if (!row.getByText("Xem chi tiết").closest("details")?.open) await user.click(row.getByText("Xem chi tiết"));
    await user.click(row.getByRole("button", { name: "Hủy buổi" }));
    return within(screen.getByRole("dialog", { name: "Hủy buổi tập?" }));
  }
  const onTime = await confirmFor("Buổi xa");
  expect(onTime.getByText(/27\/11\/2026 · 02:00/)).toBeVisible();
  expect(onTime.queryByText(/Bạn đang hủy trễ/)).not.toBeInTheDocument();
  await user.click(onTime.getByRole("button", { name: "Quay lại" }));
  expect(api.cancelBooking).not.toHaveBeenCalled();
  const late = await confirmFor("Buổi gần");
  expect(late.getByText(/Bạn đang hủy trễ/)).toBeVisible();
  await user.click(late.getByRole("button", { name: "Xác nhận" }));
  expect(await late.findByRole("alert")).toHaveTextContent("Không hủy được");
  expect(screen.getByRole("button", { name: "Sắp tới (2)" })).toBeInTheDocument();
  await user.click(late.getByRole("button", { name: "Xác nhận" }));
  await user.click(await screen.findByRole("button", { name: "Đã hủy (3)" }));
  expect(screen.getByRole("heading", { name: "Buổi gần" })).toBeVisible();
});

it("keeps Waitlist separate and accepts a live invitation through the existing endpoint", async () => {
  const user = open();
  await screen.findByRole("button", { name: "Sắp tới (2)" });
  await user.click(await screen.findByRole("button", { name: "Danh sách chờ (2)" }));
  expect(screen.getAllByText("Đang chờ chỗ")[0]).toBeVisible();
  expect(screen.getAllByText("Có lời mời nhận chỗ")[0]).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Xác nhận lời mời" }));
  expect(request).toHaveBeenCalledWith("/classes/8/waitlist/accept", { method: "POST" });
});

it("declines only after confirmation and refreshes the waiting list without making a booking", async () => {
  const user = open();
  await user.click(await screen.findByRole("button", { name: "Danh sách chờ (2)" }));
  expect(within(card("Buổi trong hàng chờ")).queryByRole("button", { name: "Từ chối lời mời" })).toBeNull();
  const decline = screen.getByRole("button", { name: "Từ chối lời mời" });
  await user.click(decline);
  const confirmation = () => within(screen.getByRole("dialog", { name: "Từ chối lời mời giữ chỗ?" }));
  await user.click(confirmation().getByRole("button", { name: "Quay lại" }));
  expect(request).not.toHaveBeenCalledWith("/classes/8/waitlist/decline", expect.anything());

  await user.click(decline);
  vi.mocked(request).mockRejectedValueOnce(new Error("Lời mời không còn hiệu lực."));
  await user.click(confirmation().getByRole("button", { name: "Xác nhận" }));
  expect(await confirmation().findByRole("alert")).toHaveTextContent("Lời mời không còn hiệu lực.");

  vi.mocked(request).mockResolvedValueOnce({ classId: 8, status: "CANCELLED" }).mockResolvedValue([
    { classId: 8, status: "CANCELLED", inviteUntil: null },
    { classId: 9, status: "QUEUED", inviteUntil: null },
  ]);
  await user.click(confirmation().getByRole("button", { name: "Xác nhận" }));
  expect(await screen.findByRole("button", { name: "Danh sách chờ (1)" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Buổi có lời mời" })).toBeNull();
  expect(request).not.toHaveBeenCalledWith("/classes/8/waitlist/accept", expect.anything());
  expect(screen.getByRole("button", { name: "Sắp tới (2)" })).toBeInTheDocument();
});
