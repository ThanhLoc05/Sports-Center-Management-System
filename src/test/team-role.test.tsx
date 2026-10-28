/** Kiểm thử UI và HTTP bằng mock; không đổi vai trò tài khoản thật. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { api } from "../lib/api";
import { ToastProvider } from "../components/ui";
import { TeamRoleAssignment } from "../components/TeamRoleAssignment";
import { assignTeamRole } from "../lib/team-role";
import Members from "../pages/Members";
import App from "../App";
import type { User, Role } from "../lib/types";

const staff: User = {
  id: 2,
  fullName: "HLV TEST",
  email: "coach@example.test",
  phone: "0900000000",
  roleName: "COACH",
  status: "ACTIVE",
};
const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
});
function wrap(
  element: React.ReactNode,
  role: Role = "CENTER_MANAGER",
  path = "/team",
) {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-api-only",
      user: { ...staff, id: 1, roleName: role },
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
async function chooseAndReview() {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Vai trò"), "RECEPTIONIST");
  await user.click(screen.getByRole("button", { name: "Cập nhật vai trò" }));
  return user;
}
describe("Gán vai trò trong hồ sơ Đội ngũ, quyền cố định", () => {
  it("places the role control under email only in team details", async () => {
    vi.spyOn(api, "users").mockResolvedValue([staff]);
    const user = userEvent.setup();
    wrap(<Members team />);
    await user.click(await screen.findByRole("button", { name: /^HLV TEST/ }));
    const dialog = screen.getByRole("dialog");
    const email = within(dialog).getByText(staff.email);
    expect(email.parentElement).toContainElement(
      within(dialog).getByLabelText("Vai trò"),
    );
    expect(within(dialog).getAllByRole("option")).toHaveLength(4);
    expect(screen.queryByText("Lưu quyền vai trò")).not.toBeInTheDocument();
  });
  it("sends no request until explicit confirmation and uses the existing new-backend PATCH contract", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ...staff, roleName: "RECEPTIONIST" }),
    );
    vi.stubGlobal("fetch", fetch);
    const saved = vi.fn();
    wrap(<TeamRoleAssignment user={staff} onSaved={saved} />);
    expect(
      screen.getByRole("button", { name: "Cập nhật vai trò" }),
    ).toBeDisabled();
    const user = await chooseAndReview();
    expect(fetch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Xác nhận đổi vai trò" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/2/role?roleName=RECEPTIONIST",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-only",
        }),
      }),
    );
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, roleName: "RECEPTIONIST" }),
    );
  });
  it.each([403, 404, 500])(
    "keeps the old profile when role update returns HTTP %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ message: "Không cập nhật được" }, { status }),
        ),
      );
      const saved = vi.fn();
      wrap(<TeamRoleAssignment user={staff} onSaved={saved} />);
      const user = await chooseAndReview();
      await user.click(
        screen.getByRole("button", { name: "Xác nhận đổi vai trò" }),
      );
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(saved).not.toHaveBeenCalled();
      if (status === 404)
        expect(screen.getByRole("alert")).toHaveTextContent(
          "chưa hỗ trợ cập nhật vai trò",
        );
    },
  );
  it("does not allow self role changes or role assignment by reception", async () => {
    wrap(
      <TeamRoleAssignment
        user={{ ...staff, id: 1, roleName: "CENTER_MANAGER" }}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByLabelText("Vai trò")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Cập nhật vai trò" }),
    ).not.toBeInTheDocument();
    await expect(assignTeamRole(1, "COACH")).rejects.toMatchObject({
      status: 403,
    });
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-api-only",
        user: { ...staff, id: 3, roleName: "RECEPTIONIST" },
      }),
    );
    await expect(assignTeamRole(2, "CENTER_MANAGER")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects a mismatched role response instead of updating another account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...staff, id: 999, roleName: "RECEPTIONIST" }),
      ),
    );
    wrap(<TeamRoleAssignment user={staff} onSaved={() => {}} />);
    await expect(assignTeamRole(2, "RECEPTIONIST")).rejects.toThrow(
      "không khớp",
    );
  });
  it("redirects the old permissions URL to team and removes the sidebar tab", async () => {
    vi.spyOn(api, "users").mockResolvedValue([staff]);
    wrap(<App />, "CENTER_MANAGER", "/permissions");
    expect(
      await screen.findByRole("heading", {
        name: "Đội ngũ trung tâm",
        level: 1,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Vai trò & phân quyền" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lưu quyền vai trò" }),
    ).not.toBeInTheDocument();
  });
});
