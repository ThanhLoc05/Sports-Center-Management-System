import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Layout from "../components/Layout";

function shell() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<h1>Nội dung trung tâm</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
describe("Khung giao diện", () => {
  it("renders navigation and the active page", () => {
    shell();
    expect(
      screen.getByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Nội dung trung tâm" }),
    ).toBeVisible();
  });
  it("opens the mobile menu and closes it with Escape", async () => {
    shell();
    const button = screen.getByRole("button", { name: "Mở điều hướng" });
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
