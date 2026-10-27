import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoSession, readDemo, saveDemo } from "../lib/demo";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { addDays, localDate } from "../lib/utils";
import type { ClassInput, Role } from "../lib/types";
import App from "../App";

const login = (role: Role) => {
  const session = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify(session));
  return session;
};
const input = (): ClassInput => ({
  className: "TEST lớp mới",
  sportId: 1,
  roomId: 1,
  coachId: 3,
  maxCapacity: 15,
  scheduleTime: `${localDate(addDays(5))}T14:00:00`,
  durationMinutes: 60,
  status: "SCHEDULED",
});
function page(path: string, role: Role) {
  login(role);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Lớp học và lịch hoạt động — phần 5", () => {
  it("creates a class, updates assignment and cancels while preserving its record", async () => {
    login("CENTER_MANAGER");
    const created = await api.saveClass(input());
    const db = readDemo();
    db.users.push({
      id: 30,
      fullName: "HLV hai",
      email: "coach.two@example.test",
      phone: "0919996677",
      roleName: "COACH",
      status: "ACTIVE",
    });
    saveDemo(db);
    const updated = await api.saveClass(
      { ...created, coachId: 30, roomId: 2, maxCapacity: 25 },
      created.id,
    );
    expect(updated).toMatchObject({ coachId: 30, roomId: 2, maxCapacity: 25 });
    await api.cancelClass(created.id);
    expect(readDemo().classes.find((c) => c.id === created.id)?.status).toBe(
      "CANCELLED",
    );
  });
  it("rejects overlapping rooms/coaches but accepts an adjacent class", async () => {
    login("CENTER_MANAGER");
    const created = await api.saveClass(input());
    await expect(
      api.saveClass({
        ...input(),
        scheduleTime: `${localDate(addDays(5))}T14:30:00`,
      }),
    ).rejects.toThrow("Trùng lịch");
    await expect(
      api.saveClass({
        ...input(),
        scheduleTime: `${localDate(addDays(5))}T15:00:00`,
      }),
    ).resolves.toHaveProperty("id");
    expect(readDemo().classes.find((c) => c.id === created.id)).toBeDefined();
  });
  it("validates the assigned coach, room capacity, schedule and existing class", async () => {
    login("CENTER_MANAGER");
    await expect(api.saveClass({ ...input(), coachId: 10 })).rejects.toThrow(
      "HLV",
    );
    await expect(
      api.saveClass({ ...input(), maxCapacity: 999 }),
    ).rejects.toThrow("sức chứa phòng");
    await expect(
      api.saveClass({ ...input(), scheduleTime: "2020-01-01T10:00:00" }),
    ).rejects.toThrow("tương lai");
    await expect(
      api.saveClass({ ...input(), maxCapacity: 2.5 }),
    ).rejects.toThrow("không hợp lệ");
    await expect(api.saveClass(input(), 999999)).rejects.toThrow(
      "Không tìm thấy",
    );
  });
  it("does not reduce capacity below bookings and cancels related bookings without deleting them", async () => {
    login("CENTER_MANAGER");
    const created = await api.saveClass(input());
    const db = readDemo();
    db.bookings.push(
      ...[10, 11].map((memberId, i) => ({
        id: 80 + i,
        memberId,
        classId: created.id,
        status: "BOOKED",
        bookedAt: `${localDate()}T08:00:00`,
      })),
    );
    saveDemo(db);
    expect(await api.capacity(created.id)).toBe(13);
    await expect(
      api.saveClass({ ...created, maxCapacity: 1 }, created.id),
    ).rejects.toThrow("đã đăng ký");
    await api.cancelClass(created.id);
    expect(
      readDemo()
        .bookings.filter((b) => b.classId === created.id)
        .map((b) => b.status),
    ).toEqual(["CANCELLED", "CANCELLED"]);
  });
  it.each(["MEMBER", "COACH", "RECEPTIONIST"] as Role[])(
    "%s cannot create or cancel classes",
    async (role) => {
      login(role);
      await expect(api.saveClass(input())).rejects.toThrow("quyền");
      await expect(api.cancelClass(1)).rejects.toThrow("quyền");
    },
  );
  it("forces coach class scope and prevents reading another coach roster in demo", async () => {
    login("COACH");
    const db = readDemo();
    db.classes.push({ ...db.classes[0], id: 55, coachId: 99 });
    saveDemo(db);
    expect((await api.classes(99)).every((c) => c.coachId === 3)).toBe(true);
    await expect(api.bookings(undefined, 55)).rejects.toThrow("phạm vi");
  });
  it("manager creates a class using the form and sees the saved card", async () => {
    const user = userEvent.setup();
    const client = page("/classes?new=1", "CENTER_MANAGER");
    await user.type(
      await screen.findByLabelText("Tên lớp học"),
      "TEST tạo từ form",
    );
    await user.selectOptions(screen.getByLabelText("Bộ môn"), "1");
    await user.selectOptions(screen.getByLabelText("Phòng tập"), "1");
    await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "3");
    fireEvent.change(screen.getByLabelText("Ngày và giờ bắt đầu"), {
      target: { value: `${localDate(addDays(5))}T14:00` },
    });
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Tạo lớp học",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "TEST tạo từ form" }),
    ).toBeVisible();
    expect(
      readDemo().classes.some((c) => c.className === "TEST tạo từ form"),
    ).toBe(true);
    client.clear();
  });
  it("member views class details without querying the private class roster or exposing future booking actions", async () => {
    const bookings = vi.spyOn(api, "bookings");
    const user = userEvent.setup();
    const client = page("/classes", "MEMBER");
    await user.click(
      (await screen.findAllByRole("button", { name: "Xem lớp học" }))[0],
    );
    expect(
      within(await screen.findByRole("dialog")).getByRole("heading", {
        name: "Morning Yoga",
      }),
    ).toBeVisible();
    expect(bookings).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Đăng ký lớp học" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tạo lớp học" }),
    ).not.toBeInTheDocument();
    client.clear();
  });
  it("member schedule uses only active bookings, and all-class scope can show remaining classes", async () => {
    login("MEMBER");
    const db = readDemo();
    db.classes.forEach((c) => {
      c.scheduleTime = `${localDate()}T${c.id === 1 ? "08" : "10"}:00:00`;
    });
    db.bookings.push({
      id: 10,
      classId: 1,
      memberId: 10,
      status: "BOOKED",
      bookedAt: `${localDate()}T07:00:00`,
    });
    saveDemo(db);
    const user = userEvent.setup();
    const client = page("/schedule", "MEMBER");
    await user.click(await screen.findByRole("button", { name: "Danh sách" }));
    expect(
      await screen.findByRole("heading", { name: "Morning Yoga" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Full Body Strength" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Phạm vi lịch học"), "all");
    expect(
      await screen.findByRole("heading", { name: "Full Body Strength" }),
    ).toBeVisible();
    client.clear();
  });
  it("shows member schedule load errors instead of an empty schedule", async () => {
    vi.spyOn(api, "bookings").mockRejectedValue(
      new Error("Không tải được lịch cá nhân"),
    );
    const client = page("/schedule", "MEMBER");
    expect(
      await screen.findByText("Không tải được lịch cá nhân"),
    ).toBeVisible();
    client.clear();
  });
});

describe("Hợp đồng HTTP với backend main mới", () => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  async function liveModule(role: Role = "CENTER_MANAGER") {
    vi.resetModules();
    vi.stubEnv("VITE_DATA_MODE", "api");
    const session = demoSession(role);
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...session, mode: "api", token: "contract-test-jwt" }),
    );
    return (await import("../lib/api")).api;
  }
  it("loads real sport/room DTO names, never substitutes the demo catalog", async () => {
    const api = await liveModule();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json([{ id: 87, sportName: "Môn thật", description: "API" }]),
      )
      .mockResolvedValueOnce(
        json([{ id: 61, roomName: "Phòng thật", capacity: 14 }]),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await api.sports()).toEqual([
      { id: 87, name: "Môn thật", description: "API" },
    ]);
    expect(await api.rooms()).toEqual([
      { id: 61, name: "Phòng thật", capacity: 14, description: "" },
    ]);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/v1/sports",
      "/api/v1/rooms",
    ]);
  });
  it("uses the new JWT-scoped endpoint for coach teaching schedules", async () => {
    const api = await liveModule("COACH");
    const fetch = vi.fn().mockResolvedValue(json([]));
    vi.stubGlobal("fetch", fetch);
    await api.classes(999);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/classes/my-classes",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer contract-test-jwt",
        }),
      }),
    );
  });
  it("sends exact create/update/cancel endpoints and reads backend capacity", async () => {
    const api = await liveModule();
    const payload = input();
    const saved = { ...payload, id: 78 };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(saved, 201))
      .mockResolvedValueOnce(json({ ...saved, maxCapacity: 12 }))
      .mockResolvedValueOnce(json({ ...saved, status: "CANCELLED" }))
      .mockResolvedValueOnce(json(4));
    vi.stubGlobal("fetch", fetch);
    await api.saveClass(payload);
    await api.saveClass({ ...payload, maxCapacity: 12 }, 78);
    await api.cancelClass(78);
    expect(await api.capacity(78)).toBe(4);
    expect(fetch.mock.calls.map((c) => [c[0], c[1].method || "GET"])).toEqual([
      ["/api/v1/classes", "POST"],
      ["/api/v1/classes/78", "PUT"],
      ["/api/v1/classes/78/cancel", "POST"],
      ["/api/v1/classes/78/capacity", "GET"],
    ]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  });
  it("propagates backend validation failures instead of reporting a successful save", async () => {
    const api = await liveModule();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(json({ message: "Sức chứa không hợp lệ" }, 400)),
    );
    await expect(api.saveClass(input())).rejects.toThrow(
      "Sức chứa không hợp lệ",
    );
  });
});
