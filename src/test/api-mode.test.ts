import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function apiModule(mode?: string) {
  vi.resetModules();
  vi.stubEnv("VITE_DATA_MODE", mode);
  return import("../lib/api");
}

describe("Real API configuration", () => {
  it("defaults to API and sends login credentials to the backend", async () => {
    const { api, configuredMode } = await apiModule();
    const user = { id: 42, email: "test@example.test", roleName: "MEMBER" };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "jwt", user }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(configuredMode).toBe("api");
    await expect(api.login(user.email, "test-password")).resolves.toMatchObject(
      { mode: "api", user },
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: user.email, password: "test-password" }),
      }),
    );
  });

  it("rejects an old demo session when real API mode is active", async () => {
    const { getSession, mode } = await apiModule("api");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "demo",
        token: "demo-local-only",
        user: { id: 1, roleName: "CENTER_MANAGER" },
      }),
    );
    expect(getSession()).toBeNull();
    expect(mode()).toBe("api");
  });

  it("reports a backend outage without returning demo data", async () => {
    const { api } = await apiModule("api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api.login("test@example.test", "password")).rejects.toThrow(
      "Không kết nối được backend",
    );
    await expect(api.classes()).rejects.toThrow("Không kết nối được backend");
  });

  it("retains demo only when explicitly configured", async () => {
    const { configuredMode } = await apiModule("demo");
    expect(configuredMode).toBe("demo");
  });
});
