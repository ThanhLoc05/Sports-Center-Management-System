/** Giữ bộ dữ liệu đã dùng để kiểm thử các phần phát hành trước. */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, getSession } from "../lib/api";
import { demoSession, readDemo } from "../lib/demo";
import { saveUser } from "../lib/center";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import App from "../App";
import type { Role } from "../lib/types";

function login(role: Role) {
  const s = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify(s));
  return s;
}
function page(path: string, role: Role) {
  login(role);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}
const registration = {
  fullName: "Kiểm thử thành viên",
  email: "members@example.test",
  phone: "0917771122",
  password: "test-password",
};

describe("Quản lý thành viên", () => {
  // Kiểm tra vị trí mới vẫn giữ xác nhận, quyền truy cập và dữ liệu sau khi lưu.
  it("updates account status from profile only after confirmation", async () => {
    const user = userEvent.setup();
    const client = page("/members", "CENTER_MANAGER");
    const member = readDemo().users.find((u) => u.roleName === "MEMBER" && u.status === "ACTIVE")!;
    const statusApi = vi.spyOn(api, "status");
    await screen.findByRole("heading", { name: "Thành viên" });
    expect(screen.queryByRole("button", { name: "Thay đổi trạng thái " + member.fullName })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: new RegExp("^" + member.fullName) }));
    const profile = screen.getByRole("dialog", { name: "Thông tin tài khoản" });
    const action = within(profile).getByRole("button", { name: "Thay đổi trạng thái " + member.fullName });
    await user.click(action);
    expect(statusApi).not.toHaveBeenCalled();
    let confirmation = screen.getByRole("dialog", { name: "Cập nhật trạng thái tài khoản?" });
    await user.click(within(confirmation).getByRole("button", { name: "Quay lại" }));
    expect(statusApi).not.toHaveBeenCalled();
    expect(profile).toBeVisible();
    await user.click(action);
    confirmation = screen.getByRole("dialog", { name: "Cập nhật trạng thái tài khoản?" });
    await user.click(within(confirmation).getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(statusApi).toHaveBeenCalledWith(member.id, "INACTIVE"));
    await waitFor(() => expect(within(profile).getByText("Ngừng hoạt động")).toBeVisible());
    expect(readDemo().users.find((u) => u.id === member.id)?.status).toBe("INACTIVE");
    client.clear();
  });
  it.each<Role>(["CENTER_MANAGER", "RECEPTIONIST"])("hides status control for own account or receptionist: %s", async (role) => {
    const user = userEvent.setup();
    const client = page(role === "CENTER_MANAGER" ? "/team" : "/members", role);
    const account = role === "CENTER_MANAGER"
      ? getSession()!.user
      : readDemo().users.find((u) => u.roleName === "MEMBER")!;
    await user.click(await screen.findByRole("button", { name: new RegExp("^" + account.fullName) }));
    const profile = screen.getByRole("dialog", { name: "Thông tin tài khoản" });
    expect(within(profile).queryByRole("button", { name: /Thay đổi trạng thái/ })).not.toBeInTheDocument();
    client.clear();
  });

  it("creates MEMBER, prevents duplicate email/phone and never stores passwords", async () => {
    login("RECEPTIONIST");
    const member = await api.register(registration);
    expect(member.roleName).toBe("MEMBER");
    expect(JSON.stringify(readDemo())).not.toContain(registration.password);
    await expect(
      api.register({ ...registration, phone: "0917771133" }),
    ).rejects.toThrow("Email");
    await expect(
      api.register({ ...registration, email: "other@example.test" }),
    ).rejects.toThrow("điện thoại");
  });
  it("allows manager status updates and blocks reception/member mutations", async () => {
    login("CENTER_MANAGER");
    await api.status(10, "INACTIVE");
    expect(readDemo().users.find((u) => u.id === 10)?.status).toBe("INACTIVE");
    await expect(api.status(1, "INACTIVE")).rejects.toThrow("cuối cùng");
    for (const role of ["RECEPTIONIST", "MEMBER"] as Role[]) {
      login(role);
      await expect(api.status(10, "ACTIVE")).rejects.toThrow("quyền");
    }
  });
  it("edits own profile without allowing role escalation or duplicate identity", () => {
    const { user } = login("MEMBER");
    saveUser(
      { ...user, fitnessGoals: "Cải thiện sức bền", address: "Địa chỉ demo" },
      user.id,
    );
    expect(readDemo().users.find((u) => u.id === user.id)?.fitnessGoals).toBe(
      "Cải thiện sức bền",
    );
    expect(() =>
      saveUser({ ...user, roleName: "CENTER_MANAGER" }, user.id),
    ).toThrow("vai trò");
    expect(() =>
      saveUser({ ...user, email: "manager@sportiva.demo" }, user.id),
    ).toThrow("sử dụng");
  });
  it.each<Role>(["CENTER_MANAGER", "RECEPTIONIST"])(
    "renders member search and creation for %s",
    async (role) => {
      const user = userEvent.setup();
      const client = page("/members", role);
      expect(
        await screen.findByRole("heading", { name: "Thành viên" }),
      ).toBeVisible();
      const search = await screen.findByRole("searchbox", {
        name: "Tìm thành viên",
      });
      await user.type(search, "nguyen minh anh");
      expect(
        await screen.findByRole("button", { name: /^Nguyễn Minh Anh/ }),
      ).toBeVisible();
      await user.clear(search);
      await user.type(search, "khong-ton-tai");
      expect(
        await screen.findByRole("heading", { name: "Không có kết quả" }),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Thêm thành viên" }));
      expect(
        screen.getByRole("dialog", { name: "Thêm thành viên mới" }),
      ).toBeVisible();
      client.clear();
    },
  );
  it.each<Role>(["MEMBER", "COACH"])(
    "blocks %s from direct member-list URL",
    async (role) => {
      const client = page("/members", role);
      expect(
        await screen.findByRole("heading", { name: "Không có quyền truy cập" }),
      ).toBeVisible();
      client.clear();
    },
  );
  it("keeps the real API method and encoded status query", async () => {
    const s = login("CENTER_MANAGER");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api", token: "jwt-test" }),
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...s.user, status: "BLOCKED" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await api.status(10, "BLOCKED");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/10/status?status=BLOCKED",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer jwt-test" }),
      }),
    );
  });
  it("does not save a profile locally when API mode has no update endpoint", () => {
    const s = login("CENTER_MANAGER");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api" }),
    );
    expect(() =>
      saveUser({ ...s.user, fullName: "Không lưu giả" }, s.user.id),
    ).toThrow("API");
    expect(getSession()?.mode).toBe("api");
    expect(readDemo().users[0].fullName).not.toBe("Không lưu giả");
  });
});

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));

const lookupMember = {
  id: 81, fullName: "Nguyễn Tra Cứu", email: "lookup@example.test",
  phone: "0912345678", roleName: "MEMBER", status: "ACTIVE",
};
const lookupProfile = { memberId: 81, dob: null, gender: null, address: "Địa chỉ thử", fitnessGoals: "Mục tiêu thử" };
const json = (data: unknown, status = 200) => Response.json(data, { status });
function apiMembers(role: Role = "RECEPTIONIST") {
  const s = login(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify({ ...s, mode: "api", token: "test-only" }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider><MemoryRouter initialEntries={["/members"]}><App /></MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
  return client;
}
function lookupServer() {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/v1/users") return json([lookupMember, { ...lookupMember, id: 82, fullName: "Nhân viên ẩn", roleName: "COACH" }]);
    if (path === "/api/v1/users/81") return json(lookupMember);
    if (path === "/api/v1/users/81/profile") return json(init?.method === "PUT" ? { memberId: 81, ...JSON.parse(String(init.body)) } : lookupProfile);
    return json([]);
  });
}
describe("Tra cứu thành viên — API mock", () => {
  it.each(["Nguyễn Tra Cứu", "lookup@example.test", "0912345678", "TV0081"])("reception searches %s and excludes staff", async (term) => {
    vi.stubGlobal("fetch", lookupServer()); apiMembers();
    await screen.findByRole("button", { name: /^Nguyễn Tra Cứu/ });
    await userEvent.setup().type(screen.getByRole("searchbox", { name: "Tìm thành viên" }), term);
    expect(screen.getByRole("button", { name: /^Nguyễn Tra Cứu/ })).toBeVisible();
    expect(screen.queryByText("Nhân viên ẩn")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Thay đổi trạng thái/)).not.toBeInTheDocument();
    expect(screen.queryByText("Gán vai trò")).not.toBeInTheDocument();
  });
  it("shows no search results and empty API data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([]))); apiMembers();
    expect(await screen.findByRole("heading", { name: "Không có kết quả" })).toBeVisible();
  });
  it("shows list loading and an unmatched search without using demo data", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url) === "/api/v1/users" ? new Promise<Response>(done => { resolve = done; }) : json([])));
    apiMembers();
    expect(screen.getByText("Đang tải dữ liệu...")).toBeVisible();
    expect(screen.queryByText("Nguyễn Minh Anh")).not.toBeInTheDocument();
    await act(async () => resolve(json([lookupMember])));
    await userEvent.setup().type(screen.getByRole("searchbox", { name: "Tìm thành viên" }), "khong-ton-tai");
    expect(screen.getByRole("heading", { name: "Không có kết quả" })).toBeVisible();
  });
  it("opens detail from the list, retries a profile error and permits a missing profile", async () => {
    const fetch = lookupServer(); const fallback = fetch.getMockImplementation()!;
    let profileCalls = 0;
    fetch.mockImplementation(async (url, init) => {
      if (String(url) === "/api/v1/users/81/profile") return ++profileCalls === 1 ? json({ message: "Lỗi đọc hồ sơ" }, 500) : json({ message: "Chưa có" }, 404);
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); apiMembers(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Nguyễn Tra Cứu/ }));
    await screen.findByText("Lỗi đọc hồ sơ");
    expect(screen.queryByRole("button", { name: "Sửa hồ sơ thành viên" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Thành viên chưa có hồ sơ.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sửa hồ sơ thành viên" })).toBeEnabled();
  });
  it.each([403, 500, 0])("shows list error %s and retries", async (status) => {
    const fetch = lookupServer();
    if (status) fetch.mockImplementationOnce(async () => json({ message: "Lỗi tải danh sách" }, status));
    else fetch.mockImplementationOnce(async () => { throw Error("Mất mạng"); });
    vi.stubGlobal("fetch", fetch); apiMembers();
    await screen.findByText(status ? "Lỗi tải danh sách" : "Không kết nối được backend. Kiểm tra máy chủ và cấu hình API.");
    await userEvent.setup().click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByRole("button", { name: /^Nguyễn Tra Cứu/ })).toBeVisible();
  });
  it("loads and edits the selected member using the shared profile cache", async () => {
    const fetch = lookupServer(); vi.stubGlobal("fetch", fetch); const client = apiMembers(); const user = userEvent.setup();
    await user.type(screen.getByLabelText("ID thành viên"), "81");
    await user.click(screen.getByRole("button", { name: "Xem hồ sơ" }));
    await screen.findByText("Mục tiêu thử");
    await user.click(screen.getByRole("button", { name: "Sửa hồ sơ thành viên" }));
    const goal = await screen.findByLabelText("Mục tiêu tập luyện"); await user.clear(goal); await user.type(goal, "Mục tiêu mới");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(client.getQueryData(["member-profile", 81])).toEqual({ ...lookupProfile, fitnessGoals: "Mục tiêu mới" }));
    expect(fetch.mock.calls.some(([url, init]) => String(url) === "/api/v1/users/81/profile" && init?.method === "PUT")).toBe(true);
  });
  it("blocks invalid IDs, duplicate submits and stale responses", async () => {
    let resolveOld!: (value: Response) => void;
    const fetch = lookupServer(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url) === "/api/v1/users/81" ? new Promise<Response>(resolve => { resolveOld = resolve; }) : String(url) === "/api/v1/users/83" ? json({ ...lookupMember, id: 83, fullName: "Thành viên mới" }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); apiMembers();
    const input = screen.getByLabelText("ID thành viên"); const form = input.closest("form")!;
    fireEvent.change(input, { target: { value: "1.5" } }); fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent("số nguyên dương");
    fireEvent.change(input, { target: { value: "81" } }); fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByRole("button", { name: "Xem hồ sơ" })).toBeDisabled();
    expect(fetch.mock.calls.filter(([url]) => String(url) === "/api/v1/users/81")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "83" } }); fireEvent.submit(form);
    await screen.findByRole("heading", { name: "Thành viên mới" });
    await act(async () => resolveOld(json(lookupMember)));
    expect(screen.getByRole("heading", { name: "Thành viên mới" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: lookupMember.fullName })).not.toBeInTheDocument();
  });
  it.each([403, 404, 500, 0])("handles lookup failure %s and allows retry", async (status) => {
    const fetch = lookupServer(); const fallback = fetch.getMockImplementation()!; let failed = false;
    fetch.mockImplementation(async (url, init) => {
      if (String(url) === "/api/v1/users/81" && !failed) { failed = true; if (!status) throw Error("Mất mạng"); return json({ message: "Không tải được ID" }, status); }
      return fallback(url, init);
    });
    vi.stubGlobal("fetch", fetch); apiMembers(); const user = userEvent.setup();
    await user.type(screen.getByLabelText("ID thành viên"), "81"); await user.click(screen.getByRole("button", { name: "Xem hồ sơ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(status ? "Không tải được ID" : "Không kết nối được backend");
    await user.click(screen.getByRole("button", { name: "Xem hồ sơ" })); await screen.findByText("Mục tiêu thử");
  });
  it("keeps a list selection when an earlier ID request completes", async () => {
    let resolve!: (value: Response) => void;
    const fetch = lookupServer(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url) === "/api/v1/users/83" ? new Promise<Response>(done => { resolve = done; }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); apiMembers(); const user = userEvent.setup();
    await user.type(screen.getByLabelText("ID thành viên"), "83"); await user.click(screen.getByRole("button", { name: "Xem hồ sơ" }));
    await user.click(await screen.findByRole("button", { name: /^Nguyễn Tra Cứu/ }));
    await screen.findByRole("heading", { name: lookupMember.fullName });
    await act(async () => resolve(json({ ...lookupMember, id: 83, fullName: "Kết quả cũ" })));
    expect(screen.getByRole("heading", { name: lookupMember.fullName })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Kết quả cũ" })).not.toBeInTheDocument();
  });
  it("rejects non-member IDs", async () => {
    const fetch = lookupServer(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url) === "/api/v1/users/81" ? json({ ...lookupMember, roleName: "COACH" }) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); apiMembers(); const user = userEvent.setup(); await user.type(screen.getByLabelText("ID thành viên"), "81"); await user.click(screen.getByRole("button", { name: "Xem hồ sơ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không phải thành viên");
  });
  it("retains manager status controls", async () => {
    vi.stubGlobal("fetch", lookupServer()); apiMembers("CENTER_MANAGER");
    // Nút đổi trạng thái nằm trong hồ sơ; quản lý vẫn giữ quyền sau khi ghép code mới.
    await userEvent.setup().click(await screen.findByRole("button", { name: /^Nguyễn Tra Cứu/ }));
    expect(await screen.findByLabelText("Thay đổi trạng thái Nguyễn Tra Cứu")).toBeVisible();
  });
  it.each(["list", "lookup"])("expires the session on 401 from %s", async (target) => {
    const fetch = lookupServer(); const fallback = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => String(url) === (target === "list" ? "/api/v1/users" : "/api/v1/users/81") ? json({ message: "Hết phiên" }, 401) : fallback(url, init));
    vi.stubGlobal("fetch", fetch); apiMembers();
    if (target === "lookup") {
      const user = userEvent.setup(); await user.type(screen.getByLabelText("ID thành viên"), "81"); await user.click(screen.getByRole("button", { name: "Xem hồ sơ" }));
    }
    await waitFor(() => expect(getSession()).toBeNull());
    expect(await screen.findByRole("button", { name: /Đăng nhập/ })).toBeVisible();
  });
});
