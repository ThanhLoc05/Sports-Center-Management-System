import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import Welcome from "../pages/Welcome";

it("Welcome ẩn yoga2/yoga 3 nhưng vẫn giữ các môn thật và dữ liệu API gốc", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const sports = [
    { id: 1, name: "Yoga", description: "" },
    { id: 2, name: "Fitness", description: "" },
    { id: 12, name: "yoga 3", description: "abc" },
    { id: 13, name: "yoga2", description: "" },
    { id: 14, name: "Bộ môn mới", description: "Mô tả thật" },
  ];
  vi.spyOn(api, "sports").mockResolvedValue(sports);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>
          <Welcome />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("heading", { name: "Bộ môn mới" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: /^Yoga$/ }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "yoga2" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "yoga 3" }),
  ).not.toBeInTheDocument();
  expect(client.getQueryData(["sports"])).toHaveLength(5);
});
