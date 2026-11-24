import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { trainingApi } from "../lib/training-api";
import type { TrainingProgram } from "../lib/training-api";
import TrainingPrograms from "../pages/TrainingPrograms";

function setup(course = false) {
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: `e30.${payload}.test`,
      user: {
        id: 42,
        fullName: "Học viên",
        email: "member@example.test",
        roleName: "MEMBER",
        status: "ACTIVE",
      },
    }),
  );
  vi.spyOn(api, "sports").mockResolvedValue([
    { id: 1, name: "Yoga", description: "" },
  ]);
  vi.spyOn(api, "rooms").mockResolvedValue([
    { id: 1, name: "Phòng 1", capacity: 20, description: "" },
  ]);
  vi.spyOn(api, "coaches").mockResolvedValue([
    {
      coachId: 3,
      fullName: "HLV Mai",
      professionalLevel: null,
      specialties: null,
      bio: null,
    },
  ]);
  vi.spyOn(trainingApi, "access").mockResolvedValue({
    hasActiveMembership: true,
    accessLevel: "VIP",
    endDate: "2099-12-31",
    maxConcurrentClasses: 2,
    activeClassCount: 0,
    sportLimit: null,
    courseDiscountPercent: 10,
  });
  const program: TrainingProgram = {
    id: 8,
    kind: course ? "COURSE" : "REGULAR",
    name: course ? "Yoga 12 buổi" : "Yoga chiều",
    sportId: 1,
    sportName: "Yoga",
    description: "Luyện thăng bằng",
    trainingLevel: "Cơ bản",
    maxCapacity: 20,
    requiredAccessLevel: "STANDARD",
    status: course ? "OPEN" : "ACTIVE",
    slots: [1, 3, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: "17:50:00",
      endTime: "18:50:00",
      coachId: 3,
      roomId: 1,
      coachName: "HLV Mai",
      roomName: "Phòng 1",
    })),
    discountPercent: course ? 10 : 0,
    remainingCapacity: 15,
    eligible: true,
    eligibilityReason: "",
    registered: false,
    ...(course
      ? {
          startDate: "2099-12-01",
          endDate: "2099-12-31",
          totalSessions: 12,
          price: 1000000,
          payableAmount: 900000,
        }
      : {}),
  };
  const search = vi.spyOn(trainingApi, "search").mockResolvedValue([program]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TrainingPrograms kind={course ? "COURSE" : "REGULAR"} />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { search, program, user: userEvent.setup() };
}
describe("sport-first registration", () => {
  it("waits for sport selection and sends availability as an additional filter", async () => {
    const { search, user } = setup();
    expect(await screen.findByText("Chọn bộ môn bạn muốn học")).toBeVisible();
    expect(search).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Yoga" }));
    expect(
      await screen.findByRole("heading", { name: "Yoga chiều" }),
    ).toBeVisible();
    expect(search).toHaveBeenLastCalledWith(
      "REGULAR",
      expect.objectContaining({ sportId: 1, memberId: 42, availability: [] }),
    );
    await user.click(screen.getByRole("button", { name: "Thêm khoảng rảnh" }));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "REGULAR",
        expect.objectContaining({ availability: [{ dayOfWeek: 1 }] }),
      ),
    );
  });
  it("registers the parent class rather than one dated session", async () => {
    const { user } = setup();
    const register = vi
      .spyOn(trainingApi, "register")
      .mockResolvedValue({
        id: 9,
        regularClassId: 8,
        className: "Yoga chiều",
        memberId: 42,
        subscriptionId: 1,
        validFrom: "2099-12-01",
        validUntil: "2099-12-31",
        status: "ACTIVE",
      });
    await user.click(
      await screen.findByRole("button", { name: "Yoga" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Đăng ký lịch lớp" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(register).toHaveBeenCalledWith(8, 42));
  });
  it("shows course dates, total sessions and discounted tuition", async () => {
    const { user } = setup(true);
    await user.click(
      await screen.findByRole("button", { name: "Yoga" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Yoga 12 buổi" }),
    ).toBeVisible();
    expect(screen.getByText(/3 buổi\/tuần · 12 buổi/)).toBeVisible();
    expect(screen.getByText("Giảm 10% theo gói")).toBeVisible();
  });
});
