import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
function memberSession() {
  const s = demoSession("MEMBER");
  sessionStorage.setItem("sportiva-session", JSON.stringify({ ...s, mode: "api", token: "member-class-detail-test" }));
  return s;
}
function server(detail: (id: number) => Promise<Response> = async id => json({ ...item(id), className: `Chi tiết mới ${id}` }), list = [item()]) {
  const fetch = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(url), match = path.match(/^\/api\/v1\/classes\/(\d+)$/);
    if (match) return detail(Number(match[1]));
    if (path === "/api/v1/classes") return json(list);
    if (path.startsWith("/api/v1/classes/management?")) {
      const status = new URLSearchParams(path.split("?")[1]).get("status");
      const filtered = list.filter(row => status === "all" || row.status === status);
      return json({ items: filtered.map(session => ({ session, cancellationReason: null })), total: filtered.length, pageCount: 1 });
    }
    if (path.endsWith("/capacity")) return json(7);
    if (path.endsWith("/cancellation")) return json({ canCancel: true, booked: 2, waitlisted: 1 });
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
  it("shows the real Member booking state instead of a stale register button", async () => {
    const s = memberSession();
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (/\/api\/v1\/classes\/1$/.test(path)) return json(item());
      if (path.endsWith("/capacity")) return json(5);
      if (path === `/api/v1/members/${s.user.id}/bookings`) {
        return json([{ id: 71, classId: 1, memberId: s.user.id, bookedAt: "2026-11-20T10:00:00", status: "BOOKED" }]);
      }
      return json([]);
    }));
    page(detailNode());
    expect(await screen.findByText("Bạn đã đăng ký lớp học này")).toBeVisible();
    expect(screen.getByText(/Lớp học đã được thêm vào lịch của bạn/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Đăng ký lớp học" })).not.toBeInTheDocument();
  });
  it("allows booking when the Member has no ACTIVE booking", async () => {
    const s = memberSession();
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (/\/api\/v1\/classes\/1$/.test(path)) return json(item());
      if (path.endsWith("/capacity")) return json(5);
      if (path === `/api/v1/members/${s.user.id}/bookings`) {
        return json([{ id: 71, classId: 1, memberId: s.user.id, bookedAt: "2026-11-20T10:00:00", status: "CANCELLED" }]);
      }
      return json([]);
    }));
    page(detailNode());
    expect(await screen.findByRole("button", { name: "Đăng ký lớp học" })).toBeEnabled();
  });
  it("does not allow booking when the class is full", async () => {
    const s = memberSession();
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (/\/api\/v1\/classes\/1$/.test(path)) return json(item());
      if (path.endsWith("/capacity")) return json(0);
      if (path === `/api/v1/members/${s.user.id}/bookings`) return json([]);
      return json([]);
    }));
    page(detailNode());
    expect(await screen.findByRole("button", { name: "Lớp đã đủ chỗ" })).toBeDisabled();
  });
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
    expect(edit).toHaveBeenCalledWith(fresh); await userEvent.click(screen.getByRole("button", { name: "Hủy buổi học" })); expect(cancel).toHaveBeenCalledWith(fresh);
  });
  it.each(["Classes", "Schedule"])("opens shared detail from %s using GET by ID", async source => {
    session(); const fetch = server(); page(source === "Classes" ? <Classes /> : <Schedule />);
    if (source === "Classes") await userEvent.click(await screen.findByRole("button", { name: "Danh sách cũ 1" }));
    else {
      await userEvent.click(screen.getByRole("button", { name: "Danh sách" }));
      await userEvent.click(await screen.findByText("Danh sách cũ 1"));
    }
    expect(await screen.findByRole("heading", { name: "Chi tiết mới 1" })).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => url === "/api/v1/classes/1")).toBe(true);
    expect(fetch.mock.calls.every(([, init]) => !(init as RequestInit | undefined)?.method || (init as RequestInit).method === "GET")).toBe(true);
  });
  it("opens class details by clicking anywhere on the card and keeps the CTA label", async () => {
    session();
    server();
    page(<Classes />);
    await userEvent.click(screen.getByRole("button", { name: "Xem dạng thẻ" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Xem dạng thẻ" }));
    await userEvent.selectOptions(screen.getByText("Hoàn thành").closest("select")!, "COMPLETED");
    const card = (await screen.findByText("Lớp đã xong")).closest("article")!;
    expect(within(card).getByText("Đã hoàn thành")).toBeVisible(); expect(within(card).queryByText(/Còn.*chỗ/)).not.toBeInTheDocument();
    expect(screen.queryByText("Danh sách cũ 1")).not.toBeInTheDocument();
  });
  it("does not present completed detail as open for booking", async () => {
    session(); server(async () => json({ ...item(), status: "COMPLETED" })); page(detailNode());
    expect(await screen.findByText("Đã hoàn thành")).toBeVisible(); expect(screen.queryByRole("button", { name: "Đăng ký cho thành viên" })).not.toBeInTheDocument();
  });
  it("groups Manager resources by sport and only resets incompatible selections", async () => {
    session();
    const fetch = server();
    const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation((path, init) => {
      switch (String(path)) {
        case "/api/v1/sports":
          return Promise.resolve(json([
            { id: 1, sportName: "Cầu lông" }, { id: 2, sportName: "Yoga" }, { id: 7, sportName: "Pickleball" },
          ]));
        case "/api/v1/rooms":
          return Promise.resolve(json([
            { id: 21, roomName: "Sân Cầu lông và Yoga", capacity: 15 },
            { id: 22, roomName: "Sân Pickleball", capacity: 15 },
            { id: 23, roomName: "Sân chung", capacity: 15 },
          ]));
        case "/api/v1/users/coaches":
          return Promise.resolve(json([
            { coachId: 10, fullName: "An", specialties: "Badminton, Yoga", professionalLevel: null, bio: null },
            { coachId: 11, fullName: "Bình", specialties: "Pickleball", professionalLevel: null, bio: null },
            { coachId: 12, fullName: "Chi", specialties: null, professionalLevel: null, bio: null },
          ]));
        default:
          return fallback(path, init);
      }
    });
    page(<Classes />);
    const user = userEvent.setup();
    const coach = await screen.findByLabelText("Lọc theo HLV");
    const room = screen.getByLabelText("Lọc theo sân/phòng");
    const coachList = within(coach);
    const roomList = within(room);
    expect(await within(await coachList.findByRole("group", { name: "Cầu lông" })).findByRole("option", { name: "An" })).toBeVisible();
    expect(within(coachList.getByRole("group", { name: "Yoga" })).getByRole("option", { name: "An" })).toBeVisible();
    expect(within(roomList.getByRole("group", { name: "Yoga" })).getByRole("option", { name: "Sân Cầu lông và Yoga" })).toBeVisible();
    expect(within(roomList.getByRole("group", { name: "Chưa phân loại" })).getByRole("option", { name: "Sân chung" })).toBeVisible();
    expect(coachList.queryByRole("option", { name: "Cầu lông" })).not.toBeInTheDocument();

    await user.selectOptions(coach, coachList.getAllByRole("option", { name: "An" })[0]);
    await user.selectOptions(room, roomList.getAllByRole("option", { name: "Sân Cầu lông và Yoga" })[0]);
    await user.click(screen.getByRole("button", { name: /^Yoga$/ }));
    expect(coach).toHaveValue("10");
    expect(room).toHaveValue("21");
    expect(coachList.queryByRole("option", { name: "Chi" })).not.toBeInTheDocument();
    expect(roomList.queryByRole("option", { name: "Sân Pickleball" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Pickleball$/ }));
    expect(coach).toHaveValue("");
    expect(room).toHaveValue("");
    expect(coachList.getAllByRole("option").map(option => option.textContent)).toEqual(["Tất cả HLV", "Bình"]);
    expect(roomList.getAllByRole("option").map(option => option.textContent)).toEqual(["Tất cả sân/phòng", "Sân Pickleball"]);
    await user.selectOptions(coach, "11");
    await user.selectOptions(room, "22");
    await user.selectOptions(screen.getByLabelText("Lọc theo ca"), "SLOT_01");
    await user.selectOptions(screen.getByLabelText("Trạng thái lớp"), "CANCELLED");
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-11-28" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-11-30" } });
    fireEvent.change(screen.getByPlaceholderText("Tìm lớp học..."), { target: { value: "giao lưu" } });
    const criteria = () => {
      const request = fetch.mock.calls.map(([path]) => String(path)).filter(path => path.startsWith("/api/v1/classes/management?")).at(-1)!;
      return Object.fromEntries(new URLSearchParams(request.split("?")[1]));
    };
    await waitFor(() => expect(criteria()).toEqual({
      status: "CANCELLED", keyword: "giao lưu", page: "0", sportId: "7", coachId: "11", roomId: "22",
      slot: "SLOT_01", fromDate: "2026-11-28", throughDate: "2026-11-30",
    }));
    await user.click(screen.getByRole("button", { name: /^Yoga$/ }));
    await waitFor(() => expect(criteria()).toEqual({
      status: "CANCELLED", keyword: "giao lưu", page: "0", sportId: "2",
      slot: "SLOT_01", fromDate: "2026-11-28", throughDate: "2026-11-30",
    }));
  });

  it("loads Manager cancellation history by page and renders the reason", async () => {
    session();
    const cancelled = { ...item(4), className: "Buổi đã hủy", status: "CANCELLED" };
    const fetch = server(undefined, [item()]);
    const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (path, init) => {
      const url = String(path);
      if (!url.startsWith("/api/v1/classes/management?")) return fallback(path, init);
      const params = new URLSearchParams(url.split("?")[1]);
      if (params.get("status") !== "CANCELLED") return fallback(path, init);
      const row = params.get("page") === "1" ? { ...cancelled, id: 5, className: "Buổi ở trang hai" } : cancelled;
      return json({ items: [{ session: row, cancellationReason: "Sân/phòng không thể sử dụng" }], total: 9, pageCount: 2 });
    });
    page(<Classes />);
    expect(await screen.findByText("Danh sách cũ 1")).toBeVisible();
    expect(screen.queryByText("Buổi đã hủy")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái lớp"), "CANCELLED");
    expect(await screen.findByText("Buổi đã hủy")).toBeVisible();
    expect(screen.getByText("Lý do hủy: Sân/phòng không thể sử dụng")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(await screen.findByText("Buổi ở trang hai")).toBeVisible();
    expect(fetch.mock.calls.some(([path]) => new URLSearchParams(String(path).split("?")[1]).get("page") === "1")).toBe(true);
    expect(fetch.mock.calls.some(([path]) => path === "/api/v1/classes")).toBe(false);
  });
  it("preserves demo detail without requesting an API detail", async () => {
    session(true); const detail = vi.spyOn(api, "classDetail"); server(); page(detailNode());
    expect(await screen.findByRole("heading", { name: "Danh sách cũ 1" })).toBeVisible(); expect(detail).not.toHaveBeenCalled();
  });
});
