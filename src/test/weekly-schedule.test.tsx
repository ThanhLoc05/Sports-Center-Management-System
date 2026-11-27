import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import WeeklySchedule from "../pages/WeeklySchedule";
import { ApiError } from "../lib/api";
import { weeklyScheduleApi } from "../lib/weekly-schedule-api";
import { addDays, localDate } from "../lib/utils";
import type {
  PreviewOccurrence,
  SavedWeeklyWindow,
} from "../lib/weekly-schedule-api";

vi.mock("../lib/auth", () => ({
  useAuth: () => ({ session: { mode: "api", user: { id: 185 } } }),
}));
vi.mock("../lib/catalog", () => ({
  useCatalog: () => ({
    sports: { 1: "Cầu lông", 2: "Yoga" },
    rooms: { 3: "Sân A", 4: "Phòng B" },
    roomRows: [
      { id: 3, name: "Sân A", capacity: 10 },
      { id: 4, name: "Phòng B", capacity: 15 },
      { id: 7, name: "Phòng Yoga", capacity: 15 },
    ],
    loading: false,
    error: null,
  }),
}));
vi.mock("../lib/api", async (original) => {
  const current = await original<typeof import("../lib/api")>();
  return {
    ...current,
    api: {
      classes: vi.fn().mockResolvedValue([{ id: 1, coachId: 5, roomId: 3 }, { id: 2, coachId: 7, roomId: 4 }]),
      coaches: vi.fn().mockResolvedValue([
        { coachId: 5, fullName: "An", specialties: "Cầu lông – kỹ thuật" },
        { coachId: 6, fullName: "Bình" },
        { coachId: 7, fullName: "Linh", specialties: "Hatha Yoga" },
      ]),
    },
  };
});
vi.mock("../lib/weekly-schedule-api", () => ({
  weeklyScheduleApi: { template: vi.fn(), save: vi.fn(), syncPreview: vi.fn(), preview: vi.fn(), confirm: vi.fn(), published: vi.fn() },
}));

beforeEach(() => {
  for (const method of Object.values(weeklyScheduleApi)) vi.mocked(method).mockReset();
  vi.mocked(weeklyScheduleApi.template).mockResolvedValue({ version: 0, name: "Lịch chuẩn", entries: [] });
  vi.mocked(weeklyScheduleApi.save).mockImplementation(async (version, entries) => ({
    version: version + 1, name: "Lịch chuẩn", entries,
  }));
});

it("reviews multiple linked sessions before requesting a single cancellation", async () => {
  const user = setup();
  await user.click(await screen.findByRole("button", { name: "Đối chiếu lịch tập" }));
  expect(screen.getByLabelText("Phạm vi đối chiếu")).toHaveValue("FUTURE_PUBLISHED");
  const orphans = [1, 2].map((classId) => ({
    action: "ORPHAN" as const, classId, className: `Yoga ${classId}`, date: "2026-12-07",
    slotCode: "SLOT_01", booked: 1, waitlisted: 1, message: null,
  }));
  vi.mocked(weeklyScheduleApi.syncPreview)
    .mockResolvedValueOnce({ mode: "FUTURE_PUBLISHED", changes: orphans, token: "scan" })
    .mockResolvedValueOnce({
      mode: "FUTURE_PUBLISHED",
      changes: orphans.map((row) => ({ ...row, action: "CANCEL" })),
      token: "selected",
    });
  await user.click(screen.getByRole("button", { name: /^Đối chiếu$/ }));
  expect(await screen.findByText("07/12/2026 – 13/12/2026 · 2 buổi")).toBeVisible();
  expect(await screen.findByText("Sân A")).toBeVisible();
  const metrics = screen.getByText("Buổi chênh lệch phát hiện").closest("dl");
  expect(metrics).toHaveTextContent("Buổi chênh lệch phát hiện2");
  expect(metrics).toHaveTextContent("Buổi đã chọn xử lý0");
  await user.click(screen.getByRole("button", { name: /Chọn tất cả buổi ngoài mẫu/ }));
  expect(metrics).toHaveTextContent("Buổi đã chọn xử lý2");
  expect(screen.getByText(/Nếu xác nhận hủy/)).toHaveTextContent("2 lượt đăng ký cũng sẽ bị hủy");
  await user.click(screen.getByRole("button", { name: "Xem trước xử lý" }));
  expect(await screen.findByRole("button", { name: "Xác nhận hủy 2 buổi và áp dụng" })).toBeEnabled();
  expect(weeklyScheduleApi.save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Xác nhận hủy 2 buổi và áp dụng" }));
  expect(weeklyScheduleApi.save).toHaveBeenCalledWith(0, [],
    expect.objectContaining({ orphanIds: [1, 2], token: "selected" }));
});

function setup() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <WeeklySchedule />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function addClass(
  user: ReturnType<typeof userEvent.setup>,
  cell = /Thứ Hai · Ca 05/,
  name = "Cầu lông A",
  additionalDays = ["Thứ Tư", "Thứ Sáu"],
) {
  await waitFor(() => expect(screen.getByRole("button", { name: cell })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: cell }));
  await user.click(screen.getByRole("button", { name: "Thêm lớp" }));
  const form = within(
    screen.getByRole("dialog", { name: "Thêm lớp vào lịch tuần mẫu" }),
  );
  fireEvent.change(form.getByLabelText("Tên lớp học"), { target: { value: name } });
  for (const day of additionalDays) await user.click(form.getByLabelText(day));
  await user.selectOptions(form.getByLabelText("Bộ môn"), "1");
  await form.findByRole("option", { name: "An" });
  await user.selectOptions(form.getByLabelText("Huấn luyện viên"), "5");
  await user.selectOptions(form.getByLabelText("Sân/phòng"), "3");
  fireEvent.change(form.getByLabelText("Sức chứa"), { target: { value: "8" } });
  await user.click(form.getByRole("button", { name: "Lưu vào mẫu" }));
}

async function closeCell(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Đóng hộp thoại",
    }),
  );
}

it("lập ma trận 42 khung, lưu nhiều ngày, chặn trùng tài nguyên và sửa hoặc xóa cấu hình trong mẫu", async () => {
  const user = setup();
  expect(within(screen.getByRole("table")).getAllByRole("button")).toHaveLength(
    42,
  );
  await addClass(user);
  const cell = within(screen.getByRole("dialog", { name: /Thứ Hai · Ca 05/ }));
  expect(cell.getByText("Cầu lông A")).toBeVisible();
  expect(cell.getByText(/8 chỗ/)).toBeVisible();
  expect(cell.getByText("T2, T4, T6")).toBeVisible();
  await closeCell(user);
  expect(
    screen.getByRole("button", { name: "Thứ Tư · Ca 05 · 1 lớp" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Thứ Sáu · Ca 05 · 1 lớp" }),
  ).toBeVisible();

  await addClass(user, /Thứ Hai · Ca 05/, "Cầu lông B", ["Thứ Tư"]);
  const invalid = within(
    screen.getByRole("dialog", { name: "Thêm lớp vào lịch tuần mẫu" }),
  );
  expect(await invalid.findByRole("alert")).toHaveTextContent(
    /Thứ Hai.*HLV An.*Sân A.*Thứ Tư/,
  );
  await user.selectOptions(invalid.getByLabelText("Huấn luyện viên"), "6");
  await user.selectOptions(invalid.getByLabelText("Sân/phòng"), "4");
  await user.click(invalid.getByRole("button", { name: "Lưu vào mẫu" }));
  const updatedCell = within(screen.getByRole("dialog", { name: /Ca 05/ }));
  expect(await updatedCell.findByText("Cầu lông B")).toBeVisible();
  await user.click(
    updatedCell.getByRole("button", { name: "Chỉnh sửa Cầu lông B" }),
  );
  const edit = within(
    screen.getByRole("dialog", { name: "Chỉnh sửa cấu hình lớp" }),
  );
  await user.clear(edit.getByLabelText("Tên lớp học"));
  await user.type(edit.getByLabelText("Tên lớp học"), "Cầu lông mới");
  await user.click(edit.getByRole("button", { name: "Lưu vào mẫu" }));
  const renamed = within(
    screen.getByRole("dialog", { name: /Thứ Hai · Ca 05/ }),
  );
  expect(await renamed.findByText("Cầu lông mới")).toBeVisible();
  await user.click(
    renamed.getByRole("button", { name: "Xóa Cầu lông mới khỏi mẫu" }),
  );
  expect(renamed.queryByText("Cầu lông mới")).not.toBeInTheDocument();
  expect(weeklyScheduleApi.preview).not.toHaveBeenCalled();
  expect(weeklyScheduleApi.confirm).not.toHaveBeenCalled();
});

it("lọc HLV và sân/phòng khi chọn hoặc đổi bộ môn", async () => {
  const user = setup();
  const slot = await screen.findByRole("button", { name: /Thứ Hai · Ca 05/ });
  await waitFor(() => expect(slot).toBeEnabled());
  await user.click(slot);
  await user.click(screen.getByRole("button", { name: "Thêm lớp" }));
  const form = within(screen.getByRole("dialog", { name: "Thêm lớp vào lịch tuần mẫu" }));
  await user.selectOptions(form.getByLabelText("Bộ môn"), "2");
  expect(await form.findByRole("option", { name: "Linh" })).toBeVisible();
  expect(form.queryByRole("option", { name: "An" })).toBeNull();
  await user.selectOptions(form.getByLabelText("Huấn luyện viên"), "7");
  await user.selectOptions(form.getByLabelText("Sân/phòng"), "7");
  await user.selectOptions(form.getByLabelText("Bộ môn"), "1");
  expect(form.getByRole("option", { name: "An" })).toBeVisible();
  expect(form.queryByRole("option", { name: "Linh" })).toBeNull();
  expect(form.queryByRole("option", { name: /Phòng Yoga/ })).toBeNull();
  expect(form.getByLabelText("Huấn luyện viên")).toHaveValue("");
  expect(form.getByLabelText("Sân/phòng")).toHaveValue("");
});

it("giữ loại trừ khi xem trước lại sau 409 và công bố đúng số buổi còn hợp lệ", async () => {
  const user = setup();
  const start = localDate(addDays(1));
  const end = new Date(Date.parse(start) + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  const occurrence = {
    sportId: 1,
    coachId: 5,
    roomId: 3,
    maxCapacity: 8,
    slotCode: "SLOT_05",
    className: "Cầu lông A",
    date: start,
  };
  const ready: PreviewOccurrence = {
    ...occurrence,
    key: "ready",
    status: "READY",
  };
  const conflict: PreviewOccurrence = {
    ...occurrence,
    key: "conflict",
    date: end,
    status: "CONFLICT",
    message: "HLV An trùng với buổi Yoga.",
  };
  vi.mocked(weeklyScheduleApi.preview)
    .mockResolvedValueOnce({
      startDate: start,
      endDate: end,
      occurrences: [ready, conflict],
      token: "before-exclusions",
    })
    .mockResolvedValueOnce({
      startDate: start,
      endDate: end,
      occurrences: [
        ready,
        { ...conflict, status: "EXCLUDED", message: undefined },
      ],
      token: "first-token",
    })
    .mockResolvedValueOnce({
      startDate: start,
      endDate: end,
      occurrences: [
        ready,
        { ...conflict, status: "EXCLUDED", message: undefined },
      ],
      token: "fresh-token",
    });
  vi.mocked(weeklyScheduleApi.confirm)
    .mockRejectedValueOnce(
      new ApiError("Lịch đã thay đổi, vui lòng xem trước lại.", 409),
    )
    .mockResolvedValueOnce({
      startDate: start,
      endDate: end,
      created: 1,
      alreadyExisted: 0,
      excluded: 1,
    });

  await addClass(user);
  await closeCell(user);
  expect(screen.getByRole("button", { name: "Công bố lịch" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Lưu & đồng bộ" }));
  await user.selectOptions(screen.getByLabelText("Phạm vi áp dụng khi lưu mẫu"), "TEMPLATE_ONLY");
  await user.click(screen.getByRole("button", { name: /^Lưu mẫu$/ }));
  expect(await screen.findByText("Đã lưu mẫu lịch.")).toBeVisible();
  const publishButton = screen.getByRole("button", { name: "Công bố lịch" });
  await waitFor(() => expect(publishButton).toBeEnabled());
  await user.click(publishButton);
  await user.selectOptions(screen.getByLabelText("Số tuần"), "1");
  await user.click(screen.getByRole("button", { name: "Xem trước lịch" }));
  expect(await screen.findByText(/HLV An trùng với buổi Yoga/)).toBeVisible();
  const payload: SavedWeeklyWindow = { version: 1, startDate: start, weeks: 1, excludedKeys: [] };
  expect(weeklyScheduleApi.save).toHaveBeenCalledWith(0, [
      {
        className: "Cầu lông A",
        sportId: 1,
        coachId: 5,
        roomId: 3,
        maxCapacity: 8,
        weekdays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
        slotCode: "SLOT_05",
        requiredAccessLevel: "STANDARD",
      },
    ]);
  expect(weeklyScheduleApi.preview).toHaveBeenNthCalledWith(1, payload);
  const publish = screen.getByRole("button", { name: "Tạo và công bố 1 buổi" });
  expect(publish).toBeDisabled();
  await user.click(
    within(
      screen.getByText(/HLV An trùng với buổi Yoga/).closest("details")!,
    ).getByRole("button", { name: "Loại trừ cả ngày" }),
  );
  expect(weeklyScheduleApi.preview).toHaveBeenNthCalledWith(2, {
    ...payload,
    excludedKeys: ["conflict"],
  });
  await user.click(publish);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Lịch đã thay đổi",
  );
  expect(publish).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Xem trước lại" }));
  expect(weeklyScheduleApi.preview).toHaveBeenNthCalledWith(3, {
    ...payload,
    excludedKeys: ["conflict"],
  });
  await user.click(publish);
  expect(await screen.findByText("1 buổi đã tạo")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Xem Lịch hoạt động" }),
  ).toHaveAttribute("href", "/schedule");
  expect(weeklyScheduleApi.confirm).toHaveBeenNthCalledWith(
    2,
    { ...payload, excludedKeys: ["conflict"] },
    "fresh-token",
  );
});

it("khóa cấu hình và ngày áp dụng cho đến khi nhận được kết quả xem trước", async () => {
  const user = setup();
  const start = localDate(addDays(1));
  const end = new Date(Date.parse(start) + 27 * 86400000)
    .toISOString()
    .slice(0, 10);
  let finishPreview!: () => void;
  vi.mocked(weeklyScheduleApi.preview).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishPreview = () =>
          resolve({
            startDate: start,
            endDate: end,
            occurrences: [],
            token: "result",
          });
      }),
  );
  await addClass(user);
  await closeCell(user);
  await user.click(screen.getByRole("button", { name: "Lưu & đồng bộ" }));
  await user.selectOptions(screen.getByLabelText("Phạm vi áp dụng khi lưu mẫu"), "TEMPLATE_ONLY");
  await user.click(screen.getByRole("button", { name: /^Lưu mẫu$/ }));
  expect(await screen.findByText("Đã lưu mẫu lịch.")).toBeVisible();
  const publishButton = screen.getByRole("button", { name: "Công bố lịch" });
  await waitFor(() => expect(publishButton).toBeEnabled());
  await user.click(publishButton);
  await user.click(screen.getByRole("button", { name: "Xem trước lịch" }));
  expect(screen.getByLabelText("Ngày bắt đầu")).toBeDisabled();
  expect(screen.getByLabelText("Số tuần")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /Thứ Hai · Ca 05/ }),
  ).toBeDisabled();
  finishPreview();
  expect(
    await screen.findByRole("heading", { name: "Xem trước lịch thực tế" }),
  ).toBeVisible();
});
