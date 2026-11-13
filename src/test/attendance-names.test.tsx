import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Attendance from "../pages/Attendance";
import { AuthProvider } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { operations } from "../lib/operations-api";
import { demoSession, readDemo } from "../lib/demo";
import { ToastProvider } from "../components/ui";
import { localDate } from "../lib/utils";
import type { Role } from "../lib/types";

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));
afterEach(() => vi.unstubAllEnvs());

const pendingName = "Nguyễn An Học Viên";
const historyName = "Trần Bình Học Viên";

function setup(role: Role = "COACH", live = true) {
  if (live) vi.stubEnv("VITE_DATA_MODE", "api");
  const session = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify({
    ...session, token: live ? "test-only" : session.token, mode: live ? "api" : "demo",
  }));
  const first = { ...readDemo().classes[0], id: 701, coachId: session.user.id, className: "Assigned first" };
  const second = { ...first, id: 702, className: "Assigned second" };
  vi.spyOn(api, "classes").mockResolvedValue([first, second]);
  vi.spyOn(api, "bookings").mockResolvedValue([
    { id: 801, classId: first.id, memberId: 901, status: "BOOKED", bookedAt: `${localDate()}T08:00:00` },
    { id: 802, classId: first.id, memberId: 902, status: "BOOKED", bookedAt: `${localDate()}T08:00:00` },
  ]);
  const attendance = vi.spyOn(api, "attendance").mockResolvedValue([
    { id: 803, classId: first.id, memberId: 902, checkedInBy: session.user.id, checkedInAt: `${localDate()}T09:00:00`, status: "PRESENT" },
  ]);
  const users = vi.spyOn(api, "users").mockResolvedValue([
    { ...session.user, id: 901, fullName: pendingName, roleName: "MEMBER" },
    { ...session.user, id: 902, fullName: historyName, roleName: "MEMBER" },
  ]);
  const students = vi.spyOn(operations, "students").mockResolvedValue([
    { memberId: 901, fullName: pendingName, email: "fixture-one@example.test", phone: "0900000901", bookingStatus: "BOOKED", bookedAt: "" },
    { memberId: 902, fullName: historyName, email: "fixture-two@example.test", phone: "0900000902", bookingStatus: "BOOKED", bookedAt: "" },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const mount = () => render(<QueryClientProvider client={client}><AuthProvider><ToastProvider>
    <MemoryRouter><Attendance /></MemoryRouter>
  </ToastProvider></AuthProvider></QueryClientProvider>);
  return { mount, students, users, attendance, session, first, second };
}

describe("Attendance student names stay within each role's API access", () => {
  it("uses the selected class roster for Coach names and history search without /users", async () => {
    const { mount, students, users } = setup();
    mount();
    expect(await screen.findByText(pendingName, { selector: "strong" })).toBeVisible();
    expect(await screen.findByText(historyName, { selector: "strong" })).toBeVisible();
    expect(students).toHaveBeenCalledWith(701);
    expect(users).not.toHaveBeenCalled();
    await userEvent.setup().type(screen.getByPlaceholderText("Tìm thành viên..."), historyName);
    expect(screen.getByRole("row", { name: new RegExp(historyName) })).toBeVisible();
  });

  it("loads only the selected class and changes names when Coach changes class", async () => {
    const { mount, students, users } = setup();
    students.mockImplementation(async classId => [{ memberId: 901, fullName: classId === 701 ? pendingName : "Tên tại lớp thứ hai", email: "fixture@example.test", phone: "0900000901", bookingStatus: "BOOKED", bookedAt: "" }]);
    mount();
    await screen.findByText(pendingName, { selector: "strong" });
    expect(students).not.toHaveBeenCalledWith(702);
    await userEvent.setup().selectOptions(screen.getByLabelText("Lớp cần điểm danh"), "702");
    expect(await screen.findByText("Tên tại lớp thứ hai", { selector: "strong" })).toBeVisible();
    expect(screen.queryByText(pendingName, { selector: "strong" })).not.toBeInTheDocument();
    expect(users).not.toHaveBeenCalled();
  });

  it("keeps the ID fallback for a missing Coach roster name", async () => {
    const { mount, students, users } = setup();
    students.mockResolvedValue([]);
    mount();
    expect(await screen.findByText("Thành viên #901", { selector: "strong" })).toBeVisible();
    await waitFor(() => expect(students).toHaveBeenCalledWith(701));
    expect(users).not.toHaveBeenCalled();
  });

  it("reports a Coach roster load error and can retry without opening /users", async () => {
    const { mount, students, users } = setup();
    students.mockRejectedValueOnce(new ApiError("Roster names unavailable", 503));
    mount();
    expect(await screen.findByText("Roster names unavailable")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(pendingName, { selector: "strong" })).toBeVisible();
    expect(users).not.toHaveBeenCalled();
  });

  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])("preserves %s user-name mapping and search", async role => {
    const { mount, students, users } = setup(role);
    mount();
    expect(await screen.findByText(pendingName, { selector: "strong" })).toBeVisible();
    await userEvent.setup().type(screen.getByPlaceholderText("Tìm thành viên..."), historyName);
    expect(within(screen.getByRole("table")).getByText(historyName)).toBeVisible();
    expect(users).toHaveBeenCalled();
    expect(students).not.toHaveBeenCalled();
  });

  it("does not request a class roster or user catalogue for Member history", async () => {
    const { mount, attendance, students, users, session } = setup("MEMBER");
    mount();
    await screen.findByRole("heading", { name: "Lịch sử điểm danh" });
    await waitFor(() => expect(attendance.mock.calls.some(call => call[0] === session.user.id && call[1] === undefined)).toBe(true));
    expect(students).not.toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
  });

  it("preserves the existing demo Coach name source", async () => {
    const { mount, students } = setup("COACH", false);
    mount();
    expect(await screen.findByText(pendingName, { selector: "strong" })).toBeVisible();
    expect(students).not.toHaveBeenCalled();
  });
});
