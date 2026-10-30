import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../lib/api";
import {
  apiMembershipAccess,
  classAccessAllowed,
  normalizeAccessLevel,
} from "../lib/entitlements";
import type { MembershipPackage, Subscription } from "../lib/types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import Classes from "../pages/Classes";

const subscription: Subscription = {
  id: 11,
  memberId: 42,
  packageId: 7,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  status: "ACTIVE",
};
const pkg: MembershipPackage = {
  id: 7,
  packageName: "Tên gói không biểu thị cấp",
  price: 500000,
  durationDays: 31,
  accessLevel: "STANDARD",
  status: "ACTIVE",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("API quyền gói thật (fetch được mock)", () => {
  beforeEach(() => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-jwt",
        user: { id: 42, roleName: "MEMBER", status: "ACTIVE" },
      }),
    );
  });

  it("reads the active subscription with JWT and keeps the backend DTO", async () => {
    const fetch = vi.fn().mockResolvedValue(response(subscription));
    vi.stubGlobal("fetch", fetch);
    await expect(api.activeSubscription(42)).resolves.toEqual(subscription);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/memberships/members/42/active",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-jwt" }),
      }),
    );
  });

  it("maps only an active-subscription 404 to no membership", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 404)));
    await expect(api.activeSubscription(42)).resolves.toBeNull();
  });

  it.each([400, 401, 403, 500])(
    "preserves HTTP %s instead of treating it as no membership",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(response({ message: "API error" }, status)),
      );
      await expect(api.activeSubscription(42)).rejects.toMatchObject({
        status,
      });
    },
  );

  it("preserves network errors without falling back to demo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(api.activeSubscription(42)).rejects.toBeInstanceOf(ApiError);
  });

  it.each([null, [], "invalid"])(
    "rejects unusable active-subscription responses: %j",
    async (value) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(value)));
      await expect(api.activeSubscription(42)).rejects.toBeInstanceOf(ApiError);
    },
  );

  it("rejects invalid member IDs before requesting", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(api.activeSubscription(0)).rejects.toBeInstanceOf(ApiError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains INACTIVE catalog packages and their explicit accessLevel", async () => {
    const catalog = [
      pkg,
      { ...pkg, id: 8, accessLevel: "VIP", status: "INACTIVE" },
    ];
    const fetch = vi.fn().mockResolvedValue(response(catalog));
    vi.stubGlobal("fetch", fetch);
    await expect(api.membershipPackages()).resolves.toEqual(catalog);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/memberships/packages");
  });

  it("does not turn a catalog 404 into an empty catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 404)));
    await expect(api.membershipPackages()).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects a catalog response that is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ data: [pkg] })),
    );
    await expect(api.membershipPackages()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("Ánh xạ quyền gói theo Backend", () => {
  it.each([
    ["STANDARD", "STANDARD"],
    [" vip ", "VIP"],
    ["", "STANDARD"],
    [null, "STANDARD"],
    [undefined, "STANDARD"],
    ["GOLD", null],
    [1, null],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeAccessLevel(input)).toBe(expected);
  });

  it.each([
    ["STANDARD", "STANDARD", true],
    ["STANDARD", "VIP", false],
    ["VIP", "STANDARD", true],
    ["VIP", "VIP", true],
    ["VIP", "GOLD", false],
    ["STANDARD", null, true],
  ] as const)("%s access to %s is %s", (level, required, allowed) => {
    expect(classAccessAllowed(level, required)).toBe(allowed);
  });

  it.each(["2026-10-01", "2026-10-29", "2026-10-31"])(
    "includes both validity boundaries: %s",
    (today) => {
      expect(apiMembershipAccess(subscription, [pkg], 42, today)).toMatchObject(
        {
          allowed: true,
          accessLevel: "STANDARD",
          subscription,
          pkg,
        },
      );
    },
  );

  it("uses the center date rather than the browser timezone", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-30T17:00:00Z"));
      expect(apiMembershipAccess(subscription, [pkg], 42).allowed).toBe(true);
      vi.setSystemTime(new Date("2026-10-31T17:00:00Z"));
      expect(apiMembershipAccess(subscription, [pkg], 42).allowed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["2026-09-30", "2026-11-01"])(
    "denies a future or expired membership on %s",
    (today) => {
      expect(apiMembershipAccess(subscription, [pkg], 42, today).allowed).toBe(
        false,
      );
    },
  );

  it.each(["PENDING_PAYMENT", "EXPIRED", "CANCELLED"])(
    "denies status %s even within the date range",
    (status) => {
      expect(
        apiMembershipAccess(
          { ...subscription, status },
          [pkg],
          42,
          "2026-10-29",
        ).allowed,
      ).toBe(false);
    },
  );

  it("denies missing membership, wrong owner and missing package", () => {
    expect(apiMembershipAccess(null, [pkg], 42, "2026-10-29").allowed).toBe(
      false,
    );
    expect(
      apiMembershipAccess(subscription, [pkg], 99, "2026-10-29").allowed,
    ).toBe(false);
    expect(
      apiMembershipAccess(subscription, [], 42, "2026-10-29").allowed,
    ).toBe(false);
  });

  it.each(["invalid", "2026-02-31", "2026-13-01"])(
    "denies malformed date %s",
    (startDate) => {
      expect(
        apiMembershipAccess(
          { ...subscription, startDate },
          [pkg],
          42,
          "2026-10-29",
        ).allowed,
      ).toBe(false);
    },
  );

  it("uses packageId and accessLevel, not catalog order, name, price or sale status", () => {
    const catalog = [
      { ...pkg, id: 8, accessLevel: "VIP" },
      { ...pkg, packageName: "VIP", price: 999999, status: "INACTIVE" },
    ];
    expect(
      apiMembershipAccess(subscription, catalog, 42, "2026-10-29"),
    ).toMatchObject({ allowed: true, accessLevel: "STANDARD" });
    expect(
      apiMembershipAccess(
        subscription,
        [
          {
            ...pkg,
            accessLevel: "VIP",
            packageName: "STANDARD",
            price: 1,
            status: "INACTIVE",
          },
        ],
        42,
        "2026-10-29",
      ),
    ).toMatchObject({ allowed: true, accessLevel: "VIP" });
  });

  it("denies an unknown package level instead of guessing from its name", () => {
    expect(
      apiMembershipAccess(
        subscription,
        [{ ...pkg, accessLevel: "GOLD", packageName: "VIP" }],
        42,
        "2026-10-29",
      ).allowed,
    ).toBe(false);
  });
});

describe("Classes lọc cấp gói từ API", () => {
  const currentSubscription = {
    ...subscription,
    startDate: "2020-01-01",
    endDate: "2099-12-31",
  };

  beforeEach(() => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-jwt",
        user: {
          id: 42,
          roleName: "MEMBER",
          status: "ACTIVE",
          fullName: "Hội viên",
        },
      }),
    );
    vi.spyOn(api, "classes").mockResolvedValue([
      {
        id: 1,
        className: "STANDARD API",
        sportId: 1,
        coachId: 3,
        roomId: 1,
        maxCapacity: 20,
        scheduleTime: "2099-01-01T08:00:00",
        durationMinutes: 60,
        requiredAccessLevel: "STANDARD",
        status: "SCHEDULED",
      },
      {
        id: 2,
        className: "VIP API",
        sportId: 1,
        coachId: 3,
        roomId: 1,
        maxCapacity: 20,
        scheduleTime: "2099-01-02T08:00:00",
        durationMinutes: 60,
        requiredAccessLevel: "VIP",
        status: "SCHEDULED",
      },
    ]);
    vi.spyOn(api, "sports").mockResolvedValue([
      { id: 1, name: "Yoga", description: "" },
    ]);
    vi.spyOn(api, "rooms").mockResolvedValue([
      { id: 1, name: "Phòng 1", description: "", capacity: 20 },
    ]);
    vi.spyOn(api, "users").mockResolvedValue([]);
    vi.spyOn(api, "capacity").mockResolvedValue(10);
    vi.spyOn(api, "activeSubscription").mockResolvedValue(currentSubscription);
    vi.spyOn(api, "membershipPackages").mockResolvedValue([pkg]);
  });

  function page() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter>
              <Classes />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    return client;
  }

  it.each(["STANDARD", "VIP"])(
    "filters classes for %s and can turn filtering off",
    async (level) => {
      vi.mocked(api.membershipPackages).mockResolvedValue([
        { ...pkg, accessLevel: level, status: "INACTIVE" },
      ]);
      const client = page();
      expect(
        await screen.findByText(
          `Tên gói không biểu thị cấp · Gói ${level} còn hiệu lực.`,
        ),
      ).toBeVisible();
      expect(
        screen.getByRole("checkbox", { name: "Chỉ xem lớp phù hợp gói" }),
      ).toBeChecked();
      expect(
        await screen.findByRole("heading", { name: "STANDARD API" }),
      ).toBeVisible();
      if (level === "VIP")
        expect(screen.getByRole("heading", { name: "VIP API" })).toBeVisible();
      else
        expect(
          screen.queryByRole("heading", { name: "VIP API" }),
        ).not.toBeInTheDocument();
      expect(api.activeSubscription).toHaveBeenCalledWith(42);
      await userEvent
        .setup()
        .click(
          screen.getByRole("checkbox", { name: "Chỉ xem lớp phù hợp gói" }),
        );
      expect(
        await screen.findByRole("heading", { name: "VIP API" }),
      ).toBeVisible();
      client.clear();
    },
  );

  it.each([
    ["no membership", null, [pkg], "Chưa có gói tập còn hiệu lực."],
    [
      "expired",
      { ...currentSubscription, endDate: "2020-01-02" },
      [pkg],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "future",
      { ...currentSubscription, startDate: "2099-01-01" },
      [pkg],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "pending",
      { ...currentSubscription, status: "PENDING_PAYMENT" },
      [pkg],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "missing package",
      currentSubscription,
      [],
      "Không tìm thấy quyền lợi của gói tập.",
    ],
    [
      "invalid level",
      currentSubscription,
      [{ ...pkg, accessLevel: "GOLD" }],
      "Cấp quyền của gói tập không hợp lệ.",
    ],
    [
      "wrong owner",
      { ...currentSubscription, memberId: 99 },
      [pkg],
      "Gói tập không thuộc thành viên đang chọn.",
    ],
  ] as const)(
    "does not grant access for %s but still allows browsing",
    async (_name, active, packages, reason) => {
      vi.mocked(api.activeSubscription).mockResolvedValue(active);
      vi.mocked(api.membershipPackages).mockResolvedValue([...packages]);
      const client = page();
      expect(await screen.findByText(reason)).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "STANDARD API" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "VIP API" }),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(
          screen.getByRole("checkbox", { name: "Chỉ xem lớp phù hợp gói" }),
        );
      expect(
        await screen.findByRole("heading", { name: "STANDARD API" }),
      ).toBeVisible();
      expect(screen.getByRole("heading", { name: "VIP API" })).toBeVisible();
      client.clear();
    },
  );

  it.each(["subscription", "catalog"])(
    "does not grant access while %s is loading",
    async (loading) => {
      if (loading === "subscription")
        vi.mocked(api.activeSubscription).mockImplementation(
          () => new Promise(() => {}),
        );
      else
        vi.mocked(api.membershipPackages).mockImplementation(
          () => new Promise(() => {}),
        );
      const client = page();
      expect(
        await screen.findByText("Đang kiểm tra quyền lợi gói tập…"),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "STANDARD API" }),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(
          screen.getByRole("checkbox", { name: "Chỉ xem lớp phù hợp gói" }),
        );
      expect(
        await screen.findByRole("heading", { name: "VIP API" }),
      ).toBeVisible();
      client.clear();
    },
  );

  it.each(["subscription", "catalog"])(
    "shows %s API errors and retries successfully",
    async (failure) => {
      const failing =
        failure === "subscription"
          ? vi.mocked(api.activeSubscription)
          : vi.mocked(api.membershipPackages);
      failing.mockRejectedValueOnce(
        new ApiError("Không tải được quyền gói", 500),
      );
      const client = page();
      expect(await screen.findByText("Không tải được quyền gói")).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "STANDARD API" }),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: /Thử lại/i }));
      expect(
        await screen.findByRole("heading", { name: "STANDARD API" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "VIP API" }),
      ).not.toBeInTheDocument();
      client.clear();
    },
  );

  it("does not use cached rights after a refetch error", async () => {
    const client = page();
    expect(
      await screen.findByRole("heading", { name: "STANDARD API" }),
    ).toBeVisible();
    vi.mocked(api.activeSubscription).mockRejectedValue(
      new ApiError("Quyền gói đã lỗi", 500),
    );
    await client.invalidateQueries({ queryKey: ["activeSubscription", 42] });
    expect(await screen.findByText("Quyền gói đã lỗi")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "STANDARD API" }),
    ).not.toBeInTheDocument();
    client.clear();
  });

  it.each([
    ["catalog", "VIP", "STANDARD"],
    ["catalog", "STANDARD", "VIP"],
    ["subscription", "VIP", "STANDARD"],
    ["subscription", "STANDARD", "VIP"],
  ])(
    "hides cached %s rights while refetching %s → %s",
    async (source, previous, next) => {
      vi.mocked(api.membershipPackages).mockResolvedValue([
        { ...pkg, accessLevel: previous },
        { ...pkg, id: 8, accessLevel: next },
      ]);
      const client = page();
      expect(
        await screen.findByText(
          `Tên gói không biểu thị cấp · Gói ${previous} còn hiệu lực.`,
        ),
      ).toBeVisible();
      let resolveCatalog!: (value: MembershipPackage[]) => void;
      let resolveSubscription!: (value: Subscription | null) => void;
      if (source === "catalog") {
        vi.mocked(api.membershipPackages).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveCatalog = resolve;
            }),
        );
      } else {
        vi.mocked(api.activeSubscription).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveSubscription = resolve;
            }),
        );
      }
      const refetch = client.invalidateQueries({
        queryKey:
          source === "catalog"
            ? ["membershipPackages"]
            : ["activeSubscription", 42],
      });
      expect(
        await screen.findByText("Đang kiểm tra quyền lợi gói tập…"),
      ).toBeVisible();
      expect(
        screen.queryByText(
          `Tên gói không biểu thị cấp · Gói ${previous} còn hiệu lực.`,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "STANDARD API" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "VIP API" }),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(
          screen.getByRole("checkbox", { name: "Chỉ xem lớp phù hợp gói" }),
        );
      expect(
        await screen.findByRole("heading", { name: "VIP API" }),
      ).toBeVisible();
      await userEvent
        .setup()
        .click(
          screen.getByRole("checkbox", { name: "Chỉ xem lớp phù hợp gói" }),
        );
      expect(
        screen.queryByRole("heading", { name: "VIP API" }),
      ).not.toBeInTheDocument();
      if (source === "catalog") resolveCatalog([{ ...pkg, accessLevel: next }]);
      else resolveSubscription({ ...currentSubscription, packageId: 8 });
      await refetch;
      expect(
        await screen.findByText(
          `Tên gói không biểu thị cấp · Gói ${next} còn hiệu lực.`,
        ),
      ).toBeVisible();
      expect(
        await screen.findByRole("heading", { name: "STANDARD API" }),
      ).toBeVisible();
      if (next === "VIP")
        expect(screen.getByRole("heading", { name: "VIP API" })).toBeVisible();
      else
        expect(
          screen.queryByRole("heading", { name: "VIP API" }),
        ).not.toBeInTheDocument();
      client.clear();
    },
  );

  it.each(["catalog", "subscription"])(
    "does not restore cached VIP after a pending %s refetch fails",
    async (source) => {
      vi.mocked(api.membershipPackages).mockResolvedValue([
        { ...pkg, accessLevel: "VIP" },
      ]);
      const client = page();
      expect(
        await screen.findByRole("heading", { name: "VIP API" }),
      ).toBeVisible();
      let reject!: (reason: Error) => void;
      if (source === "catalog")
        vi.mocked(api.membershipPackages).mockImplementation(
          () =>
            new Promise((_resolve, rejectPromise) => {
              reject = rejectPromise;
            }),
        );
      else
        vi.mocked(api.activeSubscription).mockImplementation(
          () =>
            new Promise((_resolve, rejectPromise) => {
              reject = rejectPromise;
            }),
        );
      const refetch = client.invalidateQueries({
        queryKey:
          source === "catalog"
            ? ["membershipPackages"]
            : ["activeSubscription", 42],
      });
      expect(
        await screen.findByText("Đang kiểm tra quyền lợi gói tập…"),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "VIP API" }),
      ).not.toBeInTheDocument();
      reject(new ApiError("Không xác minh được quyền mới", 500));
      await refetch;
      expect(
        await screen.findByText("Không xác minh được quyền mới"),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "STANDARD API" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "VIP API" }),
      ).not.toBeInTheDocument();
      client.clear();
    },
  );

  it("removes cached VIP rights when a pending refetch returns no membership", async () => {
    vi.mocked(api.membershipPackages).mockResolvedValue([
      { ...pkg, accessLevel: "VIP" },
    ]);
    const client = page();
    expect(
      await screen.findByRole("heading", { name: "VIP API" }),
    ).toBeVisible();
    let resolve!: (value: Subscription | null) => void;
    vi.mocked(api.activeSubscription).mockImplementation(
      () =>
        new Promise((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );
    const refetch = client.invalidateQueries({
      queryKey: ["activeSubscription", 42],
    });
    expect(
      await screen.findByText("Đang kiểm tra quyền lợi gói tập…"),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "VIP API" }),
    ).not.toBeInTheDocument();
    resolve(null);
    await refetch;
    expect(
      await screen.findByText("Chưa có gói tập còn hiệu lực."),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "STANDARD API" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "VIP API" }),
    ).not.toBeInTheDocument();
    client.clear();
  });

  it("does not fetch member rights or filter classes for a manager", async () => {
    const session = JSON.parse(sessionStorage.getItem("sportiva-session")!);
    session.user.roleName = "CENTER_MANAGER";
    sessionStorage.setItem("sportiva-session", JSON.stringify(session));
    const client = page();
    expect(
      await screen.findByRole("heading", { name: "VIP API" }),
    ).toBeVisible();
    await waitFor(() => expect(api.classes).toHaveBeenCalled());
    expect(api.activeSubscription).not.toHaveBeenCalled();
    expect(api.membershipPackages).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tạo lớp học" })).toBeVisible();
    client.clear();
  });
});
