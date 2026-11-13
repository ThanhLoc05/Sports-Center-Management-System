import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { demoSession } from "../lib/demo";
import { addDays, localDate } from "../lib/utils";
import type { SportClass } from "../lib/types";
import { ToastProvider } from "../components/ui";
import Classes, { ClassDetail } from "../pages/Classes";
import Schedule from "../pages/Schedule";

const item = (id = 1): SportClass => ({ id, className: `Danh sách cũ ${id}`, sportId: 1, roomId: 1, coachId: 3,
  maxCapacity: 20, scheduleTime: `${localDate()}T23:59:00`, durationMinutes: 60, requiredAccessLevel: "VIP", status: "SCHEDULED" });
const json = (data: unknown, status = 200) => Response.json(data, { status });
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function session(demo = false) {
  const s = demoSession("CENTER_MANAGER");
  sessionStorage.setItem("sportiva-session", JSON.stringify(demo ? s : { ...s, mode: "api", token: "class-detail-test-only" }));
  return s;
}
function server(detail: (id: number) => Promise<Response> = async id => json({ ...item(id), className: `Chi tiết mới ${id}` }), list = [item()]) {
  const fetch = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(url), match = path.match(/^\/api\/v1\/classes\/(\d+)$/);
    if (match) return detail(Number(match[1]));
    if (path === "/api/v1/classes") return json(list);
    if (path.endsWith("/capacity")) return json(7);
    if (path === "/api/v1/sports") return json([{ id: 1, sportName: "Yoga", description: "" }]);
    if (path === "/api/v1/rooms") return json([{ id: 1, roomName: "Phòng thật", capacity: 20 }]);
    return json([]);
  }); vi.stubGlobal("fetch", fetch); return fetch;
}
function page(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><AuthProvider><ToastProvider><MemoryRouter>{child}</MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>;
  const view = render(wrap(node)); return { client, rerender: (child: React.ReactNode) => view.rerender(wrap(child)) };
}
const detailNode = (id = 1) => <ClassDetail item={item(id)} onClose={() => {}} />;

describe("Chi tiết lớp API và COMPLETED", () => {
  it("GETs by ID with authentication and does not use the list object", async () => {
    session(); const fetch = server(); page(detailNode());
    expect(await screen.findByRole("heading", { name: "Chi tiết mới 1" })).toBeVisible();
    expect(screen.queryByText("Danh sách cũ 1")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/v1/classes/1", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer class-detail-test-only" }) }));
    expect(within(screen.getByRole("dialog")).getByText("VIP")).toBeVisible();
  });
  it("hides list and cached detail while checking a pending request", async () => {
    const s = session(); const request = pending<Response>(); server(() => request.promise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["classDetail", 1, s.user.id], { ...item(), className: "Cache cũ" });
    render(<QueryClientProvider client={client}><AuthProvider><ToastProvider><MemoryRouter>{detailNode()}</MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
    expect(await screen.findByRole("status")).toHaveTextContent("Đang tải");
    expect(screen.queryByText("Cache cũ")).not.toBeInTheDocument(); expect(screen.queryByText("Danh sách cũ 1")).not.toBeInTheDocument();
    await act(async () => request.resolve(json({ ...item(), className: "Đã xác minh" })));
    expect(await screen.findByRole("heading", { name: "Đã xác minh" })).toBeVisible();
  });
  it.each([404, 403, 500, 0])("shows detail error %s and supports retry without demo fallback", async status => {
    session(); let fail = true; server(async () => {
      if (fail) { if (!status) throw Error("offline"); return json({}, status); }
      return json({ ...item(), className: "Sau thử lại" });
    }); page(detailNode());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(status === 404 ? "Không tìm thấy" : status === 403 ? "không có quyền" : status === 0 ? "Không kết nối" : "Máy chủ");
    expect(screen.queryByText("Danh sách cũ 1")).not.toBeInTheDocument(); fail = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Sau thử lại" })).toBeVisible();
  });
  it("rejects a response with the wrong class ID", async () => {
    session(); server(async () => json(item(2))); page(detailNode());
    expect(await screen.findByRole("alert")).toHaveTextContent("không khớp");
    expect(screen.queryByText("Danh sách cũ 2")).not.toBeInTheDocument();
  });
  it("does not let a late A response replace B after switching IDs", async () => {
    session(); const a = pending<Response>(), b = pending<Response>(); server(id => id === 1 ? a.promise : b.promise);
    const view = page(detailNode(1)); await screen.findByRole("status"); view.rerender(detailNode(2));
    await act(async () => b.resolve(json({ ...item(2), className: "Lớp B mới" })));
    await screen.findByRole("heading", { name: "Lớp B mới" });
    await act(async () => a.resolve(json({ ...item(1), className: "Lớp A đến muộn" })));
    expect(screen.getByRole("heading", { name: "Lớp B mới" })).toBeVisible(); expect(screen.queryByText("Lớp A đến muộn")).not.toBeInTheDocument();
  });
  it("updates after invalidation and hides previous details during refetch", async () => {
    session(); const next = pending<Response>(); let calls = 0;
    server(async () => ++calls === 1 ? json({ ...item(), className: "Bản trước" }) : next.promise);
    const { client } = page(detailNode()); await screen.findByRole("heading", { name: "Bản trước" });
    act(() => { void client.invalidateQueries({ queryKey: ["classDetail", 1] }); });
    await screen.findByRole("status"); expect(screen.queryByText("Bản trước")).not.toBeInTheDocument();
    await act(async () => next.resolve(json({ ...item(), className: "Bản cập nhật", requiredAccessLevel: "STANDARD" })));
    expect(await screen.findByRole("heading", { name: "Bản cập nhật" })).toBeVisible();
    expect(within(screen.getByRole("dialog")).getByText("STANDARD")).toBeVisible();
  });
  it("does not expose old details if refetch returns 403", async () => {
    session(); let fail = false; server(async () => fail ? json({}, 403) : json({ ...item(), className: "Nội dung trước" }));
    const { client } = page(detailNode()); await screen.findByRole("heading", { name: "Nội dung trước" }); fail = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ["classDetail", 1] }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền"); expect(screen.queryByText("Nội dung trước")).not.toBeInTheDocument();
  });
  it("passes fresh detail data to edit and cancel without changing their permissions", async () => {
    session(); const fresh = { ...item(), className: "Dữ liệu sửa mới" }; server(async () => json(fresh)); const edit = vi.fn(), cancel = vi.fn();
    page(<ClassDetail item={item()} onClose={() => {}} onEdit={edit} onCancel={cancel} />);
    await screen.findByRole("heading", { name: fresh.className }); await userEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
    expect(edit).toHaveBeenCalledWith(fresh); await userEvent.click(screen.getByRole("button", { name: "Hủy lớp" })); expect(cancel).toHaveBeenCalledWith(fresh);
  });
  it.each(["Classes", "Schedule"])("opens shared detail from %s using GET by ID", async source => {
    session(); const fetch = server(); page(source === "Classes" ? <Classes /> : <Schedule />);
    if (source === "Classes") await userEvent.click((await screen.findAllByRole("button", { name: "Xem lớp học" }))[0]);
    else await userEvent.click(await screen.findByText("Danh sách cũ 1"));
    expect(await screen.findByRole("heading", { name: "Chi tiết mới 1" })).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => url === "/api/v1/classes/1")).toBe(true);
    expect(fetch.mock.calls.every(([, init]) => !(init as RequestInit | undefined)?.method || (init as RequestInit).method === "GET")).toBe(true);
  });
  it("opens class details by clicking anywhere on the card and keeps the CTA label", async () => {
    session();
    server();
    page(<Classes />);
    const heading = await screen.findByRole("heading", {
      name: "Danh sách cũ 1",
    });

    await userEvent.click(heading);

    expect(await screen.findByRole("heading", { name: "Chi tiết mới 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Xem lớp học" })).toBeVisible();
  });
  it("filters COMPLETED and labels the card as completed instead of available", async () => {
    session(); const completed = { ...item(2), className: "Lớp đã xong", status: "COMPLETED" as const, scheduleTime: `${localDate(addDays(-1))}T08:00:00` };
    server(undefined, [item(), completed]); page(<Classes />); await screen.findByText("Danh sách cũ 1");
    await userEvent.selectOptions(screen.getByText("Hoàn thành").closest("select")!, "COMPLETED");
    const card = (await screen.findByText("Lớp đã xong")).closest("article")!;
    expect(within(card).getByText("Đã hoàn thành")).toBeVisible(); expect(within(card).queryByText(/Còn.*chỗ/)).not.toBeInTheDocument();
    expect(screen.queryByText("Danh sách cũ 1")).not.toBeInTheDocument();
  });
  it("does not present completed detail as open for booking", async () => {
    session(); server(async () => json({ ...item(), status: "COMPLETED" })); page(detailNode());
    expect(await screen.findByText("Đã hoàn thành")).toBeVisible(); expect(screen.queryByRole("button", { name: "Đăng ký cho thành viên" })).not.toBeInTheDocument();
  });
  it("preserves demo detail without requesting an API detail", async () => {
    session(true); const detail = vi.spyOn(api, "classDetail"); server(); page(detailNode());
    expect(await screen.findByRole("heading", { name: "Danh sách cũ 1" })).toBeVisible(); expect(detail).not.toHaveBeenCalled();
  });
});
