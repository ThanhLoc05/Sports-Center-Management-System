import { PendingEditor } from "./PendingEditor";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { operations } from "../lib/operations-api";
import { assignTeamRole } from "../lib/team-role";
import { useAuth } from "../lib/auth";
import { localDate } from "../lib/utils";
import type { Role, User } from "../lib/types";
import {
  Field,
  FormModal,
  Notice,
  Loading,
  ErrorState,
  Button,
  PageHeader,
  Panel,
  useToast,
} from "./ui";

/**
 * Tạo nhân viên qua hai bước: đăng ký tài khoản → gán vai trò cố định.
 * Nếu bước gán vai trò lỗi, giữ ID đã tạo trong state để thử lại, tránh tạo trùng.
 * Sửa hồ sơ học viên dùng API profile, tách khỏi thông tin đăng nhập/tài khoản.
 * Trường thông tin nhân viên chưa có API sửa chỉ được xem lại, chưa ghi dữ liệu.
 */
export function ApiProfileEditor({
  user,
  team = false,
  onClose,
}: {
  user?: User;
  team?: boolean;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const [created, setCreated] = useState<User | null>(null);
  const permitted = !!user && (session!.user.id === user.id ||
    ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"].includes(session!.user.roleName));
  // Hồ sơ chưa tồn tại (404) được phép nhập mới; lỗi kết nối/quyền phải xử lý trước khi lưu.
  const q = useQuery({
    queryKey: ["member-profile", user?.id],
    queryFn: () => operations.profile(user!.id),
    enabled: permitted && user!.roleName === "MEMBER",
    retry: false,
  });
  if (!user && team)
    return (
      <FormModal
        title="Thêm nhân viên"
        onClose={onClose}
        submitLabel={
          created
            ? "Gán vai trò cho tài khoản đã tạo"
            : "Tạo tài khoản nhân viên"
        }
        onSubmit={async (d) => {
          if (!["CENTER_MANAGER", "MANAGER"].includes(session!.user.roleName))
            throw new ApiError("Chỉ quản lý được tạo nhân viên.", 403);
          const role = String(d.get("roleName")) as Role;
          if (!["COACH", "RECEPTIONIST", "CENTER_MANAGER"].includes(role))
            throw new Error("Chọn vai trò nhân viên hợp lệ.");
          const next =
            created ||
            (await api.register({
              fullName: String(d.get("fullName")).trim(),
              email: String(d.get("email")).trim(),
              phone: String(d.get("phone")).trim(),
              password: String(d.get("password")),
            }));
          setCreated(next);
          await client.invalidateQueries({ queryKey: ["users"] });
          await assignTeamRole(next.id, role);
          await client.invalidateQueries({ queryKey: ["users"] });
          toast("Đã tạo nhân viên và gán vai trò.");
        }}
      >
        {created && (
          <Notice>
            Tài khoản {created.email} đã được tạo ở vai trò Thành viên. Hoàn tất
            gán vai trò bằng nút bên dưới; không nhập lại mật khẩu.
          </Notice>
        )}
        <Field label="Họ và tên">
          <input name="fullName" required minLength={2} readOnly={!!created} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required readOnly={!!created} />
        </Field>
        <Field label="Điện thoại">
          <input
            name="phone"
            required
            pattern="[+0-9 ()-]{9,20}"
            readOnly={!!created}
          />
        </Field>
        {!created && (
          <Field label="Mật khẩu ban đầu">
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
        )}
        <Field label="Vai trò nhân viên">
          <select name="roleName" defaultValue="COACH">
            <option value="COACH">Huấn luyện viên</option>
            <option value="RECEPTIONIST">Lễ tân</option>
            <option value="CENTER_MANAGER">Quản lý trung tâm</option>
          </select>
        </Field>
        <Notice>
          Quyền của mỗi vai trò là cố định. Thông tin đăng nhập bàn giao riêng
          cho nhân viên.
        </Notice>
      </FormModal>
    );
  if (!user) return <Notice>Chọn một tài khoản để cập nhật hồ sơ.</Notice>;
  if (user.roleName !== "MEMBER")
    return (
      <PendingEditor
        title="Chỉnh sửa thông tin nhân viên"
        onClose={onClose}
        fields={[
          { name: "fullName", label: "Họ và tên", value: user.fullName },
          { name: "email", label: "Email", type: "email", value: user.email },
          { name: "phone", label: "Điện thoại", value: user.phone },
        ]}
      />
    );
  return (
    <FormModal
      title="Cập nhật hồ sơ học viên"
      onClose={onClose}
      submitDisabled={
        !permitted || !q.isSuccess || q.isFetching
      }
      onSubmit={async (d) => {
        if (!permitted || !q.isSuccess || q.isFetching)
          throw new ApiError("Chưa tải được hồ sơ hợp lệ để cập nhật.");
        // Giữ null ở trường không đổi; PUT luôn gửi đủ bốn trường để không mất dữ liệu khác.
        const fieldValue = (name: "gender" | "address" | "fitnessGoals") => {
          const value = String(d.get(name) || "");
          return value === "" && q.data?.[name] === null ? null : value;
        };
        const saved = await operations.saveProfile(user.id, {
          dob: String(d.get("dob") || "") || null,
          gender: fieldValue("gender"),
          address: fieldValue("address"),
          fitnessGoals: fieldValue("fitnessGoals"),
        });
        // Các màn của Manager/Coach đọc cùng key nên nhận ngay phản hồi thật sau khi lưu.
        client.setQueryData(["member-profile", user.id], saved);
        void client.invalidateQueries({ queryKey: ["assigned-students"] });
        toast("Đã lưu hồ sơ học viên vào hệ thống.");
      }}
    >
      <p>
        {user.fullName} · {user.email}
      </p>
      {!permitted ? <Notice>Bạn không có quyền cập nhật hồ sơ này.</Notice> : q.isPending || q.isFetching ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <div key={q.data?.memberId || "new"}>
          {q.data === null && <Notice>Chưa có hồ sơ. Bạn có thể bổ sung thông tin.</Notice>}
          <Field label="Ngày sinh">
            <input type="date" name="dob" max={localDate()} defaultValue={q.data?.dob || ""} />
          </Field>
          <Field label="Giới tính">
            <input
              name="gender"
              maxLength={255}
              defaultValue={q.data?.gender || ""}
            />
          </Field>
          <Field label="Địa chỉ">
            <input
              name="address"
              maxLength={255}
              defaultValue={q.data?.address || ""}
            />
          </Field>
          <Field label="Mục tiêu tập luyện">
            <textarea
              name="fitnessGoals"
              maxLength={255}
              defaultValue={q.data?.fitnessGoals || ""}
            />
          </Field>
        </div>
      )}
      <Notice>
        Tên, email và điện thoại là thông tin tài khoản; API hồ sơ chỉ cập nhật
        các trường trên.
      </Notice>
    </FormModal>
  );
}
export function ApiProfile() {
  const { session } = useAuth();
  const user = session!.user;
  const [edit, setEdit] = useState(false);
  const q = useQuery({
    queryKey: ["member-profile", user.id],
    queryFn: () => operations.profile(user.id),
    enabled: user.roleName === "MEMBER",
    retry: false,
  });
  return (
    <>
      <PageHeader
        title="Hồ sơ cá nhân"
        actions={
          user.roleName === "MEMBER" ? (
            <Button disabled={!q.isSuccess || q.isFetching} onClick={() => setEdit(true)}>Cập nhật hồ sơ</Button>
          ) : undefined
        }
      />
      <Panel className="panel-spaced" title={user.fullName}>
        <p>
          {user.email} · {user.phone}
        </p>
        {user.roleName === "MEMBER" &&
          (q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : (
            <>
              {q.data === null && <Notice>Chưa có hồ sơ. Bạn có thể bổ sung thông tin.</Notice>}
              <p>Mục tiêu: {q.data?.fitnessGoals || "Chưa cung cấp"}</p>
              <p>Địa chỉ: {q.data?.address || "Chưa cung cấp"}</p>
              <p>Ngày sinh: {q.data?.dob || "Chưa cung cấp"}</p>
              <p>Giới tính: {q.data?.gender || "Chưa cung cấp"}</p>
            </>
          ))}
      </Panel>
      {edit && <ApiProfileEditor user={user} onClose={() => setEdit(false)} />}
    </>
  );
}
