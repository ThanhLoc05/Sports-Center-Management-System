import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { operations } from "../lib/operations-api";
import { demoSession, readDemo } from "../lib/demo";
import type { Role } from "../lib/types";
import { ToastProvider } from "../components/ui";
import Facilities from "../pages/Facilities";
import App from "../App";

const room = { id: 81, roomName: "Phòng thật Ánh Dương", capacity: 23 };
const sport = { id: 91, sportName: "Bộ môn thật", description: "Mô tả tiếng Việt" };
const json = (body: unknown, status = 200) => Response.json(body, { status });
function session(role: Role = "CENTER_MANAGER", demo = false) {
  const s = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify(demo ? s : { ...s, mode: "api", token: "facilities-test-only" }));
}
function server() {
  const rooms = [room], sports = [sport];
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url), post = init?.method === "POST";
    if (path === "/api/v1/rooms") {
      if (post) rooms.push({ ...JSON.parse(String(init?.body)), id: 82 });
      return json(post ? rooms.at(-1) : rooms, post ? 201 : 200);
    }
    if (path === "/api/v1/sports") {
      if (post) sports.push({ ...JSON.parse(String(init?.body)), id: 92 });
      return json(post ? sports.at(-1) : sports, post ? 201 : 200);
    }
    throw Error("Unexpected request " + path);
  });
}
function page(app = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider><MemoryRouter initialEntries={["/facilities"]}>
    {app ? <App /> : <Facilities />}
  </MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
  return client;
}
const posts = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");

describe("Rooms/Sports — API catalog", () => {
  it("maps GET DTOs without reading demo data", async () => {
    session(); vi.stubGlobal("fetch", server());
    expect(await api.rooms()).toEqual([{ id: 81, name: room.roomName, capacity: 23, description: "" }]);
    expect(await api.sports()).toEqual([{ id: 91, name: sport.sportName, description: sport.description }]);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(["/api/v1/rooms", "/api/v1/sports"]);
  });
  it("renders both API lists and does not substitute demo names", async () => {
    session(); vi.stubGlobal("fetch", server()); page();
    expect(await screen.findByText(room.roomName)).toBeVisible();
    expect(screen.getByText("23")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Bộ môn" }));
    expect(await screen.findByText(sport.sportName)).toBeVisible();
    expect(screen.getByText(sport.description)).toBeVisible();
    expect(screen.queryByText(readDemo().sports[0].name)).not.toBeInTheDocument();
  });
  it("shows loading until the list resolves", async () => {
    session(); let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url) => String(url).endsWith("/rooms") ? new Promise<Response>(r => { resolve = r; }) : Promise.resolve(json([]))));
    page(); expect(screen.queryByText(room.roomName)).not.toBeInTheDocument();
    expect(document.querySelector(".loading-state")).toBeTruthy();
    await act(async () => resolve(json([room])));
    expect(await screen.findByText(room.roomName)).toBeVisible();
  });
  it.each(["rooms", "sports"])("shows empty %s list", async tab => {
    session(); vi.stubGlobal("fetch", vi.fn(async () => json([]))); page();
    if (tab === "sports") await userEvent.click(screen.getByRole("button", { name: "Bộ môn" }));
    expect(await screen.findByText("Không có kết quả")).toBeVisible();
  });
  it.each([403, 500, 0])("shows API/network error %s and retries", async status => {
    session(); let fail = true;
    vi.stubGlobal("fetch", vi.fn(async url => {
      if (String(url).endsWith("/rooms") && fail) { if (!status) throw Error("Mạng bị ngắt"); return json({ message: "Không tải được phòng" }, status); }
      return json(String(url).endsWith("/rooms") ? [room] : []);
    })); page(); await screen.findByRole("button", { name: "Thử lại" }); fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(room.roomName)).toBeVisible();
  });
  it.each(["rooms", "sports"])("creates %s with exact DTO, trim, Unicode and invalidates its cache", async tab => {
    session(); vi.stubGlobal("fetch", server()); const client = page();
    await screen.findByText(room.roomName); const invalidate = vi.spyOn(client, "invalidateQueries");
    if (tab === "sports") await userEvent.click(screen.getByRole("button", { name: "Bộ môn" }));
    await userEvent.click(screen.getByRole("button", { name: tab === "rooms" ? "Thêm phòng tập" : "Thêm bộ môn" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText(tab === "rooms" ? "Tên phòng" : "Tên bộ môn"), "  Tên mới tiếng Việt  ");
    if (tab === "rooms") await userEvent.type(dialog.getByLabelText("Sức chứa"), "32");
    else await userEvent.type(dialog.getByLabelText("Mô tả"), "  Mô tả Unicode  ");
    await userEvent.click(dialog.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Đã lưu danh mục vào hệ thống.")).toBeVisible();
    expect(await screen.findByText("Tên mới tiếng Việt")).toBeVisible();
    expect(JSON.parse(String(posts()[0][1]?.body))).toEqual(tab === "rooms" ? { roomName: "Tên mới tiếng Việt", capacity: 32 } : { sportName: "Tên mới tiếng Việt", description: "Mô tả Unicode" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [tab] });
    expect(posts()[0][0]).toBe("/api/v1/" + tab);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid capacity %s before POST", capacity => {
    session(); vi.stubGlobal("fetch", server());
    expect(() => operations.createRoom("Phòng", capacity)).toThrow("hợp lệ");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not announce success when POST fails", async () => {
    session(); const normal = server(); vi.stubGlobal("fetch", vi.fn((url, init) => init?.method === "POST" ? Promise.resolve(json({ message: "Phòng đã tồn tại" }, 400)) : normal(url, init)));
    page(); await screen.findByText(room.roomName); await userEvent.click(screen.getByRole("button", { name: "Thêm phòng tập" }));
    const dialog = within(screen.getByRole("dialog")); await userEvent.type(dialog.getByLabelText("Tên phòng"), "Trùng"); await userEvent.type(dialog.getByLabelText("Sức chứa"), "2");
    await userEvent.click(dialog.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Phòng đã tồn tại");
    expect(screen.queryByText("Đã lưu danh mục vào hệ thống.")).not.toBeInTheDocument();
  });
  it("disables repeated submit while POST is pending", async () => {
    session(); const normal = server(); let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url, init) => init?.method === "POST" ? new Promise<Response>(r => { finish = r; }) : normal(url, init)));
    page(); await screen.findByText(room.roomName); await userEvent.click(screen.getByRole("button", { name: "Thêm phòng tập" }));
    const dialog = within(screen.getByRole("dialog")); await userEvent.type(dialog.getByLabelText("Tên phòng"), "Phòng mới"); await userEvent.type(dialog.getByLabelText("Sức chứa"), "2");
    const submit = dialog.getByRole("button", { name: "Lưu thay đổi" }); await userEvent.dblClick(submit);
    expect(submit).toBeDisabled(); expect(posts()).toHaveLength(1);
    await act(async () => finish(json({ id: 82, roomName: "Phòng mới", capacity: 2 }, 201)));
    await screen.findByText("Đã lưu danh mục vào hệ thống.");
  });
  it("accepts 255 description characters but rejects 256 before POST", async () => {
    session(); vi.stubGlobal("fetch", server());
    await operations.createSport("Bộ môn", "á".repeat(255)); expect(posts()).toHaveLength(1);
    expect(() => operations.createSport("Bộ môn", "á".repeat(256))).toThrow("255"); expect(posts()).toHaveLength(1);
    page(); await userEvent.click(screen.getByRole("button", { name: "Bộ môn" }));
    await userEvent.click(screen.getByRole("button", { name: "Thêm bộ môn" }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Mô tả")).toHaveAttribute("maxlength", "255");
  });
  it("shows an explicit error for an overlong injected description", async () => {
    session(); vi.stubGlobal("fetch", server()); page(); await userEvent.click(screen.getByRole("button", { name: "Bộ môn" }));
    await userEvent.click(screen.getByRole("button", { name: "Thêm bộ môn" })); const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Tên bộ môn"), { target: { value: "Môn" } });
    fireEvent.change(dialog.getByLabelText("Mô tả"), { target: { value: "á".repeat(256) } });
    fireEvent.submit(dialog.getByRole("button", { name: "Lưu thay đổi" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("255"); expect(posts()).toHaveLength(0);
  });
  it.each<Role>(["MEMBER", "COACH", "RECEPTIONIST"])("denies %s creation before a request and protects route", async role => {
    session(role); vi.stubGlobal("fetch", server());
    expect(() => operations.createRoom("Phòng", 2)).toThrow(); expect(() => operations.createSport("Môn", "")).toThrow();
    page(true); expect(await screen.findByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Thêm phòng tập" })).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
  });
  it("does not send PUT/PATCH/DELETE from the pending editor", async () => {
    session(); vi.stubGlobal("fetch", server()); page(); await screen.findByText(room.roomName);
    await userEvent.click(screen.getByRole("button", { name: "Chỉnh sửa phòng" }));
    const dialog = within(screen.getByRole("dialog")); await userEvent.click(dialog.getByRole("button", { name: "Xem lại thay đổi" }));
    expect(dialog.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !["PUT", "PATCH", "DELETE"].includes(init?.method || "GET"))).toBe(true);
  });
  it("keeps demo mode local without API requests", async () => {
    session("CENTER_MANAGER", true); vi.stubGlobal("fetch", vi.fn()); page();
    await userEvent.click(screen.getByRole("button", { name: "Thêm phòng tập demo" })); const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Tên danh mục"), "Phòng demo riêng"); await userEvent.click(dialog.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Phòng demo riêng")).toBeVisible(); expect(fetch).not.toHaveBeenCalled();
    expect(readDemo().rooms.some(r => r.name === "Phòng demo riêng")).toBe(true);
  });
});
