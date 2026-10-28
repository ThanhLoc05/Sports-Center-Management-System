import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
          maxCapacity: 20,
          status: "SCHEDULED",
        },
      ]);
      vi.spyOn(api, "subscriptions").mockResolvedValue([
        {
          id: 1,
          memberId: 42,
          packageId: 2,
          startDate: "2020-01-01",
          endDate: "2099-12-31",
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
