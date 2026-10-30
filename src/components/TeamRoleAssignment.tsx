import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { usePermissions } from "../lib/hooks";
import { assignableRoles, assignTeamRole } from "../lib/team-role";
import type { Role, User } from "../lib/types";
import { roleLabels } from "../lib/types";
import { errorText } from "../lib/utils";
import { Button, Field, useToast } from "./ui";

/** Gán một vai trò có sẵn ngay trong hồ sơ đội ngũ; không có chức năng sửa quyền. */
export function TeamRoleAssignment({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (updated: User) => void;
}) {
  const { session } = useAuth();
  const can = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const currentRole =
    user.roleName === "MANAGER" ? "CENTER_MANAGER" : user.roleName;
  const [role, setRole] = useState<Role>(currentRole);
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const permitted = can("roles.manage");
  const self = session?.user.id === user.id;
  if (!permitted)
    return (
      <div className="team-role-assignment">
        <span>Vai trò</span>
        <strong>{roleLabels[user.roleName]}</strong>
      </div>
    );
  return (
    <section className="team-role-assignment" aria-label="Phân vai trò nhân sự">
      <Field
        label="Vai trò"
        hint="Quyền của mỗi vai trò được hệ thống quy định cố định."
      >
        <select
          value={role}
          disabled={self || busy || review}
          onChange={(e) => {
            setRole(e.target.value as Role);
            setError("");
          }}
        >
          {assignableRoles.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </select>
      </Field>
      {self ? (
        <small>
          Đây là tài khoản bạn đang đăng nhập; không tự đổi vai trò.
        </small>
      ) : (
        <>
          {review ? (
            <div
              className="team-role-review"
              role="group"
              aria-label="Xác nhận đổi vai trò"
            >
              <p>
                Đổi vai trò của <strong>{user.fullName}</strong> từ{" "}
                {roleLabels[user.roleName]} sang{" "}
                <strong>{roleLabels[role]}</strong>?
              </p>
              <div className="team-role-actions">
                <Button
                  type="button"
                  loading={busy}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const updated = await assignTeamRole(user.id, role);
                      await client.invalidateQueries({ queryKey: ["users"] });
                      onSaved(updated);
                      setReview(false);
                      toast("Đã cập nhật vai trò tài khoản.");
                    } catch (err) {
                      setError(errorText(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Xác nhận đổi vai trò
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setReview(false);
                    setError("");
                  }}
                >
                  Quay lại
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={role === currentRole || busy}
              onClick={() => setReview(true)}
            >
              Cập nhật vai trò
            </Button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
