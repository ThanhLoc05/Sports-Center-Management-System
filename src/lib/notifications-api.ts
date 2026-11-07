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
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

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
  return receivedEvents;
}

export function subscribeReceivedNotifications(listener: () => void) {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function recordReceivedNotification(event: NotificationEvent) {
  receivedEvents = [
    event,
    ...receivedEvents.filter((item) => item.id !== event.id),
  ].slice(0, 100);
  notify(eventListeners);
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
    Number.isSafeInteger(event.recipientId) &&
    Number.isSafeInteger(event.senderId) &&
    typeof event.title === "string" &&
    typeof event.content === "string" &&
    typeof event.createdAt === "string" &&
    (event.link === undefined ||
      event.link === null ||
      typeof event.link === "string") &&
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
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value =
      separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
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
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        const event = parseEvent(block);
        if (event) onNotification(event);
      }
    }
    if (!signal.aborted)
      throw new ApiError("Kết nối thông báo đã bị máy chủ đóng.");
  } finally {
    reader.releaseLock();
  }
}

export const notificationsApi = {
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
      input.coachId === undefined ? undefined : positiveId(input.coachId);
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
    apiSession();
    const response = await openEventStream("/notifications/stream", signal);
    onOpen?.();
    await consumeEventStream(response, signal, onNotification);
  },
};
