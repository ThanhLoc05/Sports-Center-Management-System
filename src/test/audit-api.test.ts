import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditApi } from "../lib/audit-api";

function login(roleName = "CENTER_MANAGER") {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "audit-test-token",
      user: {
        id: 1,
        fullName: "Quản lý",
        email: "manager@example.test",
        phone: "0900000000",
        roleName,
        status: "ACTIVE",
      },
    }),
  );
}

describe("Audit API", () => {
  beforeEach(() => {
    sessionStorage.clear();
    login();
  });

  it("requests filtered pages from the backend using the API session", async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          content: [],
          page: 0,
          size: 25,
          totalElements: 0,
          totalPages: 0,
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const filters = {
      keyword: "lớp",
      entityType: "CLASS",
      from: "2026-11-01",
      to: "2026-11-07",
      page: 0,
      size: 25,
    };

    await expect(auditApi.list(filters)).resolves.toMatchObject({
      content: [],
      totalElements: 0,
    });
    expect(fetch.mock.calls[0][0]).toBe(
      `/api/v1/audit-logs?${new URLSearchParams(
        Object.entries(filters).map(([key, value]) => [key, String(value)]),
      )}`,
    );
    expect(
      (fetch.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined)
        ?.Authorization,
    ).toMatch(/^Bearer /);
  });

  it("exports the server-filtered CSV", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("Thời gian,Người thực hiện\r\n", {
          headers: { "Content-Type": "text/csv;charset=UTF-8" },
        }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(auditApi.export({ entityType: "CLASS" })).resolves.toContain(
      "Người thực hiện",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/audit-logs/export?entityType=CLASS",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "text/csv" }),
      }),
    );
  });

  it("blocks non-manager accounts before making an audit request", async () => {
    login("COACH");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(auditApi.list()).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
