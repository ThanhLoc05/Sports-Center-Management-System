import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, request } from "../lib/api";
import { demoSession } from "../lib/demo";
import type { Session } from "../lib/types";
const session = (
  role:
    "CENTER_MANAGER" | "COACH" | "MEMBER" | "RECEPTIONIST" = "CENTER_MANAGER",
) => {
  const s: Session = { ...demoSession(role), mode: "api", token: "test-token" };
  sessionStorage.setItem("sportiva-session", JSON.stringify(s));
  return s;
};
const response = (data: unknown, status = 200, type = "application/json") =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": type },
  });
describe("Backend contract: BE branch DTOs and controller paths", () => {
  beforeEach(() => session());
  it("sends Bearer JWT and uses the actual /status route", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ id: 10, status: "INACTIVE" }));
    vi.stubGlobal("fetch", fetch);
    await api.status(10, "INACTIVE");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/10/status?status=INACTIVE",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
  it("serializes className, scheduleTime and assignment IDs from Java ClassRequest", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: 1 }));
    vi.stubGlobal("fetch", fetch);
    const input = {
      className: "Yoga",
      sportId: 1,
      roomId: 1,
      coachId: 3,
      maxCapacity: 20,
      scheduleTime: "2026-10-20T08:00:00",
      durationMinutes: 60,
      requiredAccessLevel: "STANDARD" as const,
      status: "SCHEDULED",
    };
    await api.saveClass(input);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/classes",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });
  it("books using memberId query param instead of an ignored JSON body", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: 1 }));
    vi.stubGlobal("fetch", fetch);
    await api.book(8, 10);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/classes/8/book?memberId=10",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("sends memberId, classId and checkedInBy for attendance", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: 1 }));
    vi.stubGlobal("fetch", fetch);
    const input = {
      classId: 2,
      memberId: 10,
      checkedInBy: 1,
      status: "PRESENT",
    };
    await api.checkIn(input);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/attendance",
      expect.objectContaining({ body: JSON.stringify(input) }),
    );
  });
  it("sends actual invoice field names and starts payment separately", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: 100 }));
    vi.stubGlobal("fetch", fetch);
    const input = {
      memberId: 10,
      subscriptionId: 1,
      amount: 800000,
      paymentMethod: "BANK_TRANSFER",
      paymentStatus: "PENDING",
    };
    await api.invoice(input);
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify(input));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("encodes LocalDateTime range without adding a UTC Z", async () => {
    const fetch = vi.fn().mockResolvedValue(response(800000));
    vi.stubGlobal("fetch", fetch);
    await api.revenue("2026-10-01T00:00:00", "2026-10-15T23:59:59");
    expect(fetch.mock.calls[0][0]).toContain(
      "startDate=2026-10-01T00%3A00%3A00",
    );
  });
  it("never sends a demo token to a real API", async () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(demoSession("MEMBER")),
    );
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await request("/users/10");
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("clears an expired API session through the auth event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 401)));
    const listener = vi.fn();
    window.addEventListener("sportiva:unauthorized", listener);
    await expect(request("/classes")).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("sportiva:unauthorized", listener);
  });
  it("reports backend validation messages instead of showing success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ message: "Lớp đã đủ chỗ" }, 400)),
    );
    await expect(api.book(1, 10)).rejects.toThrow("Lớp đã đủ chỗ");
  });
  it("does not fall back to seeded data on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api.classes()).rejects.toBeInstanceOf(ApiError);
  });
  it("rejects malformed collection responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ content: [] })),
    );
    await expect(api.classes()).rejects.toThrow("định dạng danh sách");
  });
  it("detects an incorrectly configured SPA proxy returning HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>app</html>", {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(api.classes()).rejects.toThrow("HTML thay vì JSON");
  });
  it("rejects unscoped bookings when live API has no list-all endpoint", async () => {
    await expect(api.bookings()).rejects.toThrow("Chọn lớp hoặc thành viên");
  });
  it("loads pending invoices when no member filter is supplied", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    await api.invoices();
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/payments/invoices/pending");
  });
  it("handles empty success responses for cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(api.cancelClass(1)).resolves.toBeUndefined();
  });
});
