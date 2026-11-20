import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api, getSession } from "../lib/api";
import { AuthProvider, useAuth } from "../lib/auth";
import { demoSession } from "../lib/demo";
import { ToastProvider } from "../components/ui";
import type { Feedback, Role } from "../lib/types";
import App from "../App";

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));
const comment: Feedback = { id: 71, fromUserId: 3, toUserId: 10, classId: null, rating: null, comment: "Nhận xét tiếng Việt", type: "COACH_TO_MEMBER", createdAt: "2026-10-30T10:00:00" };
const json = (data: unknown, status = 200) => Response.json(data, { status });
function login(role: Role, id = role === "MEMBER" ? 10 : role === "COACH" ? 3 : 1) {
  const demo = demoSession(role);
  return { ...demo, mode: "api" as const, token: "feedback-test-only", user: { ...demo.user, id } };
}
function SwapAccount() {
  const { signIn } = useAuth();
  return <button onClick={() => signIn(login("MEMBER", 11))}>Đổi người dùng test</button>;
}
function page(role: Role = "MEMBER", swap = false, demo = false) {
  sessionStorage.setItem("sportiva-session", JSON.stringify(demo ? demoSession(role) : login(role)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider>{swap && <SwapAccount />}
    <MemoryRouter initialEntries={["/feedback"]}><App /></MemoryRouter>
  </ToastProvider></AuthProvider></QueryClientProvider>);
  return client;
}
function server(initial: Feedback[] = [comment]) {
  const rows = [...initial];
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/v1/feedbacks" && init?.method === "POST") {
      const input = JSON.parse(String(init.body)), actor = getSession()!.user;
      const created = { ...comment, ...input, id: 72 + rows.length, fromUserId: actor.id, toUserId: input.toUserId ?? null, classId: input.classId ?? null,
        type: actor.roleName === "COACH" ? "COACH_TO_MEMBER" : input.classId ? "CLASS_FEEDBACK" : "MEMBER_TO_COACH" };
      rows.push(created); return json(created, 201);
    }
    if (path.endsWith("/classes")) return json([{ id: 8, className: "Lớp bơi" }, { id: 18, className: "Lớp bơi" }]);
    if (path.endsWith("/users")) return json([
      { id: 10, roleName: "MEMBER", fullName: "Thành Đạt" },
      { id: 20, roleName: "MEMBER", fullName: "Thành Đạt" },
      { id: 3, roleName: "COACH", fullName: "Trần Minh" },
    ]);
    if (path.endsWith("/users/coaches")) {
      return json([3, 12].map(coachId => ({
        coachId, fullName: "Trần Minh", professionalLevel: null, specialties: null, bio: null,
      })));
    }
    const kind = new URL(path, "http://localhost").searchParams.get("kind");
    if (kind) {
      const type = { coach: "MEMBER_TO_COACH", class: "CLASS_FEEDBACK", member: "COACH_TO_MEMBER" }[kind];
      const actor = getSession()!.user;
      return json(rows.filter(row => row.type === type && (kind !== "member" || actor.roleName !== "MEMBER" || row.toUserId === actor.id)));
    }
    const match = path.match(/\/feedbacks\/(coach|class|member)\/(\d+)$/);
    if (match) {
      const id = Number(match[2]); const list = rows.filter(f => match[1] === "class" ? f.classId === id : f.toUserId === id);
      return json(match[1] === "coach" ? { coachId: id, averageRating: list.length ? 4.5 : 0, totalReviews: list.length, feedbacks: list } : list);
    }
    return json([]);
  });
}
async function createForm(role: "MEMBER" | "COACH", target: "coach" | "class" = "coach") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: role === "COACH" ? "Nhận xét thành viên" : "Viết đánh giá" }));
  const dialog = screen.getByRole("dialog");
  if (role === "MEMBER") await user.selectOptions(within(dialog).getByLabelText("Đối tượng đánh giá"), target);
  if (role === "MEMBER" && target === "coach") {
    await user.selectOptions(await within(dialog).findByLabelText("Chọn huấn luyện viên"), "3");
  } else {
    await user.clear(within(dialog).getByRole("spinbutton"));
    await user.type(within(dialog).getByRole("spinbutton"), role === "COACH" ? "10" : "8");
  }
  await user.type(within(dialog).getByLabelText("Nội dung đánh giá"), "Đánh giá Unicode — rất tốt");
  return { user, dialog };
}
describe("Feedback — contract và UI, chỉ mock API", () => {
  it("shows unrated coaches and distinguishes coaches sharing a name", async () => {
    const fetch = server([{ ...comment, type: "MEMBER_TO_COACH", toUserId: 3, targetName: "Trần Minh" }]);
    vi.stubGlobal("fetch", fetch); page("RECEPTIONIST"); const user = userEvent.setup();
    const field = await screen.findByRole("combobox", { name: "Tìm theo tên hoặc ID" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(field);
    expect(await screen.findByRole("option", { name: "Trần Minh · #12" })).toBeVisible();
    await user.type(field, "tran minh");
    await user.click(screen.getByRole("option", { name: "Trần Minh · #12" }));
    expect(field).toHaveValue("Trần Minh");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(await screen.findByText("Huấn luyện viên này chưa có đánh giá.")).toBeVisible();
    await user.click(field);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByRole("cell", { name: comment.comment })).toBeVisible();
    await user.clear(field);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Tổng đánh giá: 1/)).toBeVisible();
  });
  it.each([
    ["class", "Lớp bơi", "lop boi", 8, 18, "Lớp học này chưa có đánh giá."],
    ["member", "Thành Đạt", "thanh dat", 10, 20, "Thành viên này chưa có nhận xét."],
  ] as const)("selects %s by name even without prior feedback", async (kind, name, term, id, other, empty) => {
    vi.stubGlobal("fetch", server([{ ...comment, classId: 8, type: kind === "class" ? "CLASS_FEEDBACK" : "COACH_TO_MEMBER" }]));
    page("RECEPTIONIST"); const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Loại dữ liệu"), kind);
    const field = screen.getByRole("combobox", { name: "Tìm theo tên hoặc ID" });
    await user.click(field);
    expect(await screen.findByRole("option", { name: name + " · #" + id })).toBeVisible();
    await user.type(field, term);
    await user.click(screen.getByRole("option", { name: name + " · #" + other }));
    expect(field).toHaveValue(name);
    expect(await screen.findByText(empty)).toBeVisible();
    await user.click(field);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByRole("cell", { name: comment.comment })).toBeVisible();
  });
  it("only suggests the signed-in member for private feedback", async () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page("MEMBER");
    await userEvent.setup().click(await screen.findByRole("combobox", { name: "Tìm theo tên hoặc ID" }));
    const list = await screen.findByRole("listbox");
    expect(await within(list).findByRole("option", { name: /#10$/ })).toBeVisible();
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/users"))).toBe(false);
  });
  it("member reads received feedback with null rating and no management actions", async () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page();
    expect(await screen.findByText(comment.comment)).toBeVisible();
    expect(screen.getByText("Không chấm điểm")).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url) === "/api/v1/feedbacks?kind=member")).toBe(true);
    for (const name of ["Sửa đánh giá", "Xóa đánh giá", "Duyệt đánh giá"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
  it.each(["coach", "class"] as const)("member sends %s feedback with correct DTO, then reads server data", async target => {
    const fetch = server([]); vi.stubGlobal("fetch", fetch); page(); const { user, dialog } = await createForm("MEMBER", target);
    await user.selectOptions(within(dialog).getByLabelText("Điểm đánh giá (không bắt buộc)"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Gửi đánh giá" }));
    expect(await screen.findByText("Đã gửi đánh giá.")).toBeVisible();
    expect(await screen.findByText("Đánh giá Unicode — rất tốt")).toBeVisible();
    const body = JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body));
    expect(body).toEqual({ ...(target === "class" ? { classId: 8 } : { toUserId: 3 }), rating: 5, comment: "Đánh giá Unicode — rất tốt" });
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/bookings"))).toBe(false);
  });
  it("coach sends member feedback but never requests forbidden member list", async () => {
    const fetch = server([]); vi.stubGlobal("fetch", fetch); page("COACH"); const { user, dialog } = await createForm("COACH");
    await user.click(within(dialog).getByRole("button", { name: "Gửi nhận xét" }));
    expect(await screen.findByText("Đã gửi nhận xét thành viên.")).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("kind=member"))).toBe(false);
    expect(JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body))).toEqual({ toUserId: 10, rating: null, comment: "Đánh giá Unicode — rất tốt" });
    expect(screen.queryByRole("option", { name: "Nhận xét thành viên" })).not.toBeInTheDocument();
  });
  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])("%s reads coach summary, class and member lists without write actions", async role => {
    const cases = [
      { kind: "coach", name: "Nguyễn Minh Tuấn", search: "minh tuan", type: "MEMBER_TO_COACH" },
      { kind: "class", name: "Bóng rổ", search: "bong ro", type: "CLASS_FEEDBACK" },
      { kind: "member", name: "Lê Thị Hà", search: "thi ha", type: "COACH_TO_MEMBER" },
    ] as const;
    const fetch = server(cases.flatMap((c, i) => [c.name, "Đối tượng khác"].map((targetName, j) => ({
      ...comment, id: 70 + i * 2 + j, type: c.type, targetName, senderName: "Người gửi", rating: 4,
    }))));
    vi.stubGlobal("fetch", fetch); page(role); const user = userEvent.setup();
    for (const c of cases) {
      await user.selectOptions(screen.getByLabelText("Loại dữ liệu"), c.kind);
      expect(await screen.findByRole("cell", {name:c.name})).toBeVisible();
      expect(screen.getByRole("cell", {name:"Đối tượng khác"})).toBeVisible();
      const field = screen.getByLabelText("Tìm theo tên hoặc ID");
      await user.type(field, c.search);
      await user.click(screen.getByRole("button", { name: "Tìm kiếm" }));
      expect(screen.getByRole("cell", {name:c.name})).toBeVisible();
      expect(screen.queryByRole("cell", {name:"Đối tượng khác"})).not.toBeInTheDocument();
      await user.clear(field);
      expect(screen.getByRole("cell", {name:"Đối tượng khác"})).toBeVisible();
    }
    expect(fetch.mock.calls.some(([, init]) => ["POST", "PUT", "PATCH", "DELETE"].includes(init?.method || ""))).toBe(false);
  });
  it("shows loading and empty state without demo fallback", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/feedbacks?kind=member") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); expect(screen.getByText("Đang tải dữ liệu...")).toBeVisible();
    await act(async () => finish(json([]))); expect(await screen.findByRole("heading", { name: "Không có kết quả" })).toBeVisible();
  });
  it.each([400, 403, 500, 0])("shows GET error %s and retries", async status => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let fail = true;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/feedbacks?kind=member") && fail) { fail = false; if (!status) throw Error("offline"); return json({ message: "Lỗi tải đánh giá" }, status); }
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); page(); await screen.findByRole("alert"); await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(comment.comment)).toBeVisible();
  });
  it("handles 401 with the existing login redirect", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).includes("/feedbacks?") ? json({}, 401) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); await waitFor(() => expect(getSession()).toBeNull());
    expect(await screen.findByRole("button", { name: "Đăng nhập" })).toBeVisible();
  });
  it.each([400, 403, 500, 0])("keeps the form and avoids success on POST error %s", async status => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => { if (init?.method === "POST") { if (!status) throw Error("offline"); return json({ message: "Không gửi được đánh giá" }, status); } return fallback(url, init); });
    vi.stubGlobal("fetch", fetch); page(); const { user, dialog } = await createForm("MEMBER");
    await user.click(within(dialog).getByRole("button", { name: "Gửi đánh giá" }));
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    expect(within(dialog).getByLabelText("Nội dung đánh giá")).toHaveValue("Đánh giá Unicode — rất tốt");
    expect(screen.queryByText("Đã gửi đánh giá.")).not.toBeInTheDocument();
  });
  it("blocks duplicate submission while pending but permits another feedback after success", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => init?.method === "POST" ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); const { user, dialog } = await createForm("MEMBER"); await user.dblClick(within(dialog).getByRole("button", { name: "Gửi đánh giá" }));
    expect(within(dialog).getByRole("button", { name: "Gửi đánh giá" })).toBeDisabled();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => finish(json({ ...comment, id: 73, fromUserId: 10, toUserId: 3, type: "MEMBER_TO_COACH" }, 201)));
    await screen.findByText("Đã gửi đánh giá.");
    const next = await createForm("MEMBER"); await next.user.click(within(next.dialog).getByRole("button", { name: "Gửi đánh giá" }));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
    await act(async () => finish(json({ ...comment, id: 74, fromUserId: 10, toUserId: 3, type: "MEMBER_TO_COACH" }, 201)));
  });
  it("does not display an old lookup response after changing target", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/feedbacks?kind=coach") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page("CENTER_MANAGER"); const user = userEvent.setup();
    await waitFor(() => expect(finish).toBeDefined());
    await user.selectOptions(screen.getByLabelText("Loại dữ liệu"), "class");
    await act(async () => finish(json([{ ...comment, type: "MEMBER_TO_COACH", comment: "Phản hồi HLV cũ" }])));
    expect(screen.queryByText("Phản hồi HLV cũ")).not.toBeInTheDocument();
  });
  it("does not retain the old account's form or late feedback list", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/feedbacks?kind=member") && getSession()?.user.id === 10 ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page("MEMBER", true); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Viết đánh giá" })); await waitFor(() => expect(finish).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Đổi người dùng test" })); await act(async () => finish(json([comment])));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.queryByText(comment.comment)).not.toBeInTheDocument();
  });
  it.each([0, 6, 1.5])("rejects invalid rating %s without HTTP", async rating => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(login("MEMBER"))); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(api.createFeedback({ toUserId: 3, rating, comment: "Hợp lệ" })).rejects.toThrow("1 đến 5"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])("blocks %s from posting even outside UI", async role => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(login(role))); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(api.createFeedback({ toUserId: 3, comment: "Không cho phép" })).rejects.toThrow("không được gửi"); expect(fetch).not.toHaveBeenCalled();
  });
  it("strips spoofed sender/type and accepts optional rating", async () => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(login("MEMBER"))); const fetch = server(); vi.stubGlobal("fetch", fetch);
    await api.createFeedback({ toUserId: 3, comment: "Nội dung", ...{ fromUserId: 999, type: "COACH_TO_MEMBER" } });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ toUserId: 3, rating: null, comment: "Nội dung" });
  });
  it("rejects blank comment, invalid IDs and forbidden member read", async () => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(login("MEMBER"))); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(api.createFeedback({ toUserId: 3, comment: "   " })).rejects.toThrow("trống");
    await expect(api.classFeedback(0)).rejects.toThrow("ID"); await expect(api.memberFeedback(11)).rejects.toThrow("quyền");
    sessionStorage.setItem("sportiva-session", JSON.stringify(login("COACH")));
    await expect(api.memberFeedback(10)).rejects.toThrow("quyền"); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed responses instead of showing fake success", async () => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(login("MEMBER"))); vi.stubGlobal("fetch", vi.fn(async () => json({ content: [] })));
    await expect(api.classFeedback(8)).rejects.toThrow(); await expect(api.coachFeedback(3)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...comment, fromUserId: 999 })));
    await expect(api.createFeedback({ toUserId: 10, comment: "Test" })).rejects.toThrow("không khớp");
  });
  it("does not call feedback API or invent demo data in demo mode", () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page("MEMBER", false, true);
    expect(screen.getByText("Đánh giá sử dụng API Backend; chưa có dữ liệu đánh giá trong demo.")).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("feedbacks"))).toBe(false);
  });
});
