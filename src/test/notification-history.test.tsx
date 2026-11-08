import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../lib/auth";
import { ApiNotificationInbox } from "../components/ApiNotifications";
import { ToastProvider } from "../components/ui";
import {
  clearReceivedNotifications,
  recordReceivedNotification,
  mergeNotificationItems,
  notificationsApi,
  setNotificationStreamStatus,
  type NotificationEvent,
} from "../lib/notifications-api";

const row: NotificationEvent = {
  id: 7,
  recipientId: 15,
  senderId: 14,
  kind: "GENERAL",
  title: "Thông báo đã lưu",
  content: "Nội dung tiếng Việt",
  createdAt: "2026-11-07T18:00:00",
  readAt: null,
};
const session = (id = 15) => ({
  mode: "api" as const,
  token: `history-test-${id}`,
  user: {
    id,
    roleName: "MEMBER" as const,
    fullName: "TEST",
    email: "test@example.invalid",
    phone: "0900000000",
    status: "ACTIVE" as const,
  },
});
const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  clearReceivedNotifications();
});
function Switch() {
  const { signIn } = useAuth();
  return <button onClick={() => signIn(session(16))}>Switch account</button>;
}
function mount() {
  sessionStorage.setItem("sportiva-session", JSON.stringify(session()));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>
          <ToastProvider>
            <Switch />
            <ApiNotificationInbox />
          </ToastProvider>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
const page = (content: NotificationEvent[], index = 0, hasNext = false) => ({
  content,
  page: index,
  size: 20,
  hasNext,
});
describe("GENERAL persisted history", () => {
  it("merges late history and live events without duplicates or losing read state", () => {
    expect(
      mergeNotificationItems(
        [{ ...row, readAt: "2026-11-07T19:00:00" }],
        [row],
      ),
    ).toHaveLength(1);
    expect(
      mergeNotificationItems(
        [{ ...row, readAt: "2026-11-07T19:00:00" }],
        [row],
      )[0].readAt,
    ).toBeTruthy();
    expect(
      mergeNotificationItems([row], [{ ...row, kind: "HOMEWORK" }]),
    ).toHaveLength(2);
  });
  it("loads saved history and marks read only after a successful PATCH", async () => {
    let finish!: (r: Response) => void;
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>((r) => {
            finish = r;
          })
        : Response.json(page([row])),
    );
    vi.stubGlobal("fetch", fetch);
    mount();
    expect(await screen.findByText(row.title)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(screen.queryByText("Đã đọc")).not.toBeInTheDocument();
    await act(async () =>
      finish(Response.json({ ...row, readAt: "2026-11-07T19:00:00" })),
    );
    expect(await screen.findByText("Đã đọc")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/notifications/7/read",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
  it("keeps an SSE event received before the history request finishes", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            finish = r;
          }),
      ),
    );
    mount();
    act(() => {
      recordReceivedNotification(row);
    });
    expect(await screen.findByText(row.title)).toBeVisible();
    await act(async () => finish(Response.json(page([row]))));
    expect(screen.getAllByText(row.title)).toHaveLength(1);
  });
  it("paginates and deduplicates page overlap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) =>
        Response.json(
          String(url).includes("page=1")
            ? page([row, { ...row, id: 8, title: "Older" }], 1)
            : page([row], 0, true),
        ),
      ),
    );
    mount();
    await screen.findByText(row.title);
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm thông báo" }));
    expect(await screen.findByText("Older")).toBeVisible();
    expect(screen.getAllByText(row.title)).toHaveLength(1);
  });
  it("refreshes persisted history after the shared stream reconnects", async () => {
    setNotificationStreamStatus("reconnecting");
    const fetch = vi.fn(async (_url: RequestInfo | URL) =>
      Response.json(page([row])),
    );
    vi.stubGlobal("fetch", fetch);
    mount();
    await screen.findByText(row.title);
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url]) =>
          String(url).includes("/notifications?page=0"),
        ),
      ).toHaveLength(1),
    );

    act(() => setNotificationStreamStatus("connected"));

    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url]) =>
          String(url).includes("/notifications?page=0"),
        ),
      ).toHaveLength(2),
    );
  });
  it("shows history errors with retry instead of claiming an empty history", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fail
          ? Response.json({ message: "History unavailable" }, { status: 500 })
          : Response.json(page([])),
      ),
    );
    mount();
    await screen.findByText("History unavailable");
    expect(
      screen.queryByText("Chưa nhận thông báo nào"),
    ).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByText("Chưa nhận thông báo nào")).toBeVisible();
  });
  it("does not apply old-account history when the response arrives late", async () => {
    let finish!: (r: Response) => void;
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        ++calls === 1
          ? new Promise<Response>((r) => {
              finish = r;
            })
          : Promise.resolve(Response.json(page([]))),
      ),
    );
    mount();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.click(screen.getByText("Switch account"));
    await act(async () => finish(Response.json(page([row]))));
    expect(await screen.findByText("Chưa nhận thông báo nào")).toBeVisible();
    expect(screen.queryByText(row.title)).not.toBeInTheDocument();
  });
  it("rejects wrong-recipient history and stale 401 without logging out the new account", async () => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(session()));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(page([{ ...row, recipientId: 16 }]))),
    );
    await expect(notificationsApi.history()).rejects.toThrow();
    let finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            finish = r;
          }),
      ),
    );
    const unauthorized = vi.fn();
    window.addEventListener("sportiva:unauthorized", unauthorized);
    const pending = notificationsApi.history();
    sessionStorage.setItem("sportiva-session", JSON.stringify(session(16)));
    finish(Response.json({}, { status: 401 }));
    await expect(pending).rejects.toThrow();
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener("sportiva:unauthorized", unauthorized);
  });
  it("does not mark read in the UI when PATCH fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "PATCH"
          ? Response.json({ message: "Read forbidden" }, { status: 403 })
          : Response.json(page([row])),
      ),
    );
    mount();
    await screen.findByText(row.title);
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc" }));
    expect(await screen.findByText("Read forbidden")).toBeVisible();
    expect(screen.queryByText("Đã đọc")).not.toBeInTheDocument();
  });
});
