import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const completedClass = {
  id: 8,
  className: "Fitness sáng",
  coachId: 3,
  scheduleTime: "2026-11-16T08:34:00",
  status: "COMPLETED",
};
const reviewedLog = {
  id: 41,
  coachId: 3,
  memberId: 10,
  scheduleId: 8,
  createdAt: "2026-11-30T18:10:00",
  details: [{ exerciseName: "Row", sets: 3, reps: 10, weightKg: 16 }],
  feedbackFromCoach: "Giữ lưng thẳng khi kéo",
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
function ChangeAccount() {
  const { signIn } = useAuth();
  return <button onClick={() => signIn({ mode: "api", token: "test-only", user: { id: 11, fullName: "Member B", roleName: "MEMBER", status: "ACTIVE", email: "member-b@example.test", phone: "0900000011" } })}>Đổi tài khoản test</button>;
}
function mount(role = "CENTER_MANAGER", path = "/training") {
  const id = users.find((user) => user.roleName === role)?.id ?? 1;
  sessionStorage.setItem("sportiva-session", JSON.stringify({ mode: "api", token: "test-only", user: { id, fullName: "Test", roleName: role, status: "ACTIVE" } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider><ChangeAccount /><MemoryRouter initialEntries={[path]}><ApiTraining /></MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
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
  it("opens the create plan form from the coach dashboard shortcut", async () => {
    vi.stubGlobal("fetch", server());
    mount("COACH", "/training?new=1");

    const form = await screen.findByRole("dialog", {
      name: "Tạo kế hoạch tập luyện",
    });
    expect(form).toBeVisible();
    await userEvent.setup().click(within(form).getByRole("button", { name: "Đóng" }));
    expect(form).not.toBeInTheDocument();
  });

  it("inserts a personal sport template without overwriting the coach's draft", async () => {
    const respond = server();
    vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) =>
      String(url) === "/api/v1/sports"
        ? json([{ id: 88, sportName: "Yoga" }])
        : respond(url, init),
    );
    mount("COACH", "/training?new=1");
    const form = await screen.findByRole("dialog", { name: "Tạo kế hoạch tập luyện" });
    const user = userEvent.setup();
    const content = within(form).getByLabelText<HTMLTextAreaElement>("Nội dung giáo án");
    await user.type(content, "Ghi chú của HLV.");
    await within(form).findByRole("option", { name: "Yoga" });
    await user.selectOptions(within(form).getByLabelText("Bộ môn để gợi ý bài tập"), "88");
    await user.click(within(form).getByRole("button", { name: "Chèn mẫu Yoga" }));
    expect(content.value).toContain("Ghi chú của HLV.\n\nYoga");
    expect(content.value).toContain("số giây");
  });

  it("records a non-Fitness result and filters progress by its unit after reloading", async () => {
    const swim = { ...completedClass, className: "Lớp bơi", sportId: 88 };
    const logs = [{
      ...reviewedLog,
      details: [{ exerciseName: "Bơi 50 m", metricValue: 2, metricUnit: "rounds" }],
    }];
    const respond = server();
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path === "/api/v1/sports") return json([{ id: 88, sportName: "Bơi lội" }]);
      if (path === "/api/v1/classes/my-classes") return json([swim]);
      if (path === "/api/v1/classes/8/students")
        return json([{ memberId: 10, fullName: "Học viên A", bookingStatus: "BOOKED" }]);
      if (path === "/api/v1/classes/8/bookings")
        return json([{ classId: 8, memberId: 10, status: "BOOKED" }]);
      if (path === "/api/v1/workout-logs" && init?.method === "POST") {
        const saved = { ...reviewedLog, ...JSON.parse(String(init.body)), id: 42 };
        logs.push(saved);
        return json(saved, 201);
      }
      if (path === "/api/v1/workout-logs/coach/3") return json(logs);
      return respond(url, init);
    });
    vi.stubGlobal("fetch", fetch);
    mount("COACH");
    const user = userEvent.setup();
    const open = screen.getByRole("button", { name: "Ghi kết quả buổi tập" });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    const form = within(screen.getByRole("dialog", { name: "Ghi kết quả buổi tập" }));
    await user.selectOptions(form.getByLabelText("Học viên"), "10");
    await form.findByRole("option", { name: /Lớp bơi/ });
    await user.selectOptions(form.getByLabelText("Buổi tập"), "8");
    expect(form.queryByLabelText("Mức tạ (kg)")).not.toBeInTheDocument();
    await user.type(form.getByLabelText("Tên bài tập"), "Bơi 50 m");
    await user.selectOptions(form.getByLabelText("Cách ghi kết quả"), "seconds");
    await user.type(form.getByLabelText("Kết quả (giây)"), "42.5");
    await user.click(form.getByRole("button", { name: "Lưu thay đổi" }));
    await screen.findByText("Bơi 50 m: 42.5 giây");
    expect(logs.at(-1)?.details).toEqual([
      { exerciseName: "Bơi 50 m", metricUnit: "seconds", metricValue: 42.5 },
    ]);

    await user.selectOptions(screen.getByLabelText("Học viên theo dõi"), "10");
    const progress = within(screen.getByRole("heading", { name: "Theo dõi tiến độ theo bài tập" }).closest("section")!);
    await user.selectOptions(progress.getByLabelText("Chỉ số theo dõi"), "seconds");
    expect(progress.getByRole("columnheader", { name: "Kết quả (giây)" })).toBeVisible();
    expect(progress.getByRole("cell", { name: "42.5" })).toBeVisible();
    expect(progress.getByRole("table")).not.toHaveTextContent("Kết quả (hiệp)");
    expect(progress.getAllByRole("row")).toHaveLength(2);
  });
  it("shows progress for the new student after selecting an exercise for the previous student", async () => {
    const logs = [
      {
        id: 31,
        coachId: 3,
        memberId: 10,
        createdAt: "2026-10-30T09:00:00",
        details: [
          { exerciseName: "Row", sets: 3, reps: 10, weightKg: 12 },
          { exerciseName: "Squat", sets: 3, reps: 10, weightKg: 22 },
        ],
      },
      {
        id: 32,
        coachId: 3,
        memberId: 11,
        createdAt: "2026-10-31T09:00:00",
        details: [{ exerciseName: "Plank", sets: 2, reps: 1, weightKg: 0 }],
      },
    ];
    const respond = server();
    vi.stubGlobal(
      "fetch",
      (url: RequestInfo | URL, init?: RequestInit) =>
        String(url).endsWith("/workout-logs/coach/3")
          ? json(logs)
          : respond(url, init),
    );
    mount();
    const user = userEvent.setup();
    await screen.findByText(/Plank: 2 hiệp/);
    const student = screen.getByLabelText("Học viên theo dõi");
    await user.selectOptions(student, "10");
    await user.selectOptions(screen.getByLabelText("Bài tập theo dõi"), "Squat");
    expect(screen.getByRole("row", { name: /3 10 22$/ })).toBeVisible();

    await user.selectOptions(student, "11");
    expect(screen.getByLabelText("Bài tập theo dõi")).toHaveValue("Plank");
    expect(screen.getByRole("row", { name: /2 1 0$/ })).toBeVisible();
  });
  it("links a log to an eligible class and clears the class when the coach changes students", async () => {
    const classes = [
      completedClass,
      { ...completedClass, id: 9, className: "Fitness chiều", scheduleTime: "2026-11-20T16:00:00" },
      { ...completedClass, id: 12, className: "Fitness đã hủy", status: "CANCELLED" },
    ];
    const respond = server();
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path === "/api/v1/classes/my-classes") return json(classes);
      if (path === "/api/v1/classes/8/students")
        return json([{ memberId: 10, fullName: "Học viên A", bookingStatus: "BOOKED" }]);
      if (path === "/api/v1/classes/9/students")
        return json([{ memberId: 11, fullName: "Học viên B", bookingStatus: "BOOKED" }]);
      if (path === "/api/v1/classes/8/bookings")
        return json([
          { classId: 8, memberId: 10, status: "BOOKED" },
          { classId: 8, memberId: 11, status: "CANCELLED" },
        ]);
      if (path === "/api/v1/classes/9/bookings")
        return json([
          { classId: 9, memberId: 10, status: "CANCELLED" },
          { classId: 9, memberId: 11, status: "BOOKED" },
        ]);
      if (path === "/api/v1/workout-logs" && init?.method === "POST")
        return json({ ...reviewedLog, memberId: 11, scheduleId: 9 }, 201);
      return respond(url, init);
    });
    vi.stubGlobal("fetch", fetch);
    mount("COACH");
    const user = userEvent.setup();
    const create = screen.getByRole("button", { name: "Ghi kết quả buổi tập" });
    await waitFor(() => expect(create).toBeEnabled());
    await user.click(create);

    const student = screen.getByLabelText("Học viên");
    const session = screen.getByLabelText("Buổi tập");
    await user.selectOptions(student, "10");
    await within(session).findByRole("option", { name: "Fitness sáng · 16/11/2026 08:34" });
    expect(within(session).queryByRole("option", { name: /Fitness chiều|Fitness đã hủy/ })).toBeNull();
    await user.selectOptions(session, "8");

    await user.selectOptions(student, "11");
    expect(session).toHaveValue("");
    const nextSession = await within(session).findByRole("option", {
      name: "Fitness chiều · 20/11/2026 16:00",
    });
    expect(within(session).queryByRole("option", { name: /Fitness sáng/ })).toBeNull();
    await user.selectOptions(session, nextSession);
    await user.type(screen.getByLabelText("Tên bài tập"), "Row");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const post = fetch.mock.calls.find(([url, init]) =>
      String(url) === "/api/v1/workout-logs" && init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      memberId: 11,
      coachId: 3,
      scheduleId: 9,
    });
    expect(fetch.mock.calls.some(([url]) =>
      String(url).endsWith("/classes/12/bookings") ||
      String(url).includes("/api/v1/members/"),
    )).toBe(false);
  });
  it("shows the linked session date next to a member's later feedback and renders unlinked logs", async () => {
    const respond = server();
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path === "/api/v1/classes") return json([completedClass]);
      if (path === "/api/v1/workout-logs/member/10") return json([
        reviewedLog,
        { ...reviewedLog, id: 42, scheduleId: null, feedbackFromCoach: "Nhận xét cũ" },
      ]);
      return respond(url, init);
    });
    mount("MEMBER");

    const row = await screen.findByRole("row", { name: /Fitness sáng.*Giữ lưng thẳng khi kéo/ });
    expect(within(row).getByText("Fitness sáng · 16/11/2026 08:34")).toBeVisible();
    expect(within(row).getByText("Ghi nhận 30/11/2026 18:10")).toBeVisible();
    const unlinked = screen.getByRole("row", { name: /Nhận xét cũ/ });
    expect(within(unlinked).getByText("Chưa gắn buổi học")).toBeVisible();
  });

  it("orders exercise progress by session date when older results are entered later", async () => {
    const respond = server();
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path === "/api/v1/classes") return json([
        completedClass,
        { ...completedClass, id: 9, scheduleTime: "2026-11-18T08:34:00" },
      ]);
      if (path === "/api/v1/workout-logs/member/10") return json([
        reviewedLog,
        { ...reviewedLog, id: 42, scheduleId: 9, createdAt: "2026-11-18T09:40:00",
          details: [{ exerciseName: "Row", sets: 3, reps: 10, weightKg: 20 }] },
      ]);
      return respond(url, init);
    });
    mount("MEMBER");

    const panel = (await screen.findByRole("heading", { name: "Theo dõi tiến độ theo bài tập" })).closest("section")!;
    await waitFor(() => {
      const rows = within(panel).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText("16/11/2026")).toBeVisible();
      expect(within(rows[0]).getByText("16")).toBeVisible();
      expect(within(rows[1]).getByText("18/11/2026")).toBeVisible();
      expect(within(rows[1]).getByText("20")).toBeVisible();
    });
  });

  it.each([null, 999])("labels the progress fallback as the recording date without a known session (%s)", async scheduleId => {
    const respond = server();
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path === "/api/v1/workout-logs/member/10") return json([{ ...reviewedLog, scheduleId }]);
      if (path === "/api/v1/classes/999") return json({ message: "Không tìm thấy buổi tập" }, 404);
      return respond(url, init);
    });
    mount("MEMBER");

    const panel = (await screen.findByRole("heading", { name: "Theo dõi tiến độ theo bài tập" })).closest("section")!;
    expect(within(panel).getByText("30/11/2026")).toBeVisible();
    expect(within(panel).getByText("Ngày ghi nhận")).toBeVisible();
  });

  it("shows the linked session in the coach feedback form after a class is reassigned", async () => {
    const respond = server();
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path === "/api/v1/classes/8") return json({ ...completedClass, coachId: 4 });
      if (path === "/api/v1/workout-logs/coach/3") return json([reviewedLog]);
      return respond(url, init);
    });
    mount("COACH");

    const row = await screen.findByRole("row", { name: /Fitness sáng.*Giữ lưng thẳng khi kéo/ });
    await userEvent.setup().click(within(row).getByRole("button", { name: "Ghi nhận xét" }));
    const form = screen.getByRole("dialog", { name: "Nhận xét kết quả buổi tập" });
    expect(within(form).getByText(/Fitness sáng · 16\/11\/2026 08:34/)).toBeVisible();
  });
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
    vi.stubGlobal("fetch", fetch); mount("MEMBER", "/training?new=1");
    await screen.findByRole("button", { name: plan.title });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
