import { describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, getSession } from "../lib/api";
import { AuthProvider, useAuth } from "../lib/auth";
import { demoSession, readDemo } from "../lib/demo";
import { ToastProvider } from "../components/ui";
import type { Role, SupportTicket } from "../lib/types";
import App from "../App";

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));
const ticket: SupportTicket = {
  id: 91, memberId: 10, subject: "Hỗ trợ lịch tập", content: "Tôi cần hỗ trợ lịch tập tiếng Việt.",
  status: "OPEN", response: null, resolvedBy: null, createdAt: "2026-10-30T10:00:00", resolvedAt: null,
};
const resolved: SupportTicket = { ...ticket, status: "RESOLVED", response: "Đã hỗ trợ đổi lịch theo yêu cầu.", resolvedBy: 2, resolvedAt: "2026-10-30T11:00:00" };
const json = (value: unknown, status = 200) => Response.json(value, { status });
function session(role: Role, id = role === "MEMBER" ? 10 : 2) {
  const s = demoSession(role);
  return { ...s, mode: "api" as const, token: "support-test-only", user: { ...s.user, id, roleName: role } };
}
function SwitchMember() {
  const { signIn } = useAuth();
  return <button onClick={() => signIn(session("MEMBER", 11))}>Đổi tài khoản test</button>;
}
function page(role: Role = "MEMBER", demo = false, switchAccount = false) {
  sessionStorage.setItem("sportiva-session", JSON.stringify(demo ? demoSession(role) : session(role)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider>
    {switchAccount && <SwitchMember />}
    <MemoryRouter initialEntries={["/support"]}><App /></MemoryRouter>
  </ToastProvider></AuthProvider></QueryClientProvider>);
  return client;
}
function server(initial: SupportTicket[] = [ticket]) {
  let rows = initial.map(t => ({ ...t }));
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/v1/support-tickets" && init?.method === "POST") {
      const created = { ...ticket, ...JSON.parse(String(init.body)), id: 92 };
      rows = [created, ...rows]; return json(created, 201);
    }
    if (path === "/api/v1/support-tickets" || path === "/api/v1/support-tickets/my") return json(rows);
    if (path === "/api/v1/support-tickets/91/resolve") {
      rows = rows.map(t => t.id === 91 ? { ...resolved, ...JSON.parse(String(init?.body)) } : t);
      return json(rows.find(t => t.id === 91));
    }
    if (path === "/api/v1/support-tickets/91") return json(rows.find(t => t.id === 91));
    return json([]);
  });
}
describe("Support — API thật được mock, không ghi database", () => {
  it("loads only the member endpoint with authentication and no resolve/create-for-other controls", async () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page();
    await screen.findByRole("button", { name: ticket.subject });
    expect(fetch.mock.calls.some(([url, init]) => String(url).endsWith("/support-tickets/my") && (init?.headers as Record<string, string>).Authorization === "Bearer support-test-only")).toBe(true);
    await userEvent.setup().click(screen.getByRole("button", { name: ticket.subject }));
    await screen.findByText(ticket.content);
    expect(fetch.mock.calls.some(([url]) => String(url) === "/api/v1/support-tickets/91")).toBe(true);
    expect(screen.queryByRole("button", { name: "Xử lý yêu cầu" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thành viên")).not.toBeInTheDocument();
  });
  it("creates with subject/content only, refreshes the real list and keeps demo untouched", async () => {
    const before = JSON.stringify(readDemo().tickets); const fetch = server([]); vi.stubGlobal("fetch", fetch); page(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }));
    await user.type(screen.getByLabelText("Tiêu đề"), "Câu hỏi tiếng Việt");
    await user.type(screen.getByLabelText("Nội dung chi tiết"), "Mong trung tâm hỗ trợ.");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await screen.findByRole("button", { name: "Câu hỏi tiếng Việt" })).toBeVisible();
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(call[0]).toBe("/api/v1/support-tickets");
    expect(JSON.parse(String(call[1]?.body))).toEqual({ subject: "Câu hỏi tiếng Việt", content: "Mong trung tâm hỗ trợ." });
    expect(JSON.stringify(readDemo().tickets)).toBe(before);
    expect(await screen.findByText("Đã gửi yêu cầu hỗ trợ.")).toBeVisible();
  });
  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])("%s resolves OPEN with required response and refreshes detail/list", async role => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page(role); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: ticket.subject }));
    expect(screen.queryByRole("button", { name: "Tạo yêu cầu hỗ trợ" })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url) === "/api/v1/support-tickets")).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Xử lý yêu cầu" }));
    await user.click(screen.getByRole("button", { name: "Đánh dấu đã xử lý" }));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
    await user.type(screen.getByLabelText("Nội dung phản hồi"), resolved.response!);
    await user.click(screen.getByRole("button", { name: "Đánh dấu đã xử lý" }));
    expect(await screen.findByText(resolved.response!)).toBeVisible();
    const call = fetch.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(call[0]).toBe("/api/v1/support-tickets/91/resolve");
    expect(JSON.parse(String(call[1]?.body))).toEqual({ response: resolved.response });
    expect(screen.getByText("Người xử lý: #2")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xử lý yêu cầu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở lại yêu cầu" })).not.toBeInTheDocument();
  });
  it.each(["MEMBER", "RECEPTIONIST", "CENTER_MANAGER"] as Role[])("%s sees resolved response without resolve/reopen", async role => {
    vi.stubGlobal("fetch", server([resolved])); page(role); await userEvent.setup().click(await screen.findByRole("button", { name: ticket.subject }));
    expect(await screen.findByText(resolved.response!)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xử lý yêu cầu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở lại yêu cầu" })).not.toBeInTheDocument();
  });
  it("shows loading then empty without using demo tickets", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/support-tickets/my") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); expect(screen.getByText("Đang tải dữ liệu...")).toBeVisible();
    await act(async () => finish(json([])));
    expect(await screen.findByRole("heading", { name: "Không có kết quả" })).toBeVisible();
  });
  it.each([403, 500, 0])("handles list error %s and retry", async status => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let fail = true;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/support-tickets/my") && fail) { fail = false; if (!status) throw Error("offline"); return json({ message: "Lỗi tải phiếu" }, status); }
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); page(); await screen.findByRole("alert");
    await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("button", { name: ticket.subject })).toBeVisible();
  });
  it.each([403, 404, 500])("handles detail error %s and retry", async status => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let fail = true;
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/support-tickets/91") && fail) { fail = false; return json({ message: "Lỗi chi tiết phiếu" }, status); }
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); page(); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: ticket.subject }));
    await screen.findByText("Lỗi chi tiết phiếu"); await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(ticket.content)).toBeVisible();
  });
  it("expires the session on HTTP 401", async () => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/support-tickets/my") ? json({}, 401) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); await waitFor(() => expect(getSession()).toBeNull());
    expect(await screen.findByRole("button", { name: /Đăng nhập/ })).toBeVisible();
  });
  it.each(["create", "resolve"])("keeps %s form on API failure and never shows false success", async operation => {
    const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => ["POST", "PATCH"].includes(init?.method || "") ? json({ message: "Không lưu được phiếu" }, 500) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(operation === "create" ? "MEMBER" : "RECEPTIONIST"); const user = userEvent.setup();
    if (operation === "create") {
      await user.click(screen.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }));
      await user.type(screen.getByLabelText("Tiêu đề"), "Yêu cầu mới"); await user.type(screen.getByLabelText("Nội dung chi tiết"), "Nội dung mới");
    } else { await user.click(await screen.findByRole("button", { name: ticket.subject })); await user.click(await screen.findByRole("button", { name: "Xử lý yêu cầu" })); await user.type(screen.getByLabelText("Nội dung phản hồi"), "Phản hồi mới"); }
    await user.click(screen.getByRole("button", { name: operation === "create" ? "Gửi yêu cầu" : "Đánh dấu đã xử lý" }));
    expect(await screen.findByText("Không lưu được phiếu")).toBeVisible();
    expect(screen.queryByText(/Đã gửi yêu cầu hỗ trợ\.|Đã giải quyết yêu cầu hỗ trợ\./)).not.toBeInTheDocument();
    expect(screen.getByLabelText(operation === "create" ? "Tiêu đề" : "Nội dung phản hồi")).toHaveValue(operation === "create" ? "Yêu cầu mới" : "Phản hồi mới");
  });
  it("blocks duplicate create while awaiting the server", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => init?.method === "POST" ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page(); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }));
    await user.type(screen.getByLabelText("Tiêu đề"), "Phiếu chờ"); await user.type(screen.getByLabelText("Nội dung chi tiết"), "Nội dung");
    await user.dblClick(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeDisabled();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => finish(json({ ...ticket, subject: "Phiếu chờ" }, 201)));
  });
  it("filters locally without a stale response replacing a newer filter", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/support-tickets") ? new Promise<Response>(resolve => { finish = resolve; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page("RECEPTIONIST"); const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Trạng thái yêu cầu"), "RESOLVED");
    await user.type(screen.getByRole("searchbox"), "Đã hoàn tất");
    await act(async () => finish(json([ticket, { ...resolved, id: 92, subject: "Đã hoàn tất" }])));
    expect(await screen.findByRole("button", { name: "Đã hoàn tất" })).toBeVisible();
    expect(screen.queryByRole("button", { name: ticket.subject })).not.toBeInTheDocument();
  });
  it("blocks duplicate resolve while awaiting confirmation", async () => {
    let finish!: (r: Response) => void;
    const fetch = server(); const fallback = fetch.getMockImplementation()!; let complete = false;
    fetch.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH") return new Promise<Response>(resolve => { finish = resolve; });
      if (complete && String(url) === "/api/v1/support-tickets/91") return json(resolved);
      if (complete && String(url) === "/api/v1/support-tickets") return json([resolved]);
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); page("RECEPTIONIST"); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: ticket.subject }));
    await user.click(await screen.findByRole("button", { name: "Xử lý yêu cầu" }));
    await user.type(screen.getByLabelText("Nội dung phản hồi"), resolved.response!);
    await user.dblClick(screen.getByRole("button", { name: "Đánh dấu đã xử lý" }));
    expect(screen.getByRole("button", { name: "Đánh dấu đã xử lý" })).toBeDisabled();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    complete = true; await act(async () => finish(json(resolved)));
    expect(await screen.findByText(resolved.response!)).toBeVisible();
  });
  it("does not use the prior account's late list response", async () => {
    let finish!: (r: Response) => void; const fetch = server(); const fallback = fetch.getMockImplementation()!; let calls = 0;
    fetch.mockImplementation(async (url, init) => String(url).endsWith("/support-tickets/my") ? ++calls === 1 ? new Promise<Response>(resolve => { finish = resolve; }) : json([{ ...ticket, memberId: 11, id: 93, subject: "Phiếu tài khoản mới" }]) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); page("MEMBER", false, true); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Đổi tài khoản test" }));
    await screen.findByRole("button", { name: "Phiếu tài khoản mới" }); await act(async () => finish(json([ticket])));
    expect(screen.queryByRole("button", { name: ticket.subject })).not.toBeInTheDocument();
  });
  it("does not grant coach access or create-for-other to staff", async () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page("COACH");
    expect(screen.getByText("Vai trò của bạn chưa được hỗ trợ tại màn hình này.")).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("support-tickets"))).toBe(false);
    expect(() => api.createSupportTicket({ subject: "x", content: "y" })).toThrow("quyền");
    expect(() => api.resolveSupportTicket(91, "phản hồi")).toThrow("quyền");
  });
  it("rejects whitespace input and member resolve before any write request", () => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(session("MEMBER"))); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => api.createSupportTicket({ subject: "   ", content: "y" })).toThrow("trống");
    expect(() => api.resolveSupportTicket(91, "phản hồi")).toThrow("quyền");
    sessionStorage.setItem("sportiva-session", JSON.stringify(session("RECEPTIONIST")));
    expect(() => api.createSupportTicket({ subject: "x", content: "y" })).toThrow("quyền");
    expect(() => api.resolveSupportTicket(91, "  ")).toThrow("trống"); expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves demo create, local resolve/reopen and sends no support HTTP", async () => {
    const fetch = server(); vi.stubGlobal("fetch", fetch); page("MEMBER", true); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }));
    await user.type(screen.getByLabelText("Tiêu đề"), "Phiếu demo kiểm thử");
    await user.type(screen.getByLabelText("Nội dung chi tiết"), "Nội dung hỗ trợ demo riêng.");
    await user.click(screen.getByRole("button", { name: "Lưu yêu cầu demo" }));
    await screen.findByRole("button", { name: "Phiếu demo kiểm thử" });
    expect(readDemo().tickets).toHaveLength(1);
    cleanup(); page("RECEPTIONIST", true);
    await user.click(await screen.findByRole("button", { name: "Phiếu demo kiểm thử" }));
    const modal = screen.getByRole("dialog"); await user.click(within(modal).getByRole("button", { name: "Đánh dấu đã xử lý" }));
    await user.click(within(modal).getByRole("button", { name: "Mở lại yêu cầu" }));
    expect(readDemo().tickets[0].status).toBe("OPEN");
    expect(fetch.mock.calls.some(([url]) => String(url).includes("support-tickets"))).toBe(false);
    expect(screen.getAllByText("Đã cập nhật yêu cầu demo.").length).toBeGreaterThan(0);
  });
});
