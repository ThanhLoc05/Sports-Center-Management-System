import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { operations } from "../lib/operations-api";
import { demoSession, readDemo } from "../lib/demo";
import { addDays, localDate } from "../lib/utils";
import { ToastProvider } from "../components/ui";
import type { Role } from "../lib/types";

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));
afterEach(() => vi.unstubAllEnvs());

function page(path: string, role: Role, live = false, staleTime = 0) {
  if (live) vi.stubEnv("VITE_DATA_MODE", "api");
  const session = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify({ ...session, token: live ? "test-only" : session.token, mode: live ? "api" : "demo" }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider>
    <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
  </ToastProvider></AuthProvider></QueryClientProvider>);
  return { client, session };
}

describe("Coach/Member booking and navigation scope", () => {
  it("refreshes fresh dashboard caches when a Member enters the personal calendar", async () => {
    const memberId = demoSession("MEMBER").user.id;
    const day = localDate();
    const items = readDemo().classes.slice(0, 2).map((item, i) => ({
      ...item, status: "SCHEDULED", scheduleTime: day + (i === 0 ? "T09:00:00" : "T11:00:00"),
    }));
    const classes = vi.spyOn(api, "classes").mockResolvedValue([]);
    const bookings = vi.spyOn(api, "bookings").mockResolvedValue([]);
    vi.spyOn(api, "coaches").mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const { client } = page("/", "MEMBER", true, 30_000);
    await waitFor(() => {
      expect(client.getQueryData(["classes", undefined])).toEqual([]);
      expect(client.getQueryData(["bookings", memberId])).toEqual([]);
    });

    // Another session creates the classes and bookings after this dashboard read.
    classes.mockResolvedValue(items);
    bookings.mockResolvedValue(items.map((item, i) => ({
      id: i + 1, classId: item.id, memberId, status: "BOOKED", bookedAt: day,
    })));
    const user = userEvent.setup();
    await user.click(within(document.getElementById("main-sidebar")!).getByRole("link", { name: "Lịch hoạt động" }));
    await user.click(await screen.findByRole("button", { name: "Danh sách" }));
    for (const item of items) {
      const button = await screen.findByRole("button", { name: item.className });
      expect(button.closest(".schedule-list-item")).toHaveTextContent(item.scheduleTime.slice(11, 16));
    }
    expect(screen.getByLabelText("Phạm vi lịch học")).toHaveValue("mine");
  });

  it("filters member bookings locally without calling the private roster", async () => {
    const db = readDemo();
    const booking = vi.spyOn(api, "bookings").mockResolvedValue(db.classes.slice(0, 2).map((c, i) => ({
      id: 900 + i, classId: c.id, memberId: demoSession("MEMBER").user.id,
      status: "BOOKED", bookedAt: `${localDate()}T07:00:00`,
    })));
    const { session } = page("/bookings?memberId=999", "MEMBER");
    await screen.findByRole("button", { name: db.classes[0].className });
    await userEvent.setup().selectOptions(screen.getByLabelText("Lọc theo lớp học"), String(db.classes[0].id));
    expect(screen.queryByRole("button", { name: db.classes[1].className })).not.toBeInTheDocument();
    expect(booking.mock.calls.every(args => args.length === 1 && args[0] === session.user.id)).toBe(true);
  });

  it("requires an assigned class for Coach and ignores member query parameters", async () => {
    const booking = vi.spyOn(api, "bookings").mockResolvedValue([]);
    const { session } = page("/bookings?memberId=999", "COACH");
    expect(await screen.findByRole("heading", { name: "Học viên đăng ký" })).toBeVisible();
    expect(
      within(document.getElementById("main-sidebar")!).queryByRole("link", {
        name: "Học viên đăng ký",
      }),
    ).not.toBeInTheDocument();
    await screen.findByText("Chọn lớp phụ trách để xem đăng ký.");
    expect(booking).not.toHaveBeenCalled();
    expect(screen.queryByText("ID thành viên")).not.toBeInTheDocument();
    const assigned = readDemo().classes.find(c => c.coachId === session.user.id)!;
    await waitFor(() => expect(screen.getByRole("option", { name: assigned.className })).toBeInTheDocument());
    await userEvent.setup().selectOptions(screen.getByLabelText("Lọc theo lớp học"), String(assigned.id));
    await waitFor(() => expect(booking).toHaveBeenCalledWith(undefined, assigned.id));
    expect(booking.mock.calls.every(args => args[0] === undefined && args[1] === assigned.id)).toBe(true);
    expect(screen.queryByRole("button", { name: "Đăng ký lớp" })).not.toBeInTheDocument();
  });

  it.each(["COACH", "MEMBER", "RECEPTIONIST", "CENTER_MANAGER"] as Role[])("keeps support navigation appropriate for %s", async role => {
    page("/bookings", role);
    await screen.findByRole("heading", {
      name:
        role === "MEMBER"
          ? "Đăng ký lớp của tôi"
          : role === "COACH"
            ? "Học viên đăng ký"
            : "Đăng ký lớp học",
    });
    const sidebar = document.getElementById("main-sidebar")!;
    const link = within(sidebar).queryByRole("link", { name: "Yêu cầu hỗ trợ" });
    if (role === "COACH") expect(link).not.toBeInTheDocument();
    else expect(link).toBeInTheDocument();
  });

  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])("preserves assisted member lookup for %s", async role => {
    const booking = vi.spyOn(api, "bookings").mockResolvedValue([]);
    page("/bookings?memberId=10", role);
    await waitFor(() => expect(booking).toHaveBeenCalled());
    expect(booking.mock.calls.every(args => args[0] === undefined && Number(args[1]) > 0)).toBe(true);
    expect(screen.getByLabelText("Tìm đăng ký theo ID hoặc tên thành viên")).toHaveValue("10");
    expect(screen.getByRole("button", { name: "Đăng ký lớp" })).toBeVisible();
  });

  it.each(["COACH", "MEMBER"] as Role[])("still blocks manager routes for %s", async role => {
    page("/reports", role);
    expect(await screen.findByRole("heading", { name: /quyền/i })).toBeVisible();
  });

  it.each(["COACH", "MEMBER"] as Role[])("shows public Coach names in list calendar for %s", async role => {
    const session = demoSession(role);
    const c = { ...readDemo().classes[0], coachId: role === "COACH" ? session.user.id : 3, scheduleTime: `${localDate()}T10:00:00` };
    vi.spyOn(api, "classes").mockResolvedValue([c]);
    vi.spyOn(api, "bookings").mockResolvedValue([{ id: 91, memberId: session.user.id, classId: c.id, status: "BOOKED", bookedAt: `${localDate()}T07:00:00` }]);
    const coaches = vi.spyOn(api, "coaches").mockResolvedValue([{ coachId: c.coachId, fullName: "Public Coach Name", professionalLevel: null, specialties: null, bio: null }]);
    const users = vi.spyOn(api, "users");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    page("/schedule", role, true);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Danh sách" }));
    const card = await screen.findByRole("button", { name: c.className });
    expect(await within(card.closest(".schedule-list-item") as HTMLElement).findByText(/Public Coach Name/)).toBeVisible();
    expect(coaches).toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: c.className }));
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
});

it("lets Coach see and find students by the assigned class roster without loading users", async () => {
  const coachId = demoSession("COACH").user.id;
  const item = readDemo().classes.find(c => c.coachId === coachId)!;
  vi.spyOn(api, "classes").mockResolvedValue([item]);
  vi.spyOn(api, "bookings").mockResolvedValue([
    { id: 91, classId: item.id, memberId: 70, status: "BOOKED", bookedAt: localDate() },
  ]);
  const students = vi.spyOn(operations, "students").mockResolvedValue([
    { memberId: 70, fullName: "Nguyễn Thảo", bookingStatus: "BOOKED" } as Awaited<ReturnType<typeof operations.students>>[number],
  ]);
  const users = vi.spyOn(api, "users");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  page("/bookings", "COACH", true);
  const user = userEvent.setup();
  await screen.findByRole("option", { name: item.className });
  await user.selectOptions(screen.getByLabelText("Lọc theo lớp học"), String(item.id));
  expect(await screen.findByText("Nguyễn Thảo")).toBeVisible();
  await user.type(screen.getByLabelText("Tìm đăng ký theo ID hoặc tên thành viên"), "nguyen thao");
  await user.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  expect(screen.getByText("Nguyễn Thảo")).toBeVisible();
  expect(students).toHaveBeenCalledWith(item.id);
  expect(users).not.toHaveBeenCalled();
});

it("keeps other staff rosters visible when a class fails and retries only that class", async () => {
  const [a, b] = readDemo().classes;
  vi.spyOn(api, "classes").mockResolvedValue([a, b]);
  let failure = true;
  const bookings = vi.spyOn(api, "bookings").mockImplementation(async (_, classId) => {
    if (classId === b.id && failure) throw new Error("Không tải được");
    return [{ id: classId!, classId: classId!, memberId: 10, status: "BOOKED", bookedAt: localDate() }];
  });
  page("/bookings", "RECEPTIONIST");
  expect(await screen.findByRole("button", { name: a.className })).toBeVisible();
  expect(await screen.findByText(/Không tải được đăng ký của:/)).toHaveTextContent(b.className);
  const user = userEvent.setup();
  failure = false;
  await user.click(screen.getByRole("button", { name: "Thử tải lại lớp bị lỗi" }));
  expect(await screen.findByRole("button", { name: b.className })).toBeVisible();
  expect(bookings.mock.calls.filter(([, id]) => id === a.id)).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("Lọc theo lớp học"), String(a.id));
  expect(screen.queryByRole("button", { name: b.className })).toBeNull();
});

it("keeps simultaneous classes separately clickable for Receptionist", async () => {
  const [first, second] = readDemo().classes;
  const items = [
    { ...first, scheduleTime: localDate() + "T10:00:00", durationMinutes: 60, status: "SCHEDULED" },
    { ...second, scheduleTime: localDate() + "T10:00:00", durationMinutes: 30, status: "SCHEDULED" },
    { ...first, id: 99, className: "Buổi chiều", scheduleTime: localDate() + "T12:00:00", durationMinutes: 60, status: "SCHEDULED" },
  ];
  vi.spyOn(api, "classes").mockResolvedValue(items);
  page("/schedule", "RECEPTIONIST");
  const [a, b] = await Promise.all(items.map(c => screen.findByRole("button", { name: c.className })));
  const grid = await screen.findByRole("table", { name: "Sáu ca tập trong tuần" });
  expect(within(grid).getByRole("row", { name: /Ngoài khung ca/ })).toContainElement(a);
  expect(a.closest("td")).toBe(b.closest("td"));
  expect(a).not.toBe(b);
  expect(a).toHaveTextContent("10:00–11:00");
  expect(b).toHaveTextContent("10:00–10:30");
  const user = userEvent.setup();
  await user.click(a);
  expect(within(await screen.findByRole("dialog")).getByText(first.className)).toBeVisible();
  await user.keyboard("{Escape}");
  await user.click(b);
  expect(within(await screen.findByRole("dialog")).getByText(second.className)).toBeVisible();
});

it("groups the Manager week by Vietnam date and official slots while keeping legacy sessions and cancellations", async () => {
  const [first, second] = readDemo().classes;
  const today = new Date(`${localDate()}T12:00:00+07:00`);
  const monday = addDays(-((today.getUTCDay() + 6) % 7), today);
  const date = localDate(monday);
  const nextDate = localDate(addDays(7, monday));
  const sessions = [
    { ...first, className: "Confirmed first", scheduleTime: `${date}T06:00:00`, durationMinutes: 90, status: "SCHEDULED" },
    // At 23:00 UTC on Sunday it is already Monday, 06:00, in Vietnam.
    { ...second, className: "Confirmed second", scheduleTime: `${localDate(addDays(-1, monday))}T23:00:00Z`, durationMinutes: 90, status: "SCHEDULED" },
    { ...first, id: 91, className: "Cancelled legacy", scheduleTime: `${date}T06:00:00`, durationMinutes: 60, status: "CANCELLED" },
    { ...second, id: 92, className: "Next week", scheduleTime: `${nextDate}T08:00:00`, durationMinutes: 90, status: "SCHEDULED" },
  ];
  vi.spyOn(api, "classes").mockResolvedValue(sessions);
  const booked = vi.spyOn(api, "bookings").mockImplementation(async (_, classId) =>
    classId === first.id
      ? [{ id: 500, classId, memberId: 10, status: "BOOKED", bookedAt: date }]
      : [],
  );
  page("/schedule", "CENTER_MANAGER");
  const grid = await screen.findByRole("table", { name: "Sáu ca học trong tuần" });
  expect(grid.querySelectorAll("tbody tr")).toHaveLength(6);
  expect(grid.querySelectorAll("tbody td")).toHaveLength(42);
  expect(within(grid).getByText("19:15–20:45")).toBeVisible();
  expect(booked).not.toHaveBeenCalled();
  const user = userEvent.setup();
  const firstSlot = within(grid).getByRole("button", { name: /Ca 01.*2 buổi/ });
  await user.click(firstSlot);
  const group = screen.getByRole("dialog");
  expect(await within(group).findByText(`1/${first.maxCapacity} đã đăng ký`)).toBeVisible();
  expect(within(group).getByRole("button", { name: "Confirmed second" })).toBeVisible();
  await user.click(within(group).getByRole("button", { name: "Confirmed first" }));
  const detail = within(await screen.findByRole("dialog", { name: "Chi tiết buổi tập" }));
  expect(detail.getByRole("heading", { name: "Confirmed first" })).toBeVisible();
  expect(detail.getByText("06:00 – 07:30")).toBeVisible();
  await user.keyboard("{Escape}");

  expect(within(grid).queryByRole("button", { name: /Ngoài khung ca/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Trạng thái buổi học"), "CANCELLED");
  expect(within(grid).queryByRole("button", { name: /Ca 01/ })).not.toBeInTheDocument();
  await user.click(within(grid).getByRole("button", { name: /Ngoài khung ca.*1 buổi.*1 đã hủy/ }));
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelled legacy" })).toBeVisible();
  await user.keyboard("{Escape}");
  await user.selectOptions(screen.getByLabelText("Trạng thái buổi học"), "all");
  await user.click(screen.getByRole("button", { name: "Tuần sau" }));
  await user.click(within(grid).getByRole("button", { name: /Ca 02.*1 buổi/ }));
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Next week" })).toBeVisible();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Tuần này" }));
  expect(within(grid).getByRole("button", { name: /Ca 01.*2 buổi/ })).toBeVisible();
});
