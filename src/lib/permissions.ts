/** Quyền cố định theo vai trò; backend vẫn quyết định quyền trên API thật. */
import type { Role, Session, DemoDatabase } from "./types";
export type Permission =
  | "members.read"
  | "members.create"
  | "members.update"
  | "team.manage"
  | "roles.manage"
  | "memberships.assist"
  | "packages.manage"
  | "classes.manage"
  | "classes.roster";
export const defaultPermissions: Record<Role, Permission[]> = {
  CENTER_MANAGER: [
    "members.read",
    "members.create",
    "members.update",
    "team.manage",
    "roles.manage",
    "memberships.assist",
    "packages.manage",
    "classes.manage",
    "classes.roster",
  ],
  MANAGER: [
    "members.read",
    "members.create",
    "members.update",
    "team.manage",
    "roles.manage",
    "memberships.assist",
    "packages.manage",
    "classes.manage",
    "classes.roster",
  ],
  COACH: ["classes.roster"],
  MEMBER: [],
  RECEPTIONIST: [
    "members.read",
    "members.create",
    "memberships.assist",
    "classes.roster",
  ],
};
export function can(
  session: Session | null,
  permission: Permission,
  _db?: DemoDatabase,
) {
  return (
    !!session && defaultPermissions[session.user.roleName].includes(permission)
  );
}
