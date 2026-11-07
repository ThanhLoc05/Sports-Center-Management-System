import { ApiError, getSession, openEventStream, request } from "./api";

export interface NotificationEvent {
  id: number;
  recipientId: number;
  senderId: number;
  title: string;
  content: string;
  createdAt: string;
  link?: string | null;
  kind: "GENERAL" | "HOMEWORK";
  readAt?: string | null;
}

export interface NotificationHistoryPage {
  content: NotificationEvent[];
  page: number;
  size: number;
  hasNext: boolean;
}

export function mergeNotificationItems(
  history: NotificationEvent[],
  live: NotificationEvent[],
) {
  const items = new Map<string, NotificationEvent>();
  for (const item of [...history, ...live]) {
    const key =
      item.kind === "GENERAL"
        ? `GENERAL:${item.id}`
        : `HOMEWORK:${item.id}:${item.createdAt}`;
    const previous = items.get(key);
    items.set(key, { ...item, readAt: previous?.readAt || item.readAt });
  }
  return [...items.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id,
  );
}

export interface NotificationInput {
  recipientIds: number[];
  title: string;
  content: string;
  link?: string;
  kind: "GENERAL" | "HOMEWORK";
  coachId?: number;
}

export interface NotificationSendResult {
  acceptedRecipients: number;
  onlineRecipientsAtSend: number;
  workoutPlanIds: number[];
}

export type NotificationStreamStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

const EMPTY_EVENTS: NotificationEvent[] = [];
let receivedEvents = EMPTY_EVENTS;
let streamState = {
  status: "disconnected" as NotificationStreamStatus,
  error: "",
};
const eventListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();

function notify(listeners: Set<() => void>) {
  listeners.forEach((listener) => listener());
}

export function getReceivedNotifications() {
  const session = getSession();
  if (
    session?.mode !== "api" ||
    (receivedEvents.length && receivedEvents[0].recipientId !== session.user.id)
  )
    return EMPTY_EVENTS;
  return receivedEvents;
}

export function subscribeReceivedNotifications(listener: () => void) {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function recordReceivedNotification(event: NotificationEvent) {
  if (
    receivedEvents.some(
      (item) =>
        item.kind === event.kind &&
        item.id === event.id &&
        item.createdAt === event.createdAt,
    )
  )
    return false;
  receivedEvents = [event, ...receivedEvents].slice(0, 100);
  notify(eventListeners);
  return true;
}

export function clearReceivedNotifications() {
  if (receivedEvents.length === 0) return;
  receivedEvents = EMPTY_EVENTS;
  notify(eventListeners);
}

export function getNotificationStreamStatus() {
  return streamState;
}

export function subscribeNotificationStreamStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function setNotificationStreamStatus(
  status: NotificationStreamStatus,
  error = "",
) {
  if (streamState.status === status && streamState.error === error) return;
  streamState = { status, error };
  notify(statusListeners);
}

function apiSession() {
  const session = getSession();
  if (!session || session.mode !== "api")
    throw new ApiError("Chức năng này yêu cầu phiên đăng nhập API.", 401);
  return session;
}

function positiveId(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError("ID học viên không hợp lệ.");
  return value;
}

function isNotificationEvent(value: unknown): value is NotificationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<NotificationEvent>;
  return (
    Number.isSafeInteger(event.id) &&
    event.id! > 0 &&
    Number.isSafeInteger(event.recipientId) &&
    event.recipientId! > 0 &&
    Number.isSafeInteger(event.senderId) &&
    event.senderId! > 0 &&
    typeof event.title === "string" &&
    !!event.title.trim() &&
    event.title.length <= 150 &&
    typeof event.content === "string" &&
    !!event.content.trim() &&
    event.content.length <= 4000 &&
    typeof event.createdAt === "string" &&
    Number.isFinite(Date.parse(event.createdAt)) &&
    (event.link === undefined ||
      event.link === null ||
      (typeof event.link === "string" &&
        event.link.startsWith("/") &&
        !event.link.startsWith("//") &&
        !/[\r\n\\]/.test(event.link) &&
        event.link.length <= 500)) &&
    (event.kind === "GENERAL" || event.kind === "HOMEWORK")
  );
}

function isSendResult(value: unknown): value is NotificationSendResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<NotificationSendResult>;
  return (
    Number.isSafeInteger(result.acceptedRecipients) &&
    Number.isSafeInteger(result.onlineRecipientsAtSend) &&
    Array.isArray(result.workoutPlanIds) &&
    result.workoutPlanIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
    (result.acceptedRecipients ?? 0) >= 1 &&
    (result.onlineRecipientsAtSend ?? -1) >= 0 &&
    (result.onlineRecipientsAtSend ?? Infinity) <=
      (result.acceptedRecipients ?? -1)
  );
}

function parseEvent(block: string): NotificationEvent | null {
  let eventName = "";
  let eventId = "";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value =
      separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    if (field === "id") eventId = value;
    if (field === "data") data.push(value);
  }
  if (eventName !== "notification" || data.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data.join("\n"));
  } catch {
    throw new ApiError("Dữ liệu sự kiện thông báo từ máy chủ không hợp lệ.");
  }
  if (!isNotificationEvent(parsed))
    throw new ApiError("Cấu trúc sự kiện thông báo từ máy chủ không hợp lệ.");
  if (eventId && eventId !== String(parsed.id)) return null;
  return parsed;
}

async function consumeEventStream(
  response: Response,
  signal: AbortSignal,
  onNotification: (event: NotificationEvent) => void,
) {
  if (!response.body)
    throw new ApiError("Luồng thông báo không có nội dung để đọc.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      if (buffer.length > 65536 || blocks.some((block) => block.length > 65536))
        throw new ApiError("Notification frame exceeds supported size.");
      for (const block of blocks) {
        if (signal.aborted) break;
        const event = parseEvent(block);
        if (event) onNotification(event);
      }
    }
    if (!signal.aborted)
      throw new ApiError("Kết nối thông báo đã bị máy chủ đóng.");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export const notificationsApi = {
  async history(page = 0, size = 20): Promise<NotificationHistoryPage> {
    const actor = apiSession();
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 100
    )
      throw new ApiError("Phân trang thông báo không hợp lệ.");
    const result = await request<NotificationHistoryPage>(
      `/notifications?page=${page}&size=${size}`,
    );
    if (
      getSession()?.token !== actor.token ||
      getSession()?.user.id !== actor.user.id
    )
      throw new DOMException("Obsolete notification history", "AbortError");
    if (
      !result ||
      result.page !== page ||
      result.size !== size ||
      typeof result.hasNext !== "boolean" ||
      !Array.isArray(result.content) ||
      result.content.some(
        (item) =>
          !isNotificationEvent(item) ||
          item.kind !== "GENERAL" ||
          item.recipientId !== actor.user.id ||
          (item.readAt != null &&
            (typeof item.readAt !== "string" ||
              !Number.isFinite(Date.parse(item.readAt)))),
      )
    )
      throw new ApiError("Lịch sử thông báo trả về không hợp lệ.");
    return result;
  },
  async markRead(id: number): Promise<NotificationEvent> {
    const actor = apiSession();
    const result = await request<NotificationEvent>(
      `/notifications/${positiveId(id)}/read`,
      { method: "PATCH" },
    );
    if (
      getSession()?.token !== actor.token ||
      getSession()?.user.id !== actor.user.id
    )
      throw new DOMException("Obsolete notification read", "AbortError");
    if (
      !isNotificationEvent(result) ||
      result.kind !== "GENERAL" ||
      result.id !== id ||
      result.recipientId !== actor.user.id ||
      typeof result.readAt !== "string" ||
      !Number.isFinite(Date.parse(result.readAt))
    )
      throw new ApiError("Trạng thái đã đọc trả về không hợp lệ.");
    return result;
  },
  async send(input: NotificationInput): Promise<NotificationSendResult> {
    const session = apiSession();
    if (!["CENTER_MANAGER", "COACH"].includes(session.user.roleName))
      throw new ApiError("Bạn không có quyền gửi thông báo.", 403);

    const recipientIds = [...new Set(input.recipientIds.map(positiveId))];
    const title = input.title.trim();
    const content = input.content.trim();
    if (
      recipientIds.length === 0 ||
      recipientIds.length > 100 ||
      !title ||
      title.length > 150 ||
      !content ||
      content.length > 4000
    )
      throw new ApiError("Kiểm tra người nhận, tiêu đề và nội dung thông báo.");
    if (!["GENERAL", "HOMEWORK"].includes(input.kind))
      throw new ApiError("Loại thông báo không hợp lệ.");

    const coachId =
      input.kind === "HOMEWORK" &&
      session.user.roleName === "CENTER_MANAGER" &&
      input.coachId !== undefined
        ? positiveId(input.coachId)
        : undefined;
    if (
      input.kind === "HOMEWORK" &&
      !coachId &&
      session.user.roleName !== "COACH"
    )
      throw new ApiError("Chọn huấn luyện viên phụ trách bài tập.");

    const result = await request<NotificationSendResult>("/notifications", {
      method: "POST",
      body: JSON.stringify({
        recipientIds,
        title,
        content,
        kind: input.kind,
        ...(input.link ? { link: input.link } : {}),
        ...(coachId ? { coachId } : {}),
      }),
    });
    if (
      !isSendResult(result) ||
      result.acceptedRecipients !== recipientIds.length
    )
      throw new ApiError("Kết quả gửi thông báo từ máy chủ không hợp lệ.");
    return result;
  },

  async connect(
    onNotification: (event: NotificationEvent) => void,
    signal: AbortSignal,
    onOpen?: () => void,
  ) {
    const session = apiSession();
    const current = () => {
      const now = getSession();
      return (
        !signal.aborted &&
        now?.mode === "api" &&
        now.token === session.token &&
        now.user.id === session.user.id &&
        now.user.roleName === session.user.roleName
      );
    };
    const response = await openEventStream("/notifications/stream", signal);
    if (!current()) {
      await response.body?.cancel();
      return;
    }
    onOpen?.();
    await consumeEventStream(response, signal, (event) => {
      if (current() && event.recipientId === session.user.id)
        onNotification(event);
    });
  },
};
