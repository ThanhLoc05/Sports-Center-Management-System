import { addDays, localDate } from "../lib/utils";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import Classes, { ClassCoachName } from "../pages/Classes";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";

function show(roleName = "MEMBER", coachId = 9) {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-only",
      user: {
        id: 6,
        fullName: "Test",
        email: "test@example.com",
        roleName,
        status: "ACTIVE",
      },
    }),
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <AuthProvider>
        <ClassCoachName coachId={coachId} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}
describe("public coach name mapping", () => {
  it("shows the public name on Member session results and detail without reading users", async () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-only",
        user: {
          id: 6,
          fullName: "Test",
          email: "test@example.com",
          roleName: "MEMBER",
          status: "ACTIVE",
        },
      }),
    );
    vi.spyOn(api, "coaches").mockResolvedValue([
      {
        coachId: 9,
        fullName: "Public Coach Name",
        professionalLevel: null,
        specialties: null,
        bio: null,
      },
    ]);
    const users = vi.spyOn(api, "users");
    vi.spyOn(api, "classes").mockResolvedValue([
      {
        id: 1,
        className: "Mapping Test Class",
        coachId: 9,
        sportId: 1,
        roomId: 1,
        maxCapacity: 10,
        scheduleTime: `${localDate(addDays(1))}T10:00:00`,
        durationMinutes: 60,
        requiredAccessLevel: "STANDARD",
        status: "SCHEDULED",
      },
    ]);
    vi.spyOn(api, "sports").mockResolvedValue([{ id: 1, name: "Yoga", description: "" }]);
    vi.spyOn(api, "classDetail").mockImplementation(async () => (await api.classes())[0]);
    vi.spyOn(api, "rooms").mockResolvedValue([]);
    vi.spyOn(api, "activeSubscription").mockResolvedValue({
      id: 10, memberId: 6, packageId: 1, status: "ACTIVE",
      startDate: "2020-01-01", endDate: "2099-01-01", selectedSportId: 1,
    });
    vi.spyOn(api, "membershipPackages").mockResolvedValue([{
      id: 1, packageName: "STANDARD", price: 500000, durationDays: 30, status: "ACTIVE", accessLevel: "STANDARD",
    }]);
    vi.spyOn(api, "bookings").mockResolvedValue([]);
    vi.spyOn(api, "capacity").mockResolvedValue(10);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (path) =>
          new Response(JSON.stringify(String(path).endsWith("my-conduct") ? { held: 0, limit: 5, violations: 0 } : []), { status: 200 }),
      ),
    );
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter>
              <Classes />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Public Coach Name ·/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }));
    expect(
      await within(screen.getByRole("dialog")).findByText("Public Coach Name"),
    ).toBeVisible();
    expect(users).not.toHaveBeenCalled();
  });
  it.each(["MEMBER", "COACH", "RECEPTIONIST"])(
    "uses public name without users for %s",
    async (role) => {
      vi.spyOn(api, "coaches").mockResolvedValue([
        {
          coachId: 9,
          fullName: "HLV Nguyễn An",
          professionalLevel: null,
          specialties: null,
          bio: null,
        },
      ]);
      const users = vi.spyOn(api, "users");
      show(role);
      expect(await screen.findByText("HLV Nguyễn An")).toBeInTheDocument();
      expect(users).not.toHaveBeenCalled();
    },
  );
  it("distinguishes missing profile from unassigned coach", async () => {
    vi.spyOn(api, "coaches").mockResolvedValue([]);
    const view = show();
    expect(
      await screen.findByText("Chưa cập nhật tên HLV #9"),
    ).toBeInTheDocument();
    view.unmount();
    show("MEMBER", 0);
    expect(screen.getByText("Chưa phân công HLV")).toBeInTheDocument();
  });
  it("shows loading and allows retry after directory failure", async () => {
    const directory = vi
      .spyOn(api, "coaches")
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce([
        {
          coachId: 9,
          fullName: "Recovered Coach",
          professionalLevel: null,
          specialties: null,
          bio: null,
        },
      ]);
    show();
    expect(screen.getByText("Đang tải tên HLV...")).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "Thử lại" }),
    );
    expect(await screen.findByText("Recovered Coach")).toBeInTheDocument();
    expect(directory).toHaveBeenCalledTimes(2);
  });
});
