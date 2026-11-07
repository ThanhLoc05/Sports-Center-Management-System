import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import {
  notificationsApi,
  type NotificationEvent,
} from "../lib/notifications-api";

function login(roleName = "COACH") {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "notification-test-token",
      user: {
        id: roleName === "COACH" ? 3 : 1,
        fullName: "TEST",
        email: "test@example.test",
        phone: "0900000000",
        roleName,
        status: "ACTIVE",
      },
    }),
  );
}

describe("C007 notification API contract", () => {
  beforeEach(() => {
    sessionStorage.clear();
    login();
  });

  it("sends the backend payload and validates the delivery summary", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        acceptedRecipients: 2,
        onlineRecipientsAtSend: 1,
        workoutPlanIds: [],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      notificationsApi.send({
        recipientIds: [10, 10, 11],
        title: "Thông báo lớp",
        content: "Lịch học được cập nhật",
        kind: "GENERAL",
      }),
    ).resolves.toEqual({
      acceptedRecipients: 2,
      onlineRecipientsAtSend: 1,
      workoutPlanIds: [],
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/notifications",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer notification-test-token",
        }),
        body: JSON.stringify({
          recipientIds: [10, 11],
          title: "Thông báo lớp",
          content: "Lịch học được cập nhật",
          kind: "GENERAL",
        }),
      }),
    );
  });

  it("requires a coach for manager homework and does not send an invalid request", async () => {
    login("CENTER_MANAGER");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      notificationsApi.send({
        recipientIds: [10],
        title: "Bài tập",
        content: "Hoàn thành bài tập",
        kind: "HOMEWORK",
      }),
    ).rejects.toThrow("Chọn huấn luyện viên");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("authenticates the SSE stream and parses notification events", async () => {
    const expected: NotificationEvent = {
      id: 21,
      recipientId: 3,
      senderId: 3,
      title: "Nhắc lịch",
      content: "Lớp bắt đầu lúc 18:00",
      createdAt: "2026-11-05T18:00:00",
      link: null,
      kind: "GENERAL",
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `id: 21\nevent: notification\ndata: ${JSON.stringify(expected)}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const received: NotificationEvent[] = [];

    await expect(
      notificationsApi.connect(
        (event) => received.push(event),
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/notifications/stream",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          Authorization: "Bearer notification-test-token",
        }),
      }),
    );
    expect(received).toEqual([expected]);
  });
});
