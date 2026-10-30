import { ApiError, getSession, request } from "./api";

export interface AuditLogDto {
  id: number;
  actorId: number;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: number;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditLogQuery {
  actorId?: number;
  action?: string;
  entityType?: string;
  entityId?: number;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

function manager() {
  const session = getSession();
  if (
    !session ||
    session.mode !== "api" ||
    !["CENTER_MANAGER", "MANAGER"].includes(session.user.roleName)
  )
    throw new ApiError("Bạn không có quyền xem nhật ký hệ thống.", 403);
}

function queryString(query: AuditLogQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const auditApi = {
  async list(query: AuditLogQuery = {}) {
    manager();
    return request<AuditLogDto[]>(`/audit-logs${queryString(query)}`);
  },

  async get(auditId: number) {
    manager();
    if (!Number.isSafeInteger(auditId) || auditId < 1)
      throw new ApiError("ID nhật ký không hợp lệ.");
    return request<AuditLogDto>(`/audit-logs/${auditId}`);
  },

  async export(query: AuditLogQuery = {}) {
    manager();
    return request<string>(`/audit-logs/export${queryString(query)}`, {
      headers: { Accept: "text/csv" },
    });
  },
};
