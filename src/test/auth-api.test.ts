import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function moduleFor(mode?: string) {
  vi.resetModules();
  vi.stubEnv("VITE_DATA_MODE", mode);
  return import("../lib/api");
}
const member = {
  id: 42,
  email: "test@example.test",
  fullName: "Test",
  phone: "0919991101",
  roleName: "MEMBER",
  status: "ACTIVE",
};
const response = (data: unknown, status = 200, type = "application/json") =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": type },
  });
describe("Contract xác thực backend", () => {
  it("defaults to API and posts credentials to login", async () => {
    const { api, configuredMode } = await moduleFor();
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ token: "jwt", user: member }));
    vi.stubGlobal("fetch", fetch);
    expect(configuredMode).toBe("api");
    await expect(
      api.login(member.email, "test-password"),
    ).resolves.toMatchObject({ mode: "api", user: member });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: member.email,
          password: "test-password",
        }),
      }),
    );
  });
  it("posts registration fields without a privileged role", async () => {
    const { api } = await moduleFor("api");
    const fetch = vi.fn().mockResolvedValue(response(member, 201));
    vi.stubGlobal("fetch", fetch);
    const input = {
      email: member.email,
      password: "test-password",
      fullName: member.fullName,
      phone: member.phone,
    };
    await api.register(input);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/register",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });
  it("rejects stale demo sessions in API mode", async () => {
    const { getSession } = await moduleFor("api");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ token: "demo", user: member, mode: "demo" }),
    );
    expect(getSession()).toBeNull();
  });
  it("reports an outage without falling back to demo", async () => {
    const { api } = await moduleFor("api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      api.login("manager@sportiva.demo", "Sportiva@123"),
    ).rejects.toThrow("Không kết nối được backend");
  });
  it("sends JWT and emits expiry when backend returns 401", async () => {
    const { request } = await moduleFor("api");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ token: "test-token", user: member, mode: "api" }),
    );
    const fetch = vi.fn().mockResolvedValue(response({}, 401));
    const expired = vi.fn();
    vi.stubGlobal("fetch", fetch);
    window.addEventListener("sportiva:unauthorized", expired);
    try {
      await expect(request("/users/42")).rejects.toMatchObject({ status: 401 });
      expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer test-token",
      );
      expect(expired).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("sportiva:unauthorized", expired);
    }
  });
  it("never sends demo token as API authorization", async () => {
    const { request } = await moduleFor("demo");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ token: "demo", user: member, mode: "demo" }),
    );
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await request("/users/42");
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("rejects proxy HTML", async () => {
    const { api } = await moduleFor("api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response("html", 200, "text/html")),
    );
    await expect(api.login(member.email, "password")).rejects.toThrow(
      "HTML thay vì JSON",
    );
  });
  it("rejects an unknown login role", async () => {
    const { api } = await moduleFor("api");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ token: "jwt", user: { ...member, roleName: "ADMIN" } }),
        ),
    );
    await expect(api.login(member.email, "password")).rejects.toThrow(
      "Phản hồi đăng nhập không hợp lệ",
    );
  });
});
