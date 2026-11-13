import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { demoSession, readDemo } from "../lib/demo";
import { localDate } from "../lib/utils";
import { ToastProvider } from "../components/ui";
import type { Role } from "../lib/types";

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));
afterEach(() => vi.unstubAllEnvs());

function page(path: string, role: Role, live = false) {
  if (live) vi.stubEnv("VITE_DATA_MODE", "api");
  const session = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify({ ...session, token: live ? "test-only" : session.token, mode: live ? "api" : "demo" }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider>
    <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
  </ToastProvider></AuthProvider></QueryClientProvider>);
  return { client, session };
}

describe("Coach/Member booking and navigation scope", () => {
  it("filters member bookings locally without calling the private roster", async () => {
    const db = readDemo();
    const booking = vi.spyOn(api, "bookings").mockResolvedValue(db.classes.slice(0, 2).map((c, i) => ({
      id: 900 + i, classId: c.id, memberId: demoSession("MEMBER").user.id,
      status: "BOOKED", bookedAt: `${localDate()}T07:00:00`,
    })));
    const { session } = page("/bookings?memberId=999", "MEMBER");
    await screen.findByText(db.classes[0].className, { selector: "strong" });
    await userEvent.setup().selectOptions(screen.getByLabelText("Lọc theo lớp học"), String(db.classes[0].id));
    expect(screen.queryByText(db.classes[1].className, { selector: "strong" })).not.toBeInTheDocument();
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
    await waitFor(() => expect(booking).toHaveBeenCalledWith(10, undefined));
    expect(screen.getByText("ID thành viên")).toBeVisible();
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
    expect(await screen.findByText(/Public Coach Name/, { selector: "p" })).toBeVisible();
    expect(coaches).toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: c.className }));
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
});
