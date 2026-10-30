import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import ApiTraining from "../components/ApiTraining";

const users = [
  { id: 3, fullName: "HLV A", roleName: "COACH" },
  { id: 4, fullName: "HLV B", roleName: "COACH" },
  { id: 10, fullName: "Học viên A", roleName: "MEMBER" },
  { id: 11, fullName: "Học viên B", roleName: "MEMBER" },
];
const plan = { id: 21, coachId: 3, memberId: 10, title: "Giáo án cá nhân", description: "Bài tập cá nhân", createdAt: "2026-10-30T09:00:00" };
const classPlan = { ...plan, id: 22, memberId: null, classId: 8, title: "Giáo án lớp", description: "Nội dung riêng của lớp" };
const json = (value: unknown, status = 200) => Response.json(value, { status });
function ChangeAccount() {
  const { signIn } = useAuth();
  return <button onClick={() => signIn({ mode: "api", token: "test-only", user: { id: 11, fullName: "Member B", roleName: "MEMBER", status: "ACTIVE", email: "member-b@example.test", phone: "0900000011" } })}>Đổi tài khoản test</button>;
}
function mount(role = "CENTER_MANAGER") {
  sessionStorage.setItem("sportiva-session", JSON.stringify({ mode: "api", token: "test-only", user: { id: role === "MEMBER" ? 10 : 1, fullName: "Test", roleName: role, status: "ACTIVE" } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider><ChangeAccount /><MemoryRouter><ApiTraining /></MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
  return client;
}
function server() {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/v1/users") return json(users);
    if (path === "/api/v1/workout-plans/coach/3" || path === "/api/v1/workout-plans/member/10") return json([plan]);
    if (path === "/api/v1/workout-plans/class/8") return json([classPlan]);
    if (path === "/api/v1/members/10/bookings") return json([{ id: 1, memberId: 10, classId: 8, status: "BOOKED" }]);
    return json([]);
  });
}
describe("Tập luyện — phạm vi thành viên và đổi HLV, chỉ mock API", () => {
  it("clears the selected student when manager switches coaches", async () => {
    vi.stubGlobal("fetch", server()); mount(); const user = userEvent.setup();
    await screen.findByRole("button", { name: plan.title });
    await user.selectOptions(screen.getByLabelText("Học viên theo dõi"), "10");
    await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "4");
    expect(screen.getByLabelText("Học viên theo dõi")).toHaveValue("");
  });
  it("closes the old plan form when the coach selection changes", async () => {
    vi.stubGlobal("fetch", server()); mount(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sửa giáo án" }));
    expect(screen.getByLabelText("Tiêu đề kế hoạch")).toHaveValue(plan.title);
    fireEvent.change(screen.getByLabelText("Huấn luyện viên"), { target: { value: "4" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("includes class plans for a MEMBER's BOOKED classes", async () => {
    vi.stubGlobal("fetch", server()); mount("MEMBER");
    expect(await screen.findByRole("button", { name: classPlan.title })).toBeVisible();
    expect(screen.getByRole("button", { name: plan.title })).toBeVisible();
  });
  it("keeps personal plans when there are no bookings and hides member write controls", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/members/10/bookings") ? json([]) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); mount("MEMBER");
    await screen.findByRole("button", { name: plan.title });
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/workout-plans/class/"))).toBe(false);
    for (const name of ["Tạo kế hoạch", "Sửa giáo án", "Xóa giáo án", "Ghi kết quả buổi tập", "Ghi nhận xét"])
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
  it("loads unique BOOKED classes only, excludes another member and deduplicates plans by ID", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/members/10/bookings")) return json([
        { memberId: 10, classId: 8, status: "BOOKED" }, { memberId: 10, classId: 8, status: "BOOKED" },
        { memberId: 10, classId: 9, status: "BOOKED" }, { memberId: 10, classId: 12, status: "CANCELLED" },
        { memberId: 11, classId: 13, status: "BOOKED" },
      ]);
      if (String(url).endsWith("/workout-plans/class/8")) return json([plan, classPlan]);
      if (String(url).endsWith("/workout-plans/class/9")) return json([classPlan, { ...classPlan, id: 23, classId: 9, title: "Giáo án lớp thứ hai" }]);
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); mount("MEMBER");
    await screen.findByRole("button", { name: "Giáo án lớp thứ hai" });
    expect(screen.getAllByRole("button", { name: plan.title })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: classPlan.title })).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/workout-plans/class/8"))).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => /\/workout-plans\/class\/(12|13)$/.test(String(url)))).toBe(false);
  });
  it("keeps personal and successful class plans on one class error, and retries that class", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let failed = false;
    fetch.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/members/10/bookings")) return json([8, 9].map(classId => ({ memberId: 10, classId, status: "BOOKED" })));
      if (path.endsWith("/workout-plans/class/8") && !failed) { failed = true; return json({ message: "Lớp 8 tạm lỗi" }, 500); }
      if (path.endsWith("/workout-plans/class/9")) return json([{ ...classPlan, id: 23, title: "Lớp vẫn tải được" }]);
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); mount("MEMBER");
    await screen.findByText("Lớp 8 tạm lỗi"); await screen.findByRole("button", { name: "Lớp vẫn tải được" });
    expect(screen.getByRole("button", { name: plan.title })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("button", { name: classPlan.title })).toBeVisible();
  });
  it("keeps personal plans on booking error and retries bookings", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let failed = false;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/members/10/bookings") && !failed) { failed = true; return json({ message: "Không tải được booking" }, 403); }
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); mount("MEMBER"); await screen.findByText("Không tải được booking");
    expect(screen.getByRole("button", { name: plan.title })).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/workout-plans/class/"))).toBe(false);
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("button", { name: classPlan.title })).toBeVisible();
  });
  it("shows class plans even when personal plans fail", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/workout-plans/member/10") ? json({ message: "Lỗi giáo án cá nhân" }, 500) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); mount("MEMBER");
    expect(await screen.findByRole("button", { name: classPlan.title })).toBeVisible();
    expect(screen.getByText("Lỗi giáo án cá nhân")).toBeVisible();
  });
  it("keeps personal plans visible while a class is loading", async () => {
    let finish!: (value: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/workout-plans/class/8") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); mount("MEMBER"); await screen.findByRole("button", { name: plan.title });
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByText("Đang tải dữ liệu...")).toBeVisible();
    await act(async () => finish(json([classPlan])));
    expect(await screen.findByRole("button", { name: classPlan.title })).toBeVisible();
  });
  it("shows an empty plan list when all sources are empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([]))); mount("MEMBER");
    expect((await screen.findAllByRole("heading", { name: "Không có kết quả" })).length).toBeGreaterThan(0);
  });
  it("does not show late class results or the open detail from the prior account", async () => {
    let finish!: (value: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/workout-plans/class/8") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); const client = mount("MEMBER"); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: plan.title })); await waitFor(() => expect(finish).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Đổi tài khoản test" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => finish(json([classPlan])));
    expect(screen.queryByRole("button", { name: classPlan.title })).not.toBeInTheDocument();
    expect(client.getQueryCache().findAll({ queryKey: ["workout-plans", "class", 8, 11] })).toHaveLength(0);
  });
  it("hides the open class detail while bookings refetch and removes it after cancellation", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    let finish!: (value: Response) => void; let refetching = false;
    fetch.mockImplementation(async (url, init) => refetching && String(url).endsWith("/members/10/bookings")
      ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); const client = mount("MEMBER"); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: classPlan.title }));
    expect(screen.getByText(classPlan.description)).toBeVisible();
    refetching = true;
    let pending!: Promise<void>;
    act(() => { pending = client.invalidateQueries({ queryKey: ["bookings", 10] }); });
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.queryByText(classPlan.description)).not.toBeInTheDocument();
    await act(async () => { finish(json([{ memberId: 10, classId: 8, status: "CANCELLED" }])); await pending; });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: classPlan.title })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: plan.title }));
    expect(screen.getByText(plan.description)).toBeVisible();
  });
  it.each([200, 403])("does not retain the old class detail during refetch, then handles HTTP %s", async status => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    let finish!: (value: Response) => void; let refetching = false;
    fetch.mockImplementation(async (url, init) => refetching && String(url).endsWith("/workout-plans/class/8")
      ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); const client = mount("MEMBER"); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: classPlan.title }));
    expect(screen.getByText(classPlan.description)).toBeVisible(); refetching = true;
    let pending!: Promise<void>;
    act(() => { pending = client.invalidateQueries({ queryKey: ["workout-plans", "class", 8] }); });
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.queryByText(classPlan.description)).not.toBeInTheDocument();
    await act(async () => {
      finish(status === 200 ? json([{ ...classPlan, description: "Giáo án lớp mới đã xác minh" }]) : json({ message: "Không còn quyền xem lớp" }, 403));
      await pending;
    });
    if (status === 200) {
      expect(await screen.findByText("Giáo án lớp mới đã xác minh")).toBeVisible();
      expect(screen.queryByText(classPlan.description)).not.toBeInTheDocument();
    } else {
      await screen.findByText("Không còn quyền xem lớp");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: plan.title }));
      expect(screen.getByText(plan.description)).toBeVisible();
    }
  });
  it("does not reopen revoked class detail when a class response arrives after booking cancellation", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    let finish!: (value: Response) => void; let refetching = false; let cancelled = false;
    fetch.mockImplementation(async (url, init) => {
      if (cancelled && String(url).endsWith("/members/10/bookings")) return json([{ memberId: 10, classId: 8, status: "CANCELLED" }]);
      if (refetching && String(url).endsWith("/workout-plans/class/8")) return new Promise<Response>(resolve => { finish = resolve; });
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); const client = mount("MEMBER"); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: classPlan.title })); refetching = true;
    let pending!: Promise<void>;
    act(() => { pending = client.invalidateQueries({ queryKey: ["workout-plans", "class", 8] }); });
    await waitFor(() => expect(finish).toBeDefined()); cancelled = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ["bookings", 10] }); });
    await act(async () => { finish(json([{ ...classPlan, description: "Phản hồi lớp đến muộn" }])); await pending; });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(classPlan.description)).not.toBeInTheDocument();
    expect(screen.queryByText("Phản hồi lớp đến muộn")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: plan.title })).toBeVisible();
  });
  it.each(["detail", "delete", "log", "feedback"])("discards the old %s context when changing coach", async kind => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/workout-logs/coach/3") ? json([{ id: 31, coachId: 3, memberId: 10, createdAt: "2026-10-30T09:00:00", details: [], feedbackFromCoach: "Nhận xét A" }]) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); mount(); const user = userEvent.setup();
    await screen.findByRole("button", { name: plan.title });
    await user.click(await screen.findByRole("button", { name: ({ detail: plan.title, delete: "Xóa giáo án", log: "Ghi kết quả buổi tập", feedback: "Ghi nhận xét" })[kind] }));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Huấn luyện viên"), { target: { value: "4" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: plan.title })).not.toBeInTheDocument());
    expect(screen.queryByText("Nhận xét A")).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => ["POST", "PUT", "PATCH", "DELETE"].includes(init?.method || ""))).toBe(false);
  });
});
