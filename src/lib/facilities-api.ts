import { ApiError, getSession, request } from "./api";

export interface RoomInput {
  roomName: string;
  capacity: number;
}

export interface SportInput {
  sportName: string;
  description: string;
}

export interface RoomDto extends RoomInput {
  id: number;
}

export interface SportDto extends SportInput {
  id: number;
}

function apiSession() {
  const session = getSession();
  if (!session || session.mode !== "api")
    throw new ApiError("Chức năng này yêu cầu phiên đăng nhập API.", 401);
  return session;
}

function id(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError("ID danh mục không hợp lệ.");
  return value;
}

function name(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new ApiError(`Tên ${label} là bắt buộc.`);
  if (normalized.length > 255)
    throw new ApiError(`Tên ${label} không được vượt quá 255 ký tự.`);
  return normalized;
}

function capacity(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError("Sức chứa phòng phải là số nguyên lớn hơn 0.");
  return value;
}

function description(value: string) {
  const normalized = value.trim();
  if (normalized.length > 255)
    throw new ApiError("Mô tả bộ môn không được vượt quá 255 ký tự.");
  return normalized;
}

function manager() {
  const session = apiSession();
  if (!["CENTER_MANAGER", "MANAGER"].includes(session.user.roleName))
    throw new ApiError("Bạn không có quyền quản lý phòng và bộ môn.", 403);
}

export const facilitiesApi = {
  async getRoom(roomId: number) {
    apiSession();
    return request<RoomDto>(`/rooms/${id(roomId)}`);
  },

  async updateRoom(roomId: number, input: RoomInput) {
    manager();
    return request<RoomDto>(`/rooms/${id(roomId)}`, {
      method: "PUT",
      body: JSON.stringify({
        roomName: name(input.roomName, "phòng"),
        capacity: capacity(input.capacity),
      }),
    });
  },

  async deleteRoom(roomId: number) {
    manager();
    return request<void>(`/rooms/${id(roomId)}`, { method: "DELETE" });
  },

  async getSport(sportId: number) {
    apiSession();
    return request<SportDto>(`/sports/${id(sportId)}`);
  },

  async updateSport(sportId: number, input: SportInput) {
    manager();
    return request<SportDto>(`/sports/${id(sportId)}`, {
      method: "PUT",
      body: JSON.stringify({
        sportName: name(input.sportName, "bộ môn"),
        description: description(input.description),
      }),
    });
  },

  async deleteSport(sportId: number) {
    manager();
    return request<void>(`/sports/${id(sportId)}`, { method: "DELETE" });
  },
};
