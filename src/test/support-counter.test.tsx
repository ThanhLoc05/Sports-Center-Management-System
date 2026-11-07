/** Kiểm thử tiếp nhận hỗ trợ tại quầy qua API; không dùng tài khoản hay database thật. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ToastProvider } from "../components/ui";
import Support from "../pages/Support";
import type { Role, Session, SupportTicket, User } from "../lib/types";

const users: User[] = [
  {
    id: 10,
    fullName: "Nguyễn Minh Huy",
    email: "huy@example.test",
    phone: "0900000010",
    roleName: "MEMBER",
    status: "ACTIVE",
  },
  {
    id: 11,
    fullName: "Lê Hoàng Nam",
    email: "nam@example.test",
    phone: "0900000011",
    roleName: "MEMBER",
    status: "ACTIVE",
  },
  {
    id: 20,
    fullName: "Huấn luyện viên kiểm thử",
    email: "coach@example.test",
    phone: "0900000020",
    roleName: "COACH",
    status: "ACTIVE",
  },
];
const created: SupportTicket = {
  id: 192,
  memberId: 10,
  subject: "Hỗ trợ tại quầy",
  content: "Thành viên cần tư vấn đổi lịch.",
  status: "OPEN",
  response: null,
  resolvedBy: null,
  createdAt: "2026-11-07T13:00:00",
  resolvedAt: null,
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
function session(role: Role, id = role === "MEMBER" ? 10 : 2): Session {
  return {
    mode: "api",
    token: `counter-test-${role}-${id}`,
    user: {
      id,
      roleName: role,
      fullName: "Người tiếp nhận",
      email: "operator@example.test",
      phone: "0900000002",
      status: "ACTIVE",
    },
  };
}
const clients: QueryClient[] = [];
function SwitchAccount() {
  const { signIn } = useAuth();
  return (
    <button onClick={() => signIn(session("MEMBER", 11))}>
      Đổi sang Member khác
    </button>
  );
}
function page(role: Role = "RECEPTIONIST", switchAccount = false) {
  sessionStorage.setItem("sportiva-session", JSON.stringify(session(role)));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            {switchAccount && <SwitchAccount />}
            <Support />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
function server(
  options: {
    members?: () => Response | Promise<Response>;
    create?: (url: URL, init: RequestInit) => Response | Promise<Response>;
  } = {},
) {
  let rows: SupportTicket[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/v1/users")
      return options.members ? options.members() : json(users);
    if (url.pathname === "/api/v1/support-tickets" && init?.method === "POST") {
      if (options.create) return options.create(url, init);
      const next = {
        ...created,
        memberId: Number(url.searchParams.get("memberId")),
        ...JSON.parse(String(init.body)),
      };
      rows = [next, ...rows];
      return json(next, 201);
    }
    if (url.pathname === "/api/v1/support-tickets") return json(rows);
    if (url.pathname === "/api/v1/support-tickets/my") return json([]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function openForm() {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Tiếp nhận yêu cầu tại quầy" }));
  return screen.findByRole("combobox", { name: "Thành viên" });
}
async function fillForm() {
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Thành viên" }),
    "10",
  );
  await user.type(screen.getByLabelText("Tiêu đề"), created.subject);
  await user.type(screen.getByLabelText("Nội dung chi tiết"), created.content);
  return user;
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
});

describe("Tiếp nhận hỗ trợ hộ Member — FE API", () => {
  it.each(["RECEPTIONIST", "CENTER_MANAGER"] as Role[])(
    "%s selects a Member, sends query + exact DTO with JWT and refreshes the list",
    async (role) => {
      const fetch = server();
      page(role);
      expect(
        fetch.mock.calls.some(([url]) => String(url).includes("/users")),
      ).toBe(false);
      await openForm();
      expect(
        screen.getByRole("option", { name: "Nguyễn Minh Huy · #10" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("option", { name: /Huấn luyện viên kiểm thử/ }),
      ).not.toBeInTheDocument();
      const user = await fillForm();
      await user.click(
        screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
      );
      expect(
        await screen.findByText("Đã ghi nhận yêu cầu hỗ trợ cho thành viên."),
      ).toBeVisible();
      expect(
        await screen.findByRole("button", { name: created.subject }),
      ).toBeVisible();
      expect(screen.getByText("Thành viên #10")).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const writes = fetch.mock.calls.filter(
        ([, init]) => init?.method === "POST",
      );
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toBe("/api/v1/support-tickets?memberId=10");
      expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
        subject: created.subject,
        content: created.content,
      });
      expect(new Headers(writes[0][1]?.headers).get("Authorization")).toBe(
        `Bearer counter-test-${role}-2`,
      );
    },
  );

  it("blocks saving until a loaded Member is selected and both fields are filled", async () => {
    const fetch = server();
    page();
    await openForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Tiêu đề"), created.subject);
    await user.type(
      screen.getByLabelText("Nội dung chi tiết"),
      created.content,
    );
    await user.click(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    );
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("does not accept a forged employee option outside the loaded Member list", async () => {
    const fetch = server();
    page();
    await openForm();
    const user = await fillForm();
    const select = screen.getByRole("combobox", { name: "Thành viên" });
    select.appendChild(new Option("Tài khoản nhân viên bị chèn", "20"));
    await user.selectOptions(select, "20");
    await user.click(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    );
    expect(
      await screen.findByText("Chọn thành viên hợp lệ từ danh sách đã tải."),
    ).toBeVisible();
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("disables submission while Member list loads", async () => {
    let finish!: (response: Response) => void;
    server({
      members: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    page();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Tiếp nhận yêu cầu tại quầy" }),
      );
    expect(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    ).toBeDisabled();
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => finish(json(users)));
    expect(
      await screen.findByRole("combobox", { name: "Thành viên" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    ).toBeEnabled();
  });

  it("shows an empty state without falling back to arbitrary IDs", async () => {
    const fetch = server({ members: () => json([users[2]]) });
    page();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Tiếp nhận yêu cầu tại quầy" }),
      );
    expect(
      await screen.findByText("Chưa có thành viên để tiếp nhận hỗ trợ"),
    ).toBeVisible();
    expect(screen.queryByLabelText("Thành viên")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    ).toBeDisabled();
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("offers retry when Member loading fails and keeps entered text", async () => {
    let count = 0;
    server({
      members: () =>
        ++count === 1
          ? json({ message: "Không tải được thành viên" }, 500)
          : json(users),
    });
    page();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Tiếp nhận yêu cầu tại quầy" }),
      );
    await screen.findByText("Không tải được thành viên");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Tiêu đề"), created.subject);
    expect(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("combobox", { name: "Thành viên" });
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue(created.subject);
    expect(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    ).toBeEnabled();
  });

  it.each([403, 500])(
    "preserves selected Member and form on POST %s without false success",
    async (status) => {
      server({
        create: () => json({ message: "Chưa lưu được phiếu tại quầy" }, status),
      });
      page();
      await openForm();
      const user = await fillForm();
      await user.click(
        screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
      );
      expect(
        await screen.findByText("Chưa lưu được phiếu tại quầy"),
      ).toBeVisible();
      expect(screen.getByLabelText("Thành viên")).toHaveValue("10");
      expect(screen.getByLabelText("Tiêu đề")).toHaveValue(created.subject);
      expect(screen.getByLabelText("Nội dung chi tiết")).toHaveValue(
        created.content,
      );
      expect(
        screen.queryByText("Đã ghi nhận yêu cầu hỗ trợ cho thành viên."),
      ).not.toBeInTheDocument();
    },
  );

  it("does not submit twice while creation is pending", async () => {
    let finish!: (response: Response) => void;
    const fetch = server({
      create: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    page();
    await openForm();
    const user = await fillForm();
    await user.dblClick(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    ).toBeDisabled();
    await act(async () => finish(json(created, 201)));
    expect(
      await screen.findByText("Đã ghi nhận yêu cầu hỗ trợ cho thành viên."),
    ).toBeVisible();
  });

  it("rejects a response attached to another Member", async () => {
    server({ create: () => json({ ...created, memberId: 11 }, 201) });
    page();
    await openForm();
    const user = await fillForm();
    await user.click(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    );
    expect(
      await screen.findByText(/Phiếu trả về không đúng thành viên đã chọn/),
    ).toBeVisible();
    expect(
      screen.queryByText("Đã ghi nhận yêu cầu hỗ trợ cho thành viên."),
    ).not.toBeInTheDocument();
  });

  it("drops the previous operator's late creation result after switching account", async () => {
    let finish!: (response: Response) => void;
    server({
      create: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    page("RECEPTIONIST", true);
    await openForm();
    const user = await fillForm();
    await user.click(
      screen.getByRole("button", { name: "Lưu yêu cầu hỗ trợ" }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    await user.click(
      screen.getByRole("button", { name: "Đổi sang Member khác" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tiếp nhận yêu cầu tại quầy" }),
    ).not.toBeInTheDocument();
    await act(async () => finish(json(created, 201)));
    expect(
      screen.queryByText("Đã ghi nhận yêu cầu hỗ trợ cho thành viên."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: created.subject }),
    ).not.toBeInTheDocument();
  });

  it.each([undefined, 0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects missing/invalid target %s before dispatch",
    (target) => {
      sessionStorage.setItem(
        "sportiva-session",
        JSON.stringify(session("RECEPTIONIST")),
      );
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect(() =>
        api.createSupportTicket(
          { subject: "Tiêu đề", content: "Nội dung" },
          target,
        ),
      ).toThrow("Chọn thành viên");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("keeps Member self-service and does not let Member create for someone else", () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(session("MEMBER")),
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() =>
      api.createSupportTicket({ subject: "Tiêu đề", content: "Nội dung" }, 11),
    ).toThrow("chính mình");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks whitespace and oversized subject before sending a staff request", () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(session("RECEPTIONIST")),
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() =>
      api.createSupportTicket({ subject: "  ", content: "Nội dung" }, 10),
    ).toThrow("trống");
    expect(() =>
      api.createSupportTicket(
        { subject: "x".repeat(256), content: "Nội dung" },
        10,
      ),
    ).toThrow("255");
    expect(fetch).not.toHaveBeenCalled();
  });
});
