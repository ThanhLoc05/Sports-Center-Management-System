import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { getSession } from "../lib/api";
import { operations } from "../lib/operations-api";
import { ToastProvider } from "../components/ui";
import { ProfileEditor } from "../components/ProfileEditor";
import { Profile } from "../pages/Settings";
import { demoSession, readDemo, resetDemo } from "../lib/demo";
import * as center from "../lib/center";
import type { Role, User } from "../lib/types";
import type { MemberProfile } from "../lib/operations-api";

const member: User = { id: 10, fullName: "Thành viên TEST", email: "member@profile.invalid", phone: "0900000010", roleName: "MEMBER", status: "ACTIVE" };
const profile: MemberProfile = { memberId: 10, dob: "2000-05-12", gender: "Nữ", address: "Địa chỉ thử nghiệm", fitnessGoals: "Cải thiện sức bền" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const clients: QueryClient[] = [];
function login(role: Role = "MEMBER") {
  sessionStorage.setItem("sportiva-session", JSON.stringify({ mode: "api", token: "profile-mock-only", user: { ...member, id: role === "MEMBER" ? 10 : 1, roleName: role } }));
}
function page(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider><MemoryRouter>{element}</MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
  return client;
}
function server(initial: MemberProfile | null = profile) {
  let stored = initial;
  const calls = vi.fn(async (url: string, init?: RequestInit) => {
    if (/\/users\/\d+\/profile$/.test(url)) {
      const id = Number(url.split("/").at(-2));
      if (init?.method === "PUT") stored = { ...JSON.parse(String(init.body)), memberId: id };
      return stored ? json({ ...stored, memberId: id }) : json({}, 404);
    }
    if (url.endsWith("/users")) return json([member, { ...member, id: 11, fullName: "Thành viên khác" }]);
    if (/\/users\/\d+$/.test(url)) return json({ ...member, id: Number(url.split("/").at(-1)) });
    return json([]);
  });
  vi.stubGlobal("fetch", calls);
  return calls;
}
beforeEach(() => { login(); server(); });
afterEach(() => { clients.forEach((c) => c.clear()); clients.length = 0; });

describe("Hồ sơ thành viên — mock API, không ghi database thật", () => {
  it("reads the profile DTO with bearer authentication", async () => {
    expect(await operations.profile(10)).toEqual(profile);
    expect(fetch).toHaveBeenCalledWith("/api/v1/users/10/profile", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer profile-mock-only" }) }));
  });
  it("maps only GET profile 404 to no profile", async () => {
    server(null);
    expect(await operations.profile(10)).toBeNull();
  });
  it.each([401, 403, 500])("preserves GET error %s instead of returning an empty profile", async (status) => {
    vi.mocked(fetch).mockResolvedValue(json({ message: "Profile unavailable" }, status));
    await expect(operations.profile(10)).rejects.toMatchObject({ status });
  });
  it("preserves network errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    await expect(operations.profile(10)).rejects.toThrow();
  });
  it.each([0, -1, 1.5])("rejects invalid ID %s without a request", async (id) => {
    await expect(operations.profile(id)).rejects.toThrow("Chọn dữ liệu hợp lệ");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ ...profile, memberId: 11 }, { memberId: 10 }, null])("rejects malformed or wrong-owner profile data", async (data) => {
    vi.mocked(fetch).mockResolvedValue(json(data));
    await expect(operations.profile(10)).rejects.toThrow("Dữ liệu hồ sơ");
  });
  it("PUT sends exactly four fields with Unicode and nullable DOB", async () => {
    const input = { ...profile, dob: null, fitnessGoals: "Tăng sức mạnh và độ dẻo dai", fullName: "Không gửi", level: "Không gửi", bio: "Không gửi", specialties: "Không gửi" };
    expect(await operations.saveProfile(10, input)).toMatchObject({ dob: null, fitnessGoals: input.fitnessGoals });
    expect(fetch).toHaveBeenCalledWith("/api/v1/users/10/profile", expect.objectContaining({ method: "PUT", body: JSON.stringify({ dob: null, gender: profile.gender, address: profile.address, fitnessGoals: input.fitnessGoals }) }));
  });
  it("does not convert PUT 404 into success", async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 404));
    await expect(operations.saveProfile(10, profile)).rejects.toMatchObject({ status: 404 });
  });
  it("shows all API profile fields in the routed Profile component", async () => {
    page(<Profile />);
    expect(await screen.findByText(profile.fitnessGoals!, { exact: false })).toBeVisible();
    expect(screen.getByText(profile.address!, { exact: false })).toBeVisible();
    expect(screen.getByText("2000-05-12", { exact: false })).toBeVisible();
    expect(screen.getByText("Nữ", { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cập nhật hồ sơ" })).toBeEnabled();
  });
  it("blocks submission while GET is pending and after it fails, then allows retry", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    page(<ProfileEditor user={member} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(screen.queryByLabelText("Mục tiêu tập luyện")).not.toBeInTheDocument();
    await act(async () => { finish(json({ message: "GET failed" }, 500)); });
    expect(await screen.findByText("GET failed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    vi.mocked(fetch).mockResolvedValue(json(profile));
    await userEvent.setup().click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByLabelText("Mục tiêu tập luyện")).toHaveValue(profile.fitnessGoals);
  });
  it("allows creating a profile only after a confirmed GET 404", async () => {
    const calls = server(null);
    const close = vi.fn();
    page(<ProfileEditor user={member} onClose={close} />);
    const goal = await screen.findByLabelText("Mục tiêu tập luyện");
    await userEvent.setup().type(goal, "Mục tiêu mới");
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    const put = calls.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ dob: null, gender: "", address: "", fitnessGoals: "Mục tiêu mới" });
  });
  it("saves all existing fields, updates only the target cache and displayed goals without demo writes", async () => {
    const saveDemo = vi.spyOn(center, "saveUser");
    const client = page(<Profile />);
    client.setQueryData(["member-profile", 11], { ...profile, memberId: 11, fitnessGoals: "Giữ nguyên" });
    await screen.findByText(profile.fitnessGoals!, { exact: false });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cập nhật hồ sơ" }));
    const goal = await screen.findByLabelText("Mục tiêu tập luyện");
    expect(goal).toHaveAttribute("maxlength", "255");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Họ và tên")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Trình độ")).not.toBeInTheDocument();
    await user.clear(goal); await user.type(goal, "Bền bỉ hơn mỗi ngày");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Bền bỉ hơn mỗi ngày", { exact: false })).toBeVisible();
    expect(client.getQueryData(["member-profile", 10])).toEqual({ ...profile, fitnessGoals: "Bền bỉ hơn mỗi ngày" });
    expect(client.getQueryData(["member-profile", 11])).toMatchObject({ fitnessGoals: "Giữ nguyên" });
    expect(saveDemo).not.toHaveBeenCalled();
    expect(getSession()?.user.fullName).toBe(member.fullName);
  });
  it("keeps cached profile and form contents on PUT failure without success toast", async () => {
    const calls = server();
    const close = vi.fn();
    const client = page(<ProfileEditor user={member} onClose={close} />);
    const goal = await screen.findByLabelText("Mục tiêu tập luyện");
    const user = userEvent.setup();
    await user.clear(goal); await user.type(goal, "Chưa được lưu");
    calls.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "PUT" ? json({ message: "PUT rejected" }, 403) : json(profile));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PUT rejected");
    expect(close).not.toHaveBeenCalled();
    expect(goal).toHaveValue("Chưa được lưu");
    expect(client.getQueryData(["member-profile", 10])).toEqual(profile);
    expect(screen.queryByText("Đã lưu hồ sơ học viên vào hệ thống.")).not.toBeInTheDocument();
  });
  it("preserves untouched null fields when only fitnessGoals changes", async () => {
    const calls = server({ ...profile, dob: null, gender: null, address: null });
    page(<ProfileEditor user={member} onClose={() => {}} />);
    const user = userEvent.setup();
    const goal = await screen.findByLabelText("Mục tiêu tập luyện");
    await user.clear(goal); await user.type(goal, "Chỉ đổi mục tiêu");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(calls.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = calls.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ dob: null, gender: null, address: null, fitnessGoals: "Chỉ đổi mục tiêu" });
  });
  it("does not send a second PUT while the first save is pending", async () => {
    let finish!: (response: Response) => void;
    const calls = server();
    calls.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "PUT"
      ? new Promise<Response>((resolve) => { finish = resolve; }) : json(profile));
    const close = vi.fn();
    page(<ProfileEditor user={member} onClose={close} />);
    await screen.findByLabelText("Mục tiêu tập luyện");
    const user = userEvent.setup();
    const save = screen.getByRole("button", { name: "Lưu thay đổi" });
    await user.click(save);
    expect(save).toBeDisabled();
    expect(screen.getByLabelText("Mục tiêu tập luyện")).toBeDisabled();
    await user.click(save);
    expect(calls.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    await act(async () => { finish(json(profile)); });
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("saves successive edits using the latest persisted fields", async () => {
    const calls = server();
    page(<Profile />);
    await screen.findByText(profile.fitnessGoals!, { exact: false });
    const user = userEvent.setup();
    for (const goal of ["Mục tiêu lần một", "Mục tiêu lần hai"]) {
      await user.click(screen.getByRole("button", { name: "Cập nhật hồ sơ" }));
      const input = await screen.findByLabelText("Mục tiêu tập luyện");
      await user.clear(input); await user.type(input, goal);
      await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText(goal, { exact: false })).toBeVisible();
    }
    expect(calls.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2);
    const last = calls.mock.calls.filter(([, init]) => init?.method === "PUT").at(-1)!;
    expect(JSON.parse(String(last[1]!.body))).toEqual({ dob: profile.dob, gender: profile.gender, address: profile.address, fitnessGoals: "Mục tiêu lần hai" });
  });
  it("blocks a future birth date before sending PUT", async () => {
    const calls = server();
    page(<ProfileEditor user={member} onClose={() => {}} />);
    const dob = await screen.findByLabelText("Ngày sinh");
    await userEvent.setup().clear(dob);
    await userEvent.setup().type(dob, "2999-01-01");
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(calls.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });
  it("shows a Profile page error and disables edit until retry succeeds", async () => {
    const calls = server();
    calls.mockImplementation(async (url: string) => url.endsWith("/profile") ? json({ message: "Profile failed" }, 500) : json(member));
    page(<Profile />);
    expect(await screen.findByText("Profile failed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cập nhật hồ sơ" })).toBeDisabled();
    calls.mockImplementation(async (url: string) => json(url.endsWith("/profile") ? profile : member));
    await userEvent.setup().click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByText(profile.fitnessGoals!, { exact: false })).toBeVisible();
  });
  it.each(["COACH", "MEMBER"] as Role[])("does not let %s edit another member", async (role) => {
    login(role);
    page(<ProfileEditor user={{ ...member, id: 20 }} onClose={() => {}} />);
    expect(screen.getByText("Bạn không có quyền cập nhật hồ sơ này.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps demo profile editing local", async () => {
    resetDemo();
    const session = demoSession("MEMBER");
    sessionStorage.setItem("sportiva-session", JSON.stringify(session));
    page(<ProfileEditor user={session.user} onClose={() => {}} />);
    const goal = screen.getByLabelText("Mục tiêu tập luyện");
    const user = userEvent.setup();
    await user.clear(goal); await user.type(goal, "Mục tiêu demo giữ nguyên luồng");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(readDemo().users.find((u) => u.id === session.user.id)?.fitnessGoals).toBe("Mục tiêu demo giữ nguyên luồng"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
