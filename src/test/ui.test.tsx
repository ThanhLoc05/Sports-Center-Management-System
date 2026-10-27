import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, FormModal, Modal } from "../components/ui";
import { matches, normalize } from "../lib/utils";
describe("Operational UI", () => {
  it("supports Vietnamese search with and without diacritics", () => {
    expect(normalize("Điểm danh")).toBe("diem danh");
    expect(matches("nguyen minh", "Nguyễn Minh Anh")).toBe(true);
    expect(matches("yoga", "Pilates")).toBe(false);
  });
  it("clamps pagination after filtering and exposes disabled previous/next buttons", async () => {
    const user = userEvent.setup();
    const columns = [
      {
        key: "name",
        label: "Tên",
        render: (row: { id: number; name: string }) => row.name,
      },
    ];
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
    }));
    const { rerender } = render(
      <DataTable rows={rows} columns={columns} pageSize={8} />,
    );
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(screen.getByText("Item 12")).toBeVisible();
    rerender(
      <DataTable rows={rows.slice(0, 1)} columns={columns} pageSize={8} />,
    );
    expect(screen.getByText("Item 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  });
  it("shows validation failures and keeps the form open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <FormModal
        title="Form test"
        onClose={onClose}
        onSubmit={async () => {
          throw new Error("Backend không chấp nhận");
        }}
      >
        <label>
          Tên
          <input name="name" defaultValue="Test" />
        </label>
      </FormModal>,
    );
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backend không chấp nhận",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
  it("provides labelled dialogs and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Xem chi tiết" onClose={onClose}>
        <input aria-label="Nội dung" />
      </Modal>,
    );
    expect(
      screen.getByRole("dialog", { name: "Xem chi tiết" }),
    ).toHaveAttribute("aria-modal", "true");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
