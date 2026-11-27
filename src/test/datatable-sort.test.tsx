/** Phase 3 UX/UI: bảng sắp xếp theo cột có hàm sort; cột không có sort giữ tiêu đề thường. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable } from "../components/ui";

const rows = [
  { id: 1, name: "Bình", amount: 300 },
  { id: 2, name: "An", amount: 100 },
  { id: 3, name: "Chi", amount: 200 },
];

function names() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1)
    .map((row) => row.querySelector("td")!.textContent);
}

describe("DataTable sorting", () => {
  it("sorts ascending, descending, then restores the original order", async () => {
    render(
      <DataTable
        rows={rows}
        label="Danh sách thử"
        columns={[
          { key: "name", label: "Tên", render: (r) => r.name, sort: (r) => r.name },
          { key: "amount", label: "Số tiền", render: (r) => r.amount, sort: (r) => r.amount },
          { key: "note", label: "Ghi chú", render: () => "-" },
        ]}
      />,
    );
    expect(names()).toEqual(["Bình", "An", "Chi"]);
    const byAmount = screen.getByRole("button", { name: "Sắp xếp theo Số tiền" });
    await userEvent.click(byAmount);
    expect(names()).toEqual(["An", "Chi", "Bình"]);
    expect(byAmount.closest("th")).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(byAmount);
    expect(names()).toEqual(["Bình", "Chi", "An"]);
    expect(byAmount.closest("th")).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(byAmount);
    expect(names()).toEqual(["Bình", "An", "Chi"]);
    expect(screen.queryByRole("button", { name: "Sắp xếp theo Ghi chú" })).not.toBeInTheDocument();
  });
});
