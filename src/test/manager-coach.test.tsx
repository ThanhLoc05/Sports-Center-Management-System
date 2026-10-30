/** Kiểm thử UX và hợp đồng API của các màn Manager/Coach; không ghi DB thật. */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { operations } from "../lib/operations-api";
import { api } from "../lib/api";
import { ApiProfileEditor } from "../components/ApiProfileEditor";
import ApiTraining from "../components/ApiTraining";
import ApiNotifications from "../components/ApiNotifications";
import ApiStudents from "../components/ApiStudents";
import { PendingEditor } from "../components/PendingEditor";
vi.mock("../lib/use-coach-data", () => ({
  useAssignedStudents: () => ({
    data: [
      {
        memberId: 10,
        fullName: "Học viên TEST",
        email: "student@example.test",
        phone: "0900000000",
        fitnessGoals: "Tăng sức mạnh",
        bookingStatus: "BOOKED",
      },
    ],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
});
function login(role = "COACH") {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-only",
      user: {
        id: role === "COACH" ? 3 : 1,
        fullName: "TEST",
        email: "actor@example.test",
        phone: "0900000001",
        status: "ACTIVE",
        roleName: role,
      },
    }),
  );
}
function wrap(node: React.ReactNode, role = "COACH") {
  login(role);
  const c = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(c);
  return render(
    <QueryClientProvider client={c}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>{node}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
const plan = {
  id: 1,
  coachId: 3,
  memberId: 10,
  title: "Giáo án TEST",
  description: "Khởi động và squat",
  createdAt: "2026-10-30T09:00:00",
};
const log = {
  id: 2,
  coachId: 3,
  memberId: 10,
  feedbackFromCoach: "",
  createdAt: "2026-10-30T09:00:00",
  details: [{ id: 1, exerciseName: "Squat", sets: 3, reps: 10, weightKg: 20 }],
};
describe("Manager và Coach — UX và ghi dữ liệu", () => {
  it("uses the BE plan DTO and rejects writes by a member", async () => {
    login();
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json(plan),
    );
    vi.stubGlobal("fetch", fetch);
    await operations.savePlan({
      coachId: 3,
      classId: 8,
      title: "Lớp TEST",
      description: "Bài tập cả lớp",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/workout-plans",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          coachId: 3,
          classId: 8,
          title: "Lớp TEST",
          description: "Bài tập cả lớp",
        }),
      }),
    );
    login("MEMBER");
    expect(() =>
      operations.savePlan({
        coachId: 3,
        memberId: 10,
        title: "Sai quyền",
        description: "Không được ghi",
      }),
    ).toThrow("quyền");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid workout results without sending HTTP", () => {
    login();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() =>
      operations.saveLog({
        memberId: 10,
        coachId: 3,
        details: [{ exerciseName: "Squat", sets: -1 }],
      }),
    ).toThrow("bài tập");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("creates a personal plan from the existing form components", async () => {
    const calls = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).endsWith("/workout-plans") && init?.method === "POST"
        ? json(plan, 201)
        : json([]),
    );
    vi.stubGlobal("fetch", calls);
    wrap(<ApiTraining />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tạo kế hoạch" }));
    await user.type(screen.getByLabelText("Tiêu đề kế hoạch"), "Giáo án TEST");
    await user.selectOptions(
      screen.getByLabelText("Học viên nhận kế hoạch"),
      "10",
    );
    await user.type(
      screen.getByLabelText("Nội dung giáo án"),
      "Khởi động và squat",
    );
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(
        calls.mock.calls.some(
          ([url, init]) =>
            url === "/api/v1/workout-plans" &&
            init?.method === "POST" &&
            JSON.parse(String(init.body)).memberId === 10,
        ),
      ).toBe(true),
    );
  });
  it("records multiple result fields as details, without inventing a schedule id", async () => {
    const calls = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? json(log, 201) : json([]),
    );
    vi.stubGlobal("fetch", calls);
    wrap(<ApiTraining />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Ghi kết quả buổi tập" }),
    );
    await user.selectOptions(screen.getByLabelText("Học viên"), "10");
    await user.type(screen.getByLabelText("Tên bài tập"), "Squat");
    await user.type(screen.getByLabelText("Số hiệp"), "3");
    await user.type(screen.getByLabelText("Số lần mỗi hiệp"), "10");
    await user.type(screen.getByLabelText("Mức tạ (kg)"), "20");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(calls.mock.calls.some(([, i]) => i?.method === "POST")).toBe(true),
    );
    const payload = JSON.parse(
      String(calls.mock.calls.find(([, i]) => i?.method === "POST")?.[1]?.body),
    );
    expect(payload.details).toEqual([
      { exerciseName: "Squat", sets: 3, reps: 10, weightKg: 20 },
    ]);
    expect(payload).not.toHaveProperty("scheduleId");
  });
  it("saves feedback with the encoded BE query parameter", async () => {
    login();
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json(log),
    );
    vi.stubGlobal("fetch", fetch);
    await operations.feedback(2, "Tiến bộ & cố gắng");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/workout-logs/2/feedback?feedback=" +
        encodeURIComponent("Tiến bộ & cố gắng"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
  it("retries role assignment without registering an employee twice", async () => {
    const created = {
      id: 30,
      fullName: "HLV mới",
      email: "new@example.test",
      phone: "0911111111",
      roleName: "MEMBER" as const,
      status: "ACTIVE",
    };
    const register = vi.spyOn(api, "register").mockResolvedValue(created);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "Chưa gán được vai trò" }, 500))
      .mockResolvedValueOnce(json({ ...created, roleName: "COACH" }));
    vi.stubGlobal("fetch", fetch);
    wrap(<ApiProfileEditor team onClose={() => {}} />, "CENTER_MANAGER");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Họ và tên"), "HLV mới");
    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Điện thoại"), "0911111111");
    await user.type(screen.getByLabelText("Mật khẩu ban đầu"), "test-password");
    await user.click(
      screen.getByRole("button", { name: "Tạo tài khoản nhân viên" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gán được");
    await user.click(
      screen.getByRole("button", { name: "Gán vai trò cho tài khoản đã tạo" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(register).toHaveBeenCalledTimes(1);
  });
  it("shows actual goals and loads the profile for the selected student", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json({
        memberId: 10,
        address: "Địa chỉ TEST",
        fitnessGoals: "Mục tiêu từ API",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    wrap(<ApiStudents />);
    expect(screen.getByText("Tăng sức mạnh")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Học viên TEST" }),
    );
    expect(await screen.findByText("Mục tiêu từ API")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/10/profile",
      expect.anything(),
    );
  });
  it("previews a class notification but never claims it was sent without a BE endpoint", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json([{ id: 8, className: "Lớp TEST", coachId: 3, status: "SCHEDULED" }]),
    );
    vi.stubGlobal("fetch", fetch);
    wrap(<ApiNotifications />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Soạn thông báo / bài tập" }),
    );
    await screen.findByRole("option", { name: "Lớp TEST" });
    await user.selectOptions(screen.getByLabelText("Lớp nhận thông báo"), "8");
    await user.type(screen.getByLabelText("Tiêu đề"), "Bài tập TEST");
    await user.type(
      screen.getByLabelText("Nội dung / bài tập về nhà"),
      "Khởi động trước khi tập",
    );
    await user.click(
      screen.getByRole("button", { name: "Xem trước nội dung" }),
    );
    expect(
      await screen.findByRole("button", { name: "Gửi thông báo" }),
    ).toBeDisabled();
    expect(
      fetch.mock.calls.every(([, i]) => !i || !i.method || i.method === "GET"),
    ).toBe(true);
  });
  it("keeps unsupported fee changes in review without mutating the server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    wrap(
      <PendingEditor
        title="Chỉnh học phí"
        fields={[
          { name: "price", label: "Học phí", type: "number", value: 800000 },
        ]}
        onClose={() => {}}
      />,
      "CENTER_MANAGER",
    );
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Học phí"));
    await user.type(screen.getByLabelText("Học phí"), "900000");
    await user.click(screen.getByRole("button", { name: "Xem lại thay đổi" }));
    expect(screen.getByText("900000")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
