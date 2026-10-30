import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import Layout from "../components/Layout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { demoSession } from "../lib/demo";
import { ToastProvider } from "../components/ui";

function shell() {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify(demoSession("CENTER_MANAGER")),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<h1>Nội dung trung tâm</h1>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
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
