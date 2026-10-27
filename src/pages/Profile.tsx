/** Hồ sơ cá nhân đọc API thật; chỉ sửa cục bộ trong demo khi backend chưa có endpoint. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { roleLabels } from "../lib/types";
import { ProfileEditor } from "../components/ProfileEditor";
import {
  Avatar,
  Badge,
  Button,
  DemoOnly,
  ErrorState,
  Loading,
  PageHeader,
  Panel,
} from "../components/ui";
export function Profile() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [edit, setEdit] = useState(false);

  const query = useQuery({
    queryKey: ["profile", session!.user.id],
    queryFn: () => api.user(session!.user.id),
  });
  const user = query.data || session!.user;
  return (
    <>
      <PageHeader
        eyebrow="THIS IS YOUR SPACE"
        title="Hồ sơ cá nhân"
        description="Thông tin của bạn trong cộng đồng Sportiva."
        actions={
          demo && (
            <Button onClick={() => setEdit(true)}>Cập nhật hồ sơ demo</Button>
          )
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <Panel>
          <div className="profile-page-header">
            <Avatar name={user.fullName} size="large" />
            <div>
              <h2>{user.fullName}</h2>
              <p>{roleLabels[user.roleName]}</p>
              <Badge status={user.status} />
            </div>
          </div>
          <div className="profile-details">
            <div>
              <span>Họ và tên</span>
              <strong>{user.fullName}</strong>
            </div>
            <div>
              <span>Địa chỉ email</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span>Số điện thoại</span>
              <strong>{user.phone || "Chưa cung cấp"}</strong>
            </div>
            <div>
              <span>Mã tài khoản</span>
              <strong>#{user.id}</strong>
            </div>
          </div>
        </Panel>
      )}
      {!demo && (
        <DemoOnly>
          Backend chưa có endpoint cập nhật hồ sơ hoặc đổi mật khẩu. FE đang
          hiển thị thông tin từ GET /users/{"{id}"}.
        </DemoOnly>
      )}
      {edit && <ProfileEditor user={user} onClose={() => setEdit(false)} />}
    </>
  );
}
