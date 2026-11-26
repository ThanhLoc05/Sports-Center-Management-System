import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClassForm } from "../pages/Classes";
import { ToastProvider } from "../components/ui";
import type { AccessLevel, Session, SportClass } from "../lib/types";

vi.mock("../lib/catalog", () => ({
  useCatalog: () => ({
    sports: { 1: "Yoga" },
    rooms: { 1: "Phòng 1" },
    loading: false,
    error: null,
  }),
}));
vi.mock("../lib/hooks", () => ({
  useUsers: () => ({
    data: [{ id: 3, fullName: "HLV", roleName: "COACH", status: "ACTIVE" }],
  }),
}));

const item = (level: AccessLevel): SportClass => ({
  id: 78,
  className: "Yoga",
  sportId: 1,
  roomId: 1,
  coachId: 3,
  maxCapacity: 20,
  scheduleTime: "2099-01-01T08:00:00",
  durationMinutes: 60,
  requiredAccessLevel: level,
  status: "SCHEDULED",
});

describe("ClassForm cấp độ yêu cầu trong API mode", () => {
  it.each([
    [undefined, "STANDARD"],
    [undefined, "VIP"],
    ["STANDARD", "STANDARD"],
    ["STANDARD", "VIP"],
    ["VIP", "VIP"],
    ["VIP", "STANDARD"],
  ] as const)(
    "saves existing %s as %s",
    async (existingLevel, selectedLevel) => {
      const session: Session = {
        mode: "api",
        token: "test-jwt",
        user: {
          id: 1,
          fullName: "Quản lý",
          email: "manager@example.test",
          phone: "",
          roleName: "CENTER_MANAGER",
          status: "ACTIVE",
        },
      };
      sessionStorage.setItem("sportiva-session", JSON.stringify(session));
      const fetch = vi.fn(async (url: string, _init: RequestInit) => new Response(JSON.stringify(
        url === "/api/v1/users/coaches"
          ? [{ coachId: 3, fullName: "HLV", specialties: "Yoga", professionalLevel: null, bio: null }]
          : item(selectedLevel),
      ), { headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetch);
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const onClose = vi.fn();
      render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <ClassForm
              item={existingLevel ? item(existingLevel) : undefined}
              onClose={onClose}
            />
          </ToastProvider>
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      expect(screen.getByLabelText("Cấp độ yêu cầu")).toHaveValue(
        existingLevel ?? "STANDARD",
      );
      expect(
        Array.from(
          (screen.getByLabelText("Cấp độ yêu cầu") as HTMLSelectElement).options,
          (option) => option.value,
        ),
      ).toEqual(["STANDARD", "VIP"]);
      // Không chạm vào select khi giữ nguyên cấp: kiểm tra giá trị mặc định
      // và tránh che lỗi tự đổi VIP về STANDARD lúc lưu.
      if (selectedLevel !== (existingLevel ?? "STANDARD")) {
        await user.selectOptions(
          screen.getByLabelText("Cấp độ yêu cầu"),
          selectedLevel,
        );
      }
      if (existingLevel) await screen.findByRole("option", { name: "HLV" });
      if (!existingLevel) {
        await user.type(screen.getByLabelText("Tên lớp học"), "Yoga");
        await user.selectOptions(screen.getByLabelText("Bộ môn"), "1");
        await user.selectOptions(screen.getByLabelText("Phòng tập"), "1");
        await screen.findByRole("option", { name: "HLV" });
        await user.selectOptions(screen.getByLabelText("Huấn luyện viên"), "3");
        expect(screen.queryByLabelText("Ngày và giờ bắt đầu")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Ca học").querySelectorAll('option[value^="SLOT_"]')).toHaveLength(6);
        fireEvent.change(screen.getByLabelText("Ngày học (giờ Việt Nam)"), {
          target: { value: "2099-01-01" },
        });
        await user.selectOptions(screen.getByLabelText("Ca học"), "SLOT_02");
      }
      await user.click(
        screen.getByRole("button", {
          name: existingLevel ? "Lưu lớp học" : "Tạo lớp học",
        }),
      );
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      const writes = fetch.mock.calls.filter(([, init]) => init.method === "POST" || init.method === "PUT");
      expect(writes).toHaveLength(1);
      const [url, init] = writes[0];
      expect(url).toBe(
        existingLevel ? "/api/v1/classes/78" : "/api/v1/classes",
      );
      expect(init.method).toBe(existingLevel ? "PUT" : "POST");
      expect(JSON.parse(String(init.body))).toMatchObject({
        requiredAccessLevel: selectedLevel,
        scheduleTime: "2099-01-01T08:00:00",
        durationMinutes: existingLevel ? 60 : 90,
      });
      client.clear();
    },
  );
});
