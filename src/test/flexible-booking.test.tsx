import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { FlexibleBooking } from "../components/FlexibleBooking";
import { api, request } from "../lib/api";
import { addDays, dateLabel, localDate } from "../lib/utils";
import type { SportClass } from "../lib/types";

vi.mock("../lib/api", () => ({
  api: { capacity: vi.fn().mockResolvedValue(3), bookings: vi.fn().mockResolvedValue([]) },
  request: vi.fn(),
}));

const tomorrow = localDate(addDays(1));
const nextDay = localDate(addDays(2));
const base: SportClass = {
  id: 10, className: "Cầu lông sáng", sportId: 1, roomId: 6, coachId: 3,
  scheduleTime: `${tomorrow}T08:00:00`, durationMinutes: 45, maxCapacity: 6,
  status: "SCHEDULED", requiredAccessLevel: "STANDARD",
};
const options = [
  base,
  { ...base, id: 11, className: "Cầu lông chiều", coachId: 4, scheduleTime: `${nextDay}T15:00:00` },
  { ...base, id: 13, className: "Cầu lông ngoài cửa sổ", scheduleTime: `${localDate(addDays(8))}T08:00:00` },
  { ...base, id: 12, className: "Yoga sáng", sportId: 2, scheduleTime: `${tomorrow}T09:00:00` },
];

function open(level: "STANDARD" | "VIP" = "VIP", classes = options) {
  const onView = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><FlexibleBooking classes={classes} sports={{ 1: "Cầu lông", 2: "Yoga" }} rooms={{ 6: "Sân A" }}
      coaches={[{ coachId: 3, fullName: "Coach A", specialties: null, professionalLevel: null, bio: null }, { coachId: 4, fullName: "Coach A", specialties: null, professionalLevel: null, bio: null }]}
      subscription={{ id: 2, memberId: 5, packageId: 4, startDate: "2098-01-01", endDate: "2098-03-01",
        status: "ACTIVE", selectedSportId: level === "STANDARD" ? 1 : null }}
      level={level} onView={onView} /></MemoryRouter>
  </QueryClientProvider>);
  return onView;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.capacity).mockResolvedValue(3);
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/bookings/my-conduct") return { held: 1, limit: 5, violations: 0 };
    if (path === "/bookings/my-waitlist") return [];
    return [];
  });
});

it("keeps selections from different days and sends a single batch request", async () => {
  let held = 1;
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/bookings/my-conduct") return { held, limit: 4, violations: 0 };
    if (path === "/bookings/batch") held = 3;
    return [];
  });
  open();
  const user = userEvent.setup();
  const summary = within(screen.getByRole("complementary", { name: "Xác nhận đăng ký lớp" }));
  expect(summary.getByRole("button", { name: /^Đăng ký lớp$/ })).toBeDisabled();
  expect(summary.getByText("Chưa chọn lớp nào")).toBeVisible();
  expect(await summary.findByText("1/4 lớp")).toBeVisible();
  expect(summary.getByRole("progressbar")).toHaveAttribute("max", "4");
  await user.selectOptions(screen.getByLabelText("Bộ môn"), "1");
  const first = await screen.findByRole("button", { name: "Chọn buổi Cầu lông sáng" });
  await user.click(first);
  await user.click(screen.getByRole("button", { name: dateLabel(nextDay) }));
  expect(screen.getByRole("heading", { name: "1 lớp đã chọn" })).toBeVisible();
  await user.click(await screen.findByRole("button", { name: "Chọn buổi Cầu lông chiều" }));
  expect(summary.getByText("3/4 lớp")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Bỏ chọn lớp Cầu lông sáng" }));
  expect(screen.getByRole("heading", { name: "1 lớp đã chọn" })).toBeVisible();
  expect(summary.getByText("2/4 lớp")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Tất cả ngày" }));
  await user.click(await screen.findByRole("button", { name: "Chọn buổi Cầu lông sáng" }));
  expect(screen.queryByRole("button", { name: /Chọn buổi Yoga sáng/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Đăng ký 2 lớp" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Đã đăng ký các lớp đã chọn.");
  expect(summary.getByText("3/4 lớp")).toBeVisible();
  expect(summary.getByRole("progressbar")).toHaveAttribute("value", "3");
  expect(summary.getByRole("button", { name: /^Đăng ký lớp$/ })).toBeDisabled();
  expect(vi.mocked(request).mock.calls.filter(([path]) => path === "/bookings/batch"))
    .toEqual([["/bookings/batch", { method: "POST", body: '{"classIds":[11,10]}' }]]);
});

it("offers only the chosen sport to STANDARD", async () => {
  open("STANDARD");
  expect(screen.getByLabelText("Bộ môn")).toHaveValue("1");
  expect(screen.queryByRole("option", { name: "Yoga" })).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Chọn buổi Cầu lông sáng" })).toBeEnabled();
});

it("keeps the draft open after a rejected batch", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/bookings/batch") throw new Error("Buổi #10 đã đầy.");
    if (path === "/bookings/my-conduct") return { held: 1, limit: 5, violations: 0 };
    return [];
  });
  open();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Bộ môn"), "1");
  await user.click(await screen.findByRole("button", { name: "Chọn buổi Cầu lông sáng" }));
  await user.click(screen.getByRole("button", { name: "Đăng ký 1 lớp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Lớp #10 đã đầy.");
  expect(screen.getByRole("heading", { name: "1 lớp đã chọn" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Đăng ký 1 lớp" })).toBeEnabled();
});

it("filters coaches by sport, date and hour while preserving distinct IDs", async () => {
  open("STANDARD");
  const user = userEvent.setup();
  expect(screen.getByRole("option", { name: "Coach A (#3)" })).toHaveValue("3");
  expect(screen.getByRole("option", { name: "Coach A (#4)" })).toHaveValue("4");
  await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "4");
  expect(screen.queryByRole("button", { name: "Chọn buổi Cầu lông sáng" })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "");
  await user.click(screen.getByRole("button", { name: dateLabel(tomorrow) }));
  await user.selectOptions(screen.getByLabelText("Từ giờ"), "07:30");
  await user.selectOptions(screen.getByLabelText("Đến giờ"), "09:00");
  expect(screen.getByRole("option", { name: "Coach A" })).toHaveValue("3");
  expect(screen.queryByRole("button", { name: "Chọn buổi Cầu lông chiều" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "1 buổi phù hợp bộ lọc" })).toBeVisible();
  expect(screen.queryByText("Cầu lông ngoài cửa sổ")).not.toBeInTheDocument();
});


it("groups VIP coach options and retains the compatible selection and active day when changing sport", async () => {
  open();
  const user = userEvent.setup();
  const sport = screen.getByLabelText("Bộ môn");
  const coach = screen.getByLabelText("Huấn luyện viên");
  expect(sport).toHaveValue("all");
  const group = within(coach).getByRole("group", { name: "Chưa phân loại" });
  expect(within(group).getByRole("option", { name: "Coach A (#3)" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: dateLabel(tomorrow) }));
  await user.selectOptions(coach, "3");
  await user.selectOptions(sport, "2");
  expect(coach).toHaveValue("3");
  expect(screen.getByRole("button", { name: dateLabel(tomorrow) })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("button", { name: "Chọn buổi Yoga sáng" })).toBeEnabled();
  await user.selectOptions(sport, "all");
  await user.click(screen.getByRole("button", { name: "Tất cả ngày" }));
  await user.selectOptions(coach, "4");
  await user.selectOptions(sport, "2");
  expect(coach).toHaveValue("");
});

it("hides full sessions with Chỉ còn chỗ and keeps their waitlist available otherwise", async () => {
  vi.mocked(api.capacity).mockImplementation(async (id) => id === 10 ? 0 : 3);
  open("STANDARD");
  const user = userEvent.setup();
  expect(await screen.findByRole("button", { name: "Vào danh sách chờ" })).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "Chỉ còn chỗ" }));
  expect(screen.queryByText("Cầu lông sáng")).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Chỉ còn chỗ" }));
  await user.click(screen.getByRole("button", { name: "Vào danh sách chờ" }));
  expect(request).toHaveBeenCalledWith("/classes/10/waitlist", { method: "POST" });
});


it("shows Monday-to-Sunday weeks in Vietnam over a month rollover and keeps the exact seven-day cutoff", async () => {
  vi.setSystemTime(new Date("2026-11-29T17:15:00Z"));
  try {
    open("STANDARD", [
      { ...base, className: "Buổi tối UTC", scheduleTime: "2026-11-29T18:00:00Z" },
      { ...base, id: 11, className: "Buổi đầu tháng", scheduleTime: "2026-12-01T08:00:00" },
      { ...base, id: 12, className: "Buổi trong hạn", scheduleTime: "2026-12-07T00:15:00" },
      { ...base, id: 13, className: "Buổi quá hạn", scheduleTime: "2026-12-07T00:16:00" },
    ]);
    const user = userEvent.setup();
    const week = within(screen.getByRole("group", { name: "Tuần này" }));
    const nextWeek = within(screen.getByRole("group", { name: "Tuần sau" }));
    expect(week.getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["30/11/2026", "01/12/2026", "02/12/2026", "03/12/2026", "04/12/2026", "05/12/2026", "06/12/2026"]);
    expect(week.getByRole("button", { name: "30/11/2026", current: "date" })).toBeEnabled();
    expect(week.getByRole("button", { name: "02/12/2026" })).toHaveAttribute("title", "Chưa có buổi");
    expect(nextWeek.getByRole("button", { name: "08/12/2026" })).toBeDisabled();
    expect(screen.queryByText("Buổi quá hạn")).not.toBeInTheDocument();
    await user.click(week.getByRole("button", { name: "30/11/2026" }));
    expect(screen.getByText("Buổi tối UTC")).toBeVisible();
    expect(screen.queryByText("Buổi đầu tháng")).not.toBeInTheDocument();
    await user.click(week.getByRole("button", { name: "30/11/2026" }));
    await user.click(nextWeek.getByRole("button", { name: "07/12/2026" }));
    expect(screen.getByText("Buổi trong hạn")).toBeVisible();
    expect(screen.queryByText("Buổi tối UTC")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the selected coach and draft when hour filters exclude all matching sessions", async () => {
  open("STANDARD");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Chọn buổi Cầu lông sáng" }));
  await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "3");
  await user.selectOptions(screen.getByLabelText("Từ giờ"), "10:00");
  const until = screen.getByRole("combobox", { name: "Đến giờ" });
  expect(within(until).getByRole("option", { name: "10:00" })).toBeDisabled();
  await user.selectOptions(until, "16:00");
  expect(screen.getByLabelText("Bộ môn")).toHaveValue("1");
  expect(screen.getByLabelText("Huấn luyện viên")).toHaveValue("3");
  expect(screen.getByRole("heading", { name: "0 buổi phù hợp bộ lọc" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "1 lớp đã chọn" })).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "4");
  expect(screen.getByText("Cầu lông chiều")).toBeVisible();
  expect(screen.getByRole("heading", { name: "1 lớp đã chọn" })).toBeVisible();
});
