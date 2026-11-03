import { ApiError, getSession, request } from "./api";

export interface NotificationDto {
  id: number;
  recipientId: number;
  senderId?: number;
  title: string;
  content: string;
  createdAt: string;
  readAt?: string;
  link?: string;
  kind: string;
}

export interface NotificationInput {
  recipientIds: number[];
  title: string;
  content: string;
  link?: string;
  kind?: string;
}

function apiSession() {
  const session = getSession();
  if (!session || session.mode !== "api")
    throw new ApiError("Chức năng này yêu cầu phiên đăng nhập API.", 401);
  return session;
}

function positiveId(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError("ID thông báo không hợp lệ.");
  return value;
}

function sender() {
  const session = apiSession();
  if (!["CENTER_MANAGER", "MANAGER", "COACH"].includes(session.user.roleName))
    throw new ApiError("Bạn không có quyền gửi thông báo.", 403);
}

export const notificationsApi = {
  async list() {
    apiSession();
    return request<NotificationDto[]>("/notifications");
  },

  async unreadCount() {
    apiSession();
    return request<{ count: number }>("/notifications/unread-count");
  },

  async markRead(notificationId: number) {
    apiSession();
    return request<NotificationDto>(
      `/notifications/${positiveId(notificationId)}/read`,
      { method: "PATCH" },
    );
  },

  async markAllRead() {
    apiSession();
    return request<void>("/notifications/read-all", { method: "PATCH" });
  },

  async remove(notificationId: number) {
    apiSession();
    return request<void>(`/notifications/${positiveId(notificationId)}`, {
      method: "DELETE",
    });
  },

  async send(input: NotificationInput) {
    sender();
    const recipientIds = input.recipientIds.filter(
      (value) => Number.isSafeInteger(value) && value > 0,
    );
    if (!recipientIds.length || !input.title.trim() || !input.content.trim())
      throw new ApiError("Người nhận, tiêu đề và nội dung là bắt buộc.");
    return request<NotificationDto>("/notifications", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        recipientIds: [...new Set(recipientIds)],
        title: input.title.trim(),
        content: input.content.trim(),
      }),
    });
  },
};
