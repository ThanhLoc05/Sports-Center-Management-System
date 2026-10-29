import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import BookingForm from "../components/BookingForm";
import { api } from "../lib/api";

describe("Đặt lớp ở API mode không bị luồng demo chặn", () => {
  it.each([true, false])(
    "sends booking and respects backend response (success=%s)",
    async (success) => {
      const user = userEvent.setup();
      const account = {
        id: 42,
        fullName: "API test",
        roleName: "MEMBER",
        status: "ACTIVE",
        email: "api@example.test",
      };
      const payload = btoa(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      );
      sessionStorage.setItem(
        "sportiva-session",
        JSON.stringify({
          mode: "api",
          user: account,
          token: `e30.${payload}.test`,
        }),
      );
      vi.spyOn(api, "classes").mockResolvedValue([
        {
          id: 8,
          className: "Lớp thật",
          sportId: 1,
          roomId: 1,
          coachId: 3,
          scheduleTime: "2099-12-01T09:00:00",
          durationMinutes: 60,
          requiredAccessLevel: "STANDARD",
          maxCapacity: 20,
          status: "SCHEDULED",
        },
      ]);
      vi.spyOn(api, "activeSubscription").mockResolvedValue({
        id: 1,
        memberId: 42,
        packageId: 2,
        startDate: "2020-01-01",
        endDate: "2099-12-31",
        status: "ACTIVE",
      });
      vi.spyOn(api, "membershipPackages").mockResolvedValue([
        {
          id: 2,
          packageName: "Gói API",
          durationDays: 30,
          price: 500000,
          accessLevel: "STANDARD",
          status: "ACTIVE",
        },
      ]);
      vi.spyOn(api, "capacity").mockResolvedValue(5);
      const booking = vi.spyOn(api, "book");
      if (success)
        booking.mockResolvedValue({
          id: 1,
          classId: 8,
          memberId: 42,
          status: "BOOKED",
          bookedAt: "2099-12-01T08:00:00",
        });
      else
        booking.mockRejectedValue(
          new Error("Gói chưa đủ điều kiện từ backend"),
        );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      const close = vi.fn();
      render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter>
                <BookingForm classId={8} onClose={close} />
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );
      await screen.findByRole("option", { name: /Lớp thật/ });
      await user.click(
        screen.getByRole("button", { name: "Xác nhận đăng ký" }),
      );
      await waitFor(() => expect(booking).toHaveBeenCalledWith(8, 42));
      if (success) await waitFor(() => expect(close).toHaveBeenCalled());
      else {
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Gói chưa đủ điều kiện từ backend",
        );
        expect(close).not.toHaveBeenCalled();
      }
      client.clear();
    },
  );
});

describe("BookingForm quyền STANDARD/VIP theo thành viên API", () => {
  const active = {
    id: 1,
    memberId: 42,
    packageId: 2,
    startDate: "2020-01-01",
    endDate: "2099-12-31",
    status: "ACTIVE",
  };
  const standard = {
    id: 2,
    packageName: "Gói API",
    durationDays: 30,
    price: 500000,
    accessLevel: "STANDARD",
    status: "ACTIVE",
  };
  const classes = [
    {
      id: 8,
      className: "STANDARD API",
      sportId: 1,
      roomId: 1,
      coachId: 3,
      scheduleTime: "2099-12-01T09:00:00",
      durationMinutes: 60,
      requiredAccessLevel: "STANDARD" as const,
      maxCapacity: 20,
      status: "SCHEDULED",
    },
    {
      id: 9,
      className: "VIP API",
      sportId: 1,
      roomId: 1,
      coachId: 3,
      scheduleTime: "2099-12-02T09:00:00",
      durationMinutes: 60,
      requiredAccessLevel: "VIP" as const,
      maxCapacity: 20,
      status: "SCHEDULED",
    },
  ];
  beforeEach(() => {
    vi.spyOn(api, "classes").mockResolvedValue(classes);
    vi.spyOn(api, "activeSubscription").mockResolvedValue(active);
    vi.spyOn(api, "membershipPackages").mockResolvedValue([standard]);
    vi.spyOn(api, "capacity").mockResolvedValue(5);
    vi.spyOn(api, "users").mockResolvedValue([]);
    vi.spyOn(api, "book").mockResolvedValue({
      id: 1,
      classId: 8,
      memberId: 42,
      status: "BOOKED",
      bookedAt: "2099-12-01T08:00:00",
    });
  });
  function page(classId?: number, role = "MEMBER", memberId?: number) {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-jwt",
        user: {
          id: role === "MEMBER" ? 42 : 1,
          fullName: "API test",
          roleName: role,
          status: "ACTIVE",
        },
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const close = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter>
              <BookingForm
                classId={classId}
                memberId={memberId}
                onClose={close}
              />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    return { client, close };
  }
  const submit = () => screen.getByRole("button", { name: "Xác nhận đăng ký" });

  it.each([
    ["STANDARD", 8, true],
    ["STANDARD", 9, false],
    ["VIP", 8, true],
    ["VIP", 9, true],
  ] as const)(
    "%s booking class %s is allowed=%s",
    async (level, classId, allowed) => {
      vi.mocked(api.membershipPackages).mockResolvedValue([
        { ...standard, accessLevel: level, status: "INACTIVE" },
      ]);
      const { client, close } = page(classId);
      if (allowed) {
        await waitFor(() => expect(submit()).toBeEnabled());
        await userEvent.setup().click(submit());
        await waitFor(() => expect(api.book).toHaveBeenCalledWith(classId, 42));
        await waitFor(() => expect(close).toHaveBeenCalled());
      } else {
        expect(
          await screen.findByText(
            "Cấp gói không đáp ứng cấp yêu cầu của lớp học.",
          ),
        ).toBeVisible();
        expect(submit()).toBeDisabled();
        await userEvent.setup().click(submit());
        expect(api.book).not.toHaveBeenCalled();
      }
      client.clear();
    },
  );

  it("always uses the logged-in MEMBER instead of a supplied memberId", async () => {
    const { client } = page(8, "MEMBER", 99);
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(api.activeSubscription).toHaveBeenCalledWith(42);
    expect(api.activeSubscription).not.toHaveBeenCalledWith(99);
    await userEvent.setup().click(submit());
    await waitFor(() => expect(api.book).toHaveBeenCalledWith(8, 42));
    client.clear();
  });

  it.each([
    [
      "no membership",
      null,
      [standard],
      "Chưa có gói còn hiệu lực. Vui lòng đăng ký hoặc gia hạn gói.",
    ],
    [
      "expired",
      { ...active, endDate: "2020-01-02" },
      [standard],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "future",
      { ...active, startDate: "2099-01-01" },
      [standard],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "cancelled",
      { ...active, status: "CANCELLED" },
      [standard],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "pending",
      { ...active, status: "PENDING_PAYMENT" },
      [standard],
      "Gói tập chưa có hiệu lực hoặc đã hết hạn.",
    ],
    [
      "wrong owner",
      { ...active, memberId: 99 },
      [standard],
      "Gói tập không thuộc thành viên đang chọn.",
    ],
    ["missing package", active, [], "Không tìm thấy quyền lợi của gói tập."],
    [
      "invalid level",
      active,
      [{ ...standard, accessLevel: "GOLD" }],
      "Cấp quyền của gói tập không hợp lệ.",
    ],
  ] as const)(
    "blocks %s with an explicit reason",
    async (_name, subscription, packages, reason) => {
      vi.mocked(api.activeSubscription).mockResolvedValue(subscription);
      vi.mocked(api.membershipPackages).mockResolvedValue([...packages]);
      const { client } = page(8);
      expect(await screen.findByText(reason)).toBeVisible();
      expect(submit()).toBeDisabled();
      expect(api.book).not.toHaveBeenCalled();
      client.clear();
    },
  );

  it.each(["subscription", "catalog"])(
    "blocks while %s is loading",
    async (loading) => {
      if (loading === "subscription")
        vi.mocked(api.activeSubscription).mockImplementation(
          () => new Promise(() => {}),
        );
      else
        vi.mocked(api.membershipPackages).mockImplementation(
          () => new Promise(() => {}),
        );
      const { client } = page(8);
      expect(await screen.findByText("Đang kiểm tra gói tập…")).toBeVisible();
      expect(submit()).toBeDisabled();
      expect(api.book).not.toHaveBeenCalled();
      client.clear();
    },
  );

  it.each(["subscription", "catalog"])(
    "blocks %s errors and supports retry",
    async (failure) => {
      const failing =
        failure === "subscription"
          ? vi.mocked(api.activeSubscription)
          : vi.mocked(api.membershipPackages);
      failing.mockRejectedValueOnce(new Error("Không tải được quyền gói"));
      const { client } = page(8);
      expect(await screen.findByText("Không tải được quyền gói")).toBeVisible();
      expect(submit()).toBeDisabled();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Thử lại kiểm tra gói" }));
      await waitFor(() => expect(submit()).toBeEnabled());
      expect(api.book).not.toHaveBeenCalled();
      client.clear();
    },
  );

  it.each(["RECEPTIONIST", "CENTER_MANAGER"])(
    "%s uses the selected member and blocks while changing members",
    async (role) => {
      let resolveMember!: (value: typeof active) => void;
      vi.mocked(api.activeSubscription).mockImplementation(async (id) => {
        if (id === 99)
          return new Promise<typeof active>((resolve) => {
            resolveMember = resolve;
          });
        return active;
      });
      vi.mocked(api.membershipPackages).mockResolvedValue([
        standard,
        { ...standard, id: 3, accessLevel: "VIP" },
      ]);
      const { client } = page(9, role, 42);
      expect(
        await screen.findByText(
          "Cấp gói không đáp ứng cấp yêu cầu của lớp học.",
        ),
      ).toBeVisible();
      fireEvent.change(screen.getByLabelText("Thành viên"), {
        target: { value: "99" },
      });
      expect(await screen.findByText("Đang kiểm tra gói tập…")).toBeVisible();
      expect(submit()).toBeDisabled();
      expect(api.activeSubscription).not.toHaveBeenCalledWith(1);
      resolveMember({ ...active, memberId: 99, packageId: 3 });
      await waitFor(() => expect(submit()).toBeEnabled());
      await userEvent.setup().click(submit());
      await waitFor(() => expect(api.book).toHaveBeenCalledWith(9, 99));
      client.clear();
    },
  );

  it("rechecks class level when changing class and blocks a forced VIP selection", async () => {
    const { client } = page();
    await screen.findByRole("option", { name: /STANDARD API/ });
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /STANDARD API/ }),
      ).toBeEnabled(),
    );
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText("Lớp học"), "8");
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(screen.getByRole("option", { name: /VIP API/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Lớp học"), {
      target: { value: "9" },
    });
    expect(
      await screen.findByText("Cấp gói không đáp ứng cấp yêu cầu của lớp học."),
    ).toBeVisible();
    expect(submit()).toBeDisabled();
    expect(api.book).not.toHaveBeenCalled();
    client.clear();
  });

  it("blocks cached rights during refetch and after an API error", async () => {
    const { client } = page(8);
    await waitFor(() => expect(submit()).toBeEnabled());
    let reject!: (reason: Error) => void;
    vi.mocked(api.activeSubscription).mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const refetch = client.invalidateQueries({
      queryKey: ["activeSubscription", 42],
    });
    expect(await screen.findByText("Đang kiểm tra gói tập…")).toBeVisible();
    expect(submit()).toBeDisabled();
    reject(new Error("Quyền gói không xác minh được"));
    await refetch;
    expect(
      await screen.findByText("Quyền gói không xác minh được"),
    ).toBeVisible();
    expect(submit()).toBeDisabled();
    expect(api.book).not.toHaveBeenCalled();
    client.clear();
  });

  it.each([
    ["full", { ...classes[0] }, 0, "Lớp đã đủ số lượng đăng ký."],
    [
      "after expiration",
      { ...classes[0] },
      5,
      "Buổi học diễn ra sau ngày hết hạn gói.",
    ],
    [
      "past",
      { ...classes[0], scheduleTime: "2020-01-01T08:00:00" },
      5,
      "Lớp không còn mở đăng ký.",
    ],
    [
      "cancelled",
      { ...classes[0], status: "CANCELLED" },
      5,
      "Lớp không còn mở đăng ký.",
    ],
  ])(
    "preserves existing booking check: %s",
    async (name, clazz, capacity, reason) => {
      vi.mocked(api.classes).mockResolvedValue([clazz]);
      vi.mocked(api.capacity).mockResolvedValue(capacity);
      if (name === "after expiration")
        vi.mocked(api.activeSubscription).mockResolvedValue({
          ...active,
          endDate: "2099-11-30",
        });
      const { client } = page(8);
      expect(await screen.findByText(reason)).toBeVisible();
      expect(submit()).toBeDisabled();
      expect(api.book).not.toHaveBeenCalled();
      client.clear();
    },
  );

  it("keeps the form open if backend rejects a duplicate or schedule conflict despite matching levels", async () => {
    vi.mocked(api.book).mockRejectedValue(
      new Error("Học viên bị trùng lịch hoặc đã đăng ký"),
    );
    const { client, close } = page(8);
    await waitFor(() => expect(submit()).toBeEnabled());
    await userEvent.setup().click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Học viên bị trùng lịch hoặc đã đăng ký",
    );
    expect(close).not.toHaveBeenCalled();
    client.clear();
  });
});
