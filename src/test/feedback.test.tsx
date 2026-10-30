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
  await user.clear(within(dialog).getByRole("spinbutton"));
  await user.type(within(dialog).getByRole("spinbutton"), role === "COACH" ? "10" : target === "class" ? "8" : "3");
  await user.type(within(dialog).getByLabelText("Nội dung đánh giá"), "Đánh giá Unicode — rất tốt");
  return { user, dialog };
}
describe("Feedback — contract và UI, chỉ mock API", () => {
  it("member reads received feedback with null rating and no management actions", async () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page();
    expect(await screen.findByText(comment.comment)).toBeVisible();
    expect(screen.getByText("Không chấm điểm")).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url) === "/api/v1/feedbacks/member/10")).toBe(true);
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
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/feedbacks/member/"))).toBe(false);
    expect(JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body))).toEqual({ toUserId: 10, rating: null, comment: "Đánh giá Unicode — rất tốt" });
    expect(screen.queryByRole("option", { name: "Nhận xét thành viên" })).not.toBeInTheDocument();
  });
  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])("%s reads coach summary, class and member lists without write actions", async role => {
    const fetch = server([{ ...comment, toUserId: 3, rating: 4, type: "MEMBER_TO_COACH" }, { ...comment, id: 72, classId: 8, type: "CLASS_FEEDBACK" }, comment]);
    vi.stubGlobal("fetch", fetch); page(role); const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: /Viết đánh giá|Nhận xét thành viên/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("ID HLV"), "3"); await user.click(screen.getByRole("button", { name: "Xem đánh giá" }));
    expect(await screen.findByText("Điểm trung bình: 4.5 / 5 · Tổng đánh giá: 1")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Loại dữ liệu"), "class"); await user.type(screen.getByLabelText("ID lớp"), "8"); await user.click(screen.getByRole("button", { name: "Xem đánh giá" }));
    await screen.findByText("Nhận xét tiếng Việt");
    await user.selectOptions(screen.getByLabelText("Loại dữ liệu"), "member"); await user.type(screen.getByLabelText("ID thành viên"), "10"); await user.click(screen.getByRole("button", { name: "Xem đánh giá" }));
    await screen.findAllByText("Nhận xét tiếng Việt");
    expect(fetch.mock.calls.some(([, init]) => ["POST", "PUT", "PATCH", "DELETE"].includes(init?.method || ""))).toBe(false);
  });
  it("shows loading and empty state without demo fallback", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/feedbacks/member/10") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); expect(screen.getByText("Đang tải dữ liệu...")).toBeVisible();
    await act(async () => finish(json([]))); expect(await screen.findByRole("heading", { name: "Không có kết quả" })).toBeVisible();
  });
  it.each([400, 403, 500, 0])("shows GET error %s and retries", async status => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let fail = true;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/feedbacks/member/10") && fail) { fail = false; if (!status) throw Error("offline"); return json({ message: "Lỗi tải đánh giá" }, status); }
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); page(); await screen.findByRole("alert"); await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(comment.comment)).toBeVisible();
  });
  it("handles 401 with the existing login redirect", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).includes("/feedbacks/") ? json({}, 401) : fallback(url, init));
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
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/feedbacks/coach/3") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page("CENTER_MANAGER"); const user = userEvent.setup();
    await user.type(screen.getByLabelText("ID HLV"), "3"); await user.click(screen.getByRole("button", { name: "Xem đánh giá" })); await waitFor(() => expect(finish).toBeDefined());
    await user.selectOptions(screen.getByLabelText("Loại dữ liệu"), "class"); await user.type(screen.getByLabelText("ID lớp"), "8"); await user.click(screen.getByRole("button", { name: "Xem đánh giá" }));
    await act(async () => finish(json({ coachId: 3, averageRating: 5, totalReviews: 1, feedbacks: [{ ...comment, comment: "Phản hồi HLV cũ" }] })));
    expect(screen.queryByText("Phản hồi HLV cũ")).not.toBeInTheDocument();
  });
  it("does not retain the old account's form or late feedback list", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/feedbacks/member/10") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
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
