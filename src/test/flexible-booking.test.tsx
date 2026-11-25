import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { FlexibleBooking } from "../components/FlexibleBooking";
import { request } from "../lib/api";
import type { SportClass } from "../lib/types";

vi.mock("../lib/api", () => ({
  api: { capacity: vi.fn().mockResolvedValue(3) },
  request: vi.fn(),
}));

const base: SportClass = {
  id: 10, className: "Cầu lông sáng", sportId: 1, roomId: 6, coachId: 3,
  scheduleTime: "2098-02-01T08:00:00", durationMinutes: 45, maxCapacity: 6,
  status: "SCHEDULED", requiredAccessLevel: "STANDARD",
};
const options = [
  base,
  { ...base, id: 11, className: "Cầu lông chiều", scheduleTime: "2098-02-02T15:00:00" },
  { ...base, id: 12, className: "Yoga sáng", sportId: 2, scheduleTime: "2098-02-01T09:00:00" },
];

function open() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FlexibleBooking classes={options} sports={{ 1: "Cầu lông", 2: "Yoga" }} rooms={{ 6: "Sân A" }}
      coaches={[{ coachId: 3, fullName: "Coach A", specialties: null, professionalLevel: null, bio: null }]}
      subscription={{ id: 2, memberId: 5, packageId: 4, startDate: "2098-01-01", endDate: "2098-03-01", status: "ACTIVE" }}
      level="VIP" onClose={onClose} />
  </QueryClientProvider>);
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/bookings/my-conduct") return { held: 1, limit: 5, violations: 0 };
    if (path === "/bookings/my-waitlist") return [];
    return [];
  });
});

it("keeps selections from different days and sends a single batch request", async () => {
  const close = open();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Bộ môn"), "1");
  const first = await screen.findByRole("checkbox", { name: /Cầu lông sáng.*Coach A.*Sân A.*Còn 3/ });
  const second = screen.getByRole("checkbox", { name: /Cầu lông chiều/ });
  await user.click(first);
  await user.click(second);
  expect(screen.queryByRole("checkbox", { name: /Yoga sáng/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Xác nhận đăng ký" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(vi.mocked(request).mock.calls.filter(([path]) => path === "/bookings/batch"))
    .toEqual([["/bookings/batch", { method: "POST", body: '{"classIds":[10,11]}' }]]);
});

it("keeps the draft open after a rejected batch", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/bookings/batch") throw new Error("Buổi #10 đã đầy.");
    if (path === "/bookings/my-conduct") return { held: 1, limit: 5, violations: 0 };
    return [];
  });
  const close = open();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Bộ môn"), "1");
  await user.click(await screen.findByRole("checkbox", { name: /Cầu lông sáng.*Còn 3/ }));
  await user.click(screen.getByRole("button", { name: "Xác nhận đăng ký" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Buổi #10 đã đầy.");
  expect(screen.getByText("Danh sách dự kiến (1 buổi)")).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
});
