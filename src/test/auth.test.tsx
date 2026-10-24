import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth";
import { getSession } from "../lib/api";
import { demoSession } from "../lib/demo";
import { Protected } from "../App";
import type { Role } from "../lib/types";
function renderGuard(role?: Role) {
  if (role) {
    const s = demoSession(role === "MANAGER" ? "CENTER_MANAGER" : role);
    s.user = { ...s.user, roleName: role };
    sessionStorage.setItem("sportiva-session", JSON.stringify(s));
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/restricted"]}>
          <Routes>
            <Route
              element={<Protected roles={["CENTER_MANAGER", "MANAGER"]} />}
            >
              <Route path="/restricted" element={<h1>Trang quản lý</h1>} />
            </Route>
            <Route path="/login" element={<h1>Đăng nhập</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
describe("Role-based route guards and session lifecycle", () => {
  it("redirects anonymous deep links to login", () => {
    renderGuard();
    expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });
  it.each<Role>(["MEMBER", "COACH", "RECEPTIONIST"])(
    "blocks %s direct access to manager routes",
    (role) => {
      renderGuard(role);
      expect(
        screen.getByRole("heading", { name: "Không có quyền truy cập" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Trang quản lý" }),
      ).not.toBeInTheDocument();
    },
  );
  it.each<Role>(["CENTER_MANAGER", "MANAGER"])(
    "allows %s on manager routes",
    (role) => {
      renderGuard(role);
      expect(
        screen.getByRole("heading", { name: "Trang quản lý" }),
      ).toBeVisible();
    },
  );
  it("ignores invalid persisted sessions", () => {
    sessionStorage.setItem("sportiva-session", "{invalid");
    expect(getSession()).toBeNull();
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "x",
        user: { id: 1, roleName: "ADMIN" },
      }),
    );
    expect(getSession()).toBeNull();
  });
  it("logout clears token and account-scoped query cache", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(demoSession("MEMBER")),
    );
    const client = new QueryClient();
    client.setQueryData(["private"], { secret: "test-only" });
    function Probe() {
      const auth = useAuth();
      return (
        <>
          <span>{auth.session ? "signed-in" : "signed-out"}</span>
          <button onClick={auth.signOut}>Logout</button>
        </>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Logout" }));
    expect(screen.getByText("signed-out")).toBeVisible();
    expect(sessionStorage.getItem("sportiva-session")).toBeNull();
    expect(client.getQueryData(["private"])).toBeUndefined();
  });
  it("an unauthorized event expires the session", async () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(demoSession("MEMBER")),
    );
    const client = new QueryClient();
    function Probe() {
      const auth = useAuth();
      return (
        <>
          <span>{auth.session ? "signed-in" : "signed-out"}</span>
          <button
            onClick={() =>
              window.dispatchEvent(new Event("sportiva:unauthorized"))
            }
          >
            Expire
          </button>
        </>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Expire" }));
    expect(screen.getByText("signed-out")).toBeVisible();
  });
  it("does not retain password in demo session", () => {
    const s = demoSession("MEMBER");
    expect(JSON.stringify(s)).not.toContain("password");
    expect(s.mode).toBe("demo");
  });
});
