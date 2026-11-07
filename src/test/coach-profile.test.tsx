import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import {
  CoachProfileCard,
  CoachProfileDialog,
} from "../components/CoachProfile";

const profile = {
  coachId: 4,
  fullName: "HLV Kiểm Thử",
  professionalLevel: "HLV cấp độ nâng cao",
  specialties: "Yoga, Pilates",
  bio: "Hướng dẫn an toàn và phù hợp mục tiêu.",
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function loginCoach() {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-token",
      user: {
        id: 4,
        email: "coach@example.test",
        fullName: profile.fullName,
        phone: "0900000004",
        roleName: "COACH",
        status: "ACTIVE",
      },
    }),
  );
}

function renderWithSession(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>{element}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("coach professional profile", () => {
  it("shows a public professional profile and assigned classes without contact details", async () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-token",
        user: {
          id: 20,
          email: "member@example.test",
          fullName: "Hội viên thử",
          phone: "0900000020",
          roleName: "MEMBER",
          status: "ACTIVE",
        },
      }),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/users/4/coach-profile"))
        return json({ ...profile, email: "private@example.test", phone: "0900000004" });
      if (url.endsWith("/classes?coachId=4"))
        return json([
          {
            id: 1,
            className: "Yoga buổi sáng",
            sportId: 2,
            coachId: 4,
            roomId: 1,
            maxCapacity: 15,
            scheduleTime: "2026-11-08T08:00:00",
            durationMinutes: 60,
            requiredAccessLevel: "STANDARD",
            status: "SCHEDULED",
          },
        ]);
      if (url.endsWith("/sports"))
        return json([{ id: 2, sportName: "Yoga" }]);
      if (url.endsWith("/rooms"))
        return json([{ id: 1, roomName: "Studio", capacity: 15 }]);
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = renderWithSession(
      <CoachProfileDialog coachId={4} onClose={() => {}} />,
    );

    expect(await screen.findByText("HLV Kiểm Thử")).toBeVisible();
    expect(screen.getByText("HLV cấp độ nâng cao")).toBeVisible();
    expect(screen.getByText("Yoga, Pilates")).toBeVisible();
    expect(screen.getByText("Hướng dẫn an toàn và phù hợp mục tiêu.")).toBeVisible();
    expect(await screen.findByText("Yoga buổi sáng")).toBeVisible();
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("0900000004")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    client.clear();
  });

  it("lets a coach update their own professional profile through the API", async () => {
    loginCoach();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PUT" ? json({ ...profile, professionalLevel: "HLV chuyên nghiệp" }) : json(profile),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession(<CoachProfileCard coachId={4} />);
    expect(await screen.findByText("HLV cấp độ nâng cao")).toBeVisible();
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Cập nhật hồ sơ nghề nghiệp" }),
    );
    const level = await screen.findByLabelText("Trình độ");
    await userEvent.setup().clear(level);
    await userEvent.setup().type(level, "HLV chuyên nghiệp");
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Lưu thay đổi" }),
    );
    expect(await screen.findByText("HLV chuyên nghiệp")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/4/coach-profile",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          professionalLevel: "HLV chuyên nghiệp",
          specialties: "Yoga, Pilates",
          bio: "Hướng dẫn an toàn và phù hợp mục tiêu.",
        }),
      }),
    );
  });
});
