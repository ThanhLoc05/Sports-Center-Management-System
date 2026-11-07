import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearReceivedNotifications,
  getReceivedNotifications,
  notificationsApi,
  recordReceivedNotification,
} from "../lib/notifications-api";

const event = {
  id: 1,
  recipientId: 15,
  senderId: 14,
  title: "Unicode tiếng Việt",
  content: "Nội dung",
  createdAt: "2026-11-07T10:00:00",
  kind: "GENERAL" as const,
};
function login(id = 15) {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: `opaque-test-${id}`,
      user: { id, roleName: "MEMBER", fullName: "TEST", status: "ACTIVE" },
    }),
  );
}
function response(text: string, close = true, cancel?: () => void) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        if (close) c.close();
      },
      cancel,
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const frame = (value = event) =>
  `id: ${value.id}\r\nevent: notification\r\ndata: ${JSON.stringify(value)}\r\n\r\n`;
describe("CO07 integration protections", () => {
  beforeEach(() => {
    login();
    clearReceivedNotifications();
  });
  it("deduplicates replays and keeps a reused server ID with a new timestamp", () => {
    expect(recordReceivedNotification(event)).toBe(true);
    expect(recordReceivedNotification(event)).toBe(false);
    expect(
      recordReceivedNotification({
        ...event,
        createdAt: "2026-11-07T11:00:00",
      }),
    ).toBe(true);
    expect(getReceivedNotifications()).toHaveLength(2);
    login(16);
    expect(getReceivedNotifications()).toHaveLength(0);
  });
  it("accepts connection comments and Unicode but ignores a different recipient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          ":connected\r\n\r\n" + frame({ ...event, recipientId: 16 }) + frame(),
        ),
      ),
    );
    const onEvent = vi.fn(),
      onOpen = vi.fn();
    await expect(
      notificationsApi.connect(onEvent, new AbortController().signal, onOpen),
    ).rejects.toThrow();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(event);
  });
  it("does not open or log out a new account when an old 401 arrives", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const unauthorized = vi.fn();
    window.addEventListener("sportiva:unauthorized", unauthorized);
    const open = vi.fn();
    const pending = notificationsApi.connect(
      vi.fn(),
      new AbortController().signal,
      open,
    );
    login(16);
    finish(new Response(null, { status: 401 }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(unauthorized).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    window.removeEventListener("sportiva:unauthorized", unauthorized);
  });
  it("cancels a pending read on unmount/abort", async () => {
    const cancel = vi.fn(),
      controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(":connected\n\n", false, cancel)),
    );
    const pending = notificationsApi.connect(vi.fn(), controller.signal, () =>
      controller.abort(),
    );
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects oversized frames and mismatched SSE IDs", async () => {
    const received = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(frame().replace("id: 1", "id: 2"))),
    );
    await expect(
      notificationsApi.connect(received, new AbortController().signal),
    ).rejects.toThrow();
    expect(received).not.toHaveBeenCalled();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("x".repeat(65537))),
    );
    await expect(
      notificationsApi.connect(received, new AbortController().signal),
    ).rejects.toThrow("exceeds");
  });
  it("does not dispatch late events after switching accounts", async () => {
    const received = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(frame())),
    );
    await expect(
      notificationsApi.connect(received, new AbortController().signal, () =>
        login(16),
      ),
    ).rejects.toThrow();
    expect(received).not.toHaveBeenCalled();
  });
});
