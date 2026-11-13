import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth";
import { demoSession } from "../lib/demo";
import type { Role, SportClass } from "../lib/types";
import { ToastProvider } from "../components/ui";
import { ClassDetail } from "../pages/Classes";

const clazz = (id: number): SportClass => ({ id, className: `Roster ${id}`, sportId: 1, roomId: 1,
  coachId: demoSession("COACH").user.id, maxCapacity: 10, scheduleTime: "2099-01-01T10:00:00",
  durationMinutes: 60, requiredAccessLevel: "STANDARD", status: "SCHEDULED" });
const student = (name = "Nguyễn Học Viên") => ({ memberId: 91, fullName: name, email: "fixture@example.com",
  phone: "0900000091", bookingStatus: "BOOKED", bookedAt: "2026-11-13T10:00:00" });
function mock(students: (id: number) => Promise<Response> = async () => Response.json([student()])) {
  const fetch = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url), match = path.match(/\/classes\/(\d+)\/(students|bookings)$/);
    if (match) return match[2] === "students" ? students(Number(match[1])) : Response.json([{ id: 17, memberId: 91, status: "BOOKED" }]);
    const detail = path.match(/\/classes\/(\d+)$/);
    if (detail) return Response.json(clazz(Number(detail[1])));
    if (path.endsWith("/capacity")) return Response.json(9);
    return Response.json([]);
  }); vi.stubGlobal("fetch", fetch); return fetch;
}
function page(role: Role) {
  const s = demoSession(role); sessionStorage.setItem("sportiva-session", JSON.stringify({ ...s, mode: "api", token: "inert-test-only" }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const node = (id: number) => <QueryClientProvider client={client}><AuthProvider><ToastProvider><MemoryRouter>
    <ClassDetail item={clazz(id)} onClose={() => {}} />
  </MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>;
  const view = render(node(1)); return { rerender: (id: number) => view.rerender(node(id)) };
}
describe("Class roster names from authorized students API", () => {
  it.each(["COACH", "RECEPTIONIST", "CENTER_MANAGER"] as Role[])("shows students names for %s without widening users access", async role => {
    const fetch = mock(); page(role);
    expect(await screen.findByText("Nguyễn Học Viên")).toBeVisible();
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith("/classes/1/students"))).toBe(true);
    if (role !== "CENTER_MANAGER") expect(fetch.mock.calls.some(([u]) => String(u) === "/api/v1/users")).toBe(false);
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith("/classes/1/bookings"))).toBe(false);
  });
  it("never loads or exposes the roster to Member", async () => {
    const fetch = mock(); page("MEMBER"); await screen.findByRole("heading", { name: "Roster 1" });
    expect(screen.queryByText("Danh sách đăng ký")).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => /\/(students|bookings)$/.test(String(u)))).toBe(false);
  });
  it("uses an explicit identifier fallback only when the student name is blank", async () => {
    mock(async () => Response.json([student("  ")])); page("COACH");
    expect(await screen.findByText("Thành viên #91")).toBeVisible();
  });
  it("shows a permission error and supports retry without a users fallback", async () => {
    let denied = true; const fetch = mock(async () => denied ? Response.json({}, { status: 403 }) : Response.json([student()]));
    page("COACH"); const alert = await screen.findByRole("alert"); expect(alert).toHaveTextContent("không có quyền");
    expect(screen.queryByText("Thành viên #91")).not.toBeInTheDocument(); denied = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Nguyễn Học Viên")).toBeVisible();
    expect(fetch.mock.calls.some(([u]) => String(u) === "/api/v1/users")).toBe(false);
  });
  it("shows loading while students are pending", async () => {
    let resolve!: (r: Response) => void; const pending = new Promise<Response>(r => { resolve = r; }); mock(() => pending); page("RECEPTIONIST");
    await screen.findByText("Danh sách đăng ký"); expect(screen.getByRole("status")).toBeVisible();
    await act(async () => resolve(Response.json([student()]))); expect(await screen.findByText("Nguyễn Học Viên")).toBeVisible();
  });
  it("does not show class A students after switching to class B", async () => {
    mock(async id => Response.json([student(id === 1 ? "Student A" : "Student B")])); const view = page("COACH");
    await screen.findByText("Student A"); view.rerender(2); await screen.findByText("Student B");
    expect(screen.queryByText("Student A")).not.toBeInTheDocument();
  });
});
