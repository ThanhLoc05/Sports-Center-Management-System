import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ClassCancellationDialog from "../components/ClassCancellationDialog";
import { api } from "../lib/api";
import type { SportClass } from "../lib/types";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ session: { user: { id: 185 } } }) }));
vi.mock("../lib/catalog", () => ({ useCatalog: () => ({ rooms: { 1: "Sân A" } }) }));
vi.mock("../lib/api", () => ({
  api: { classCancellation: vi.fn(), cancelClass: vi.fn(), coaches: vi.fn().mockResolvedValue([]) },
}));

it("requires a reason and details for Other, preserving the form on API failure", async () => {
  const session: SportClass = {
    id: 7, className: "Buổi Cầu lông", sportId: 1, coachId: 3, roomId: 1,
    scheduleTime: "2099-11-30T14:00:00", durationMinutes: 60, maxCapacity: 10,
    requiredAccessLevel: "STANDARD", status: "SCHEDULED",
  };
  vi.mocked(api.classCancellation).mockResolvedValue({ canCancel: true, reason: null, booked: 2, waitlisted: 1 });
  vi.mocked(api.cancelClass).mockRejectedValueOnce(new Error("Buổi đã bắt đầu."));
  const close = vi.fn();
  const saved = vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <ClassCancellationDialog item={session} onClose={close} onSaved={saved} />
  </QueryClientProvider></MemoryRouter>);
  const user = userEvent.setup();
  const dialog = within(screen.getByRole("dialog", { name: "Hủy buổi học" }));
  expect(await dialog.findByText(/2 Member đã xác nhận/)).toHaveTextContent("1 Member trong danh sách chờ");
  const submit = dialog.getByRole("button", { name: "Xác nhận hủy buổi học" });
  expect(submit).toBeDisabled();
  await user.selectOptions(dialog.getByLabelText("Lý do hủy"), "OTHER");
  expect(submit).toBeDisabled();
  await user.type(dialog.getByLabelText("Mô tả lý do"), "Sự cố cấp điện");
  await user.click(submit);
  expect(await dialog.findByRole("alert")).toHaveTextContent("Buổi đã bắt đầu.");
  expect(dialog.getByLabelText("Mô tả lý do")).toHaveValue("Sự cố cấp điện");
  expect(api.cancelClass).toHaveBeenCalledWith(7, { reason: "OTHER", description: "Sự cố cấp điện", note: undefined });
  expect(saved).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
