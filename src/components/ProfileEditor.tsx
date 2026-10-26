import { useAuth } from "../lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import type { Role, User } from "../lib/types";
import { roleLabels } from "../lib/types";
import { saveUser } from "../lib/center";
import { Field, FormModal, Notice, Modal, Avatar, useToast } from "./ui";
/** Hồ sơ dùng chung, không tự gán quyền từ form sửa thông tin. */
export function ProfileEditor({
  user,
  team = false,
  onClose,
}: {
  user?: User;
  team?: boolean;
  onClose: () => void;
}) {
  const { session, signIn } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  return (
    <FormModal
      title={user ? "Cập nhật thông tin tài khoản" : "Thêm nhân viên"}
      onClose={onClose}
      onSubmit={async (d) => {
        const next = saveUser(
          {
            ...user,
            fullName: String(d.get("fullName")).trim(),
            email: String(d.get("email")).trim(),
            phone: String(d.get("phone")).trim(),
            roleName: user?.roleName || (String(d.get("roleName")) as Role),
            status: user?.status || "ACTIVE",
            dob: String(d.get("dob") || ""),
            gender: String(d.get("gender") || ""),
            address: String(d.get("address") || ""),
            fitnessGoals: String(d.get("fitnessGoals") || ""),
            level: String(d.get("level") || "Mới bắt đầu"),
            bio: String(d.get("bio") || ""),
            specialties: String(d.get("specialties") || ""),
          },
          user?.id,
        );
        if (next.id === session!.user.id) signIn({ ...session!, user: next });
        await client.invalidateQueries();
        toast("Đã lưu thông tin demo.");
      }}
    >
      <Notice>
        Thông tin lưu trong demo. API cập nhật hồ sơ/tạo nhân viên chưa có. Tài
        khoản demo dùng mật khẩu chung Sportiva@123.
      </Notice>
      <div className="form-grid">
        <Field label="Họ và tên">
          <input
            name="fullName"
            required
            minLength={2}
            maxLength={100}
            defaultValue={user?.fullName}
          />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            maxLength={255}
            defaultValue={user?.email}
          />
        </Field>
        <Field label="Điện thoại">
          <input
            name="phone"
            required
            pattern="[+0-9 ()-]{9,20}"
            defaultValue={user?.phone}
          />
        </Field>
        {!user && team && (
          <Field label="Vai trò nhân viên">
            <select name="roleName">
              <option value="COACH">Huấn luyện viên</option>
              <option value="RECEPTIONIST">Lễ tân</option>
              <option value="CENTER_MANAGER">Quản lý trung tâm</option>
            </select>
          </Field>
        )}
        <Field label="Ngày sinh">
          <input
            name="dob"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={user?.dob}
          />
        </Field>
        <Field label="Giới tính">
          <select name="gender" defaultValue={user?.gender || ""}>
            <option value="">Chưa cung cấp</option>
            <option>Nam</option>
            <option>Nữ</option>
            <option>Khác</option>
          </select>
        </Field>
        <Field label="Trình độ">
          <select name="level" defaultValue={user?.level}>
            <option>Mới bắt đầu</option>
            <option>Đã có kinh nghiệm</option>
            <option>Nâng cao</option>
          </select>
        </Field>
      </div>
      <Field label="Địa chỉ">
        <input name="address" maxLength={250} defaultValue={user?.address} />
      </Field>
      <Field label="Mục tiêu tập luyện">
        <textarea
          name="fitnessGoals"
          maxLength={1000}
          defaultValue={user?.fitnessGoals}
        />
      </Field>
      <Field label="Giới thiệu">
        <textarea name="bio" maxLength={1500} defaultValue={user?.bio} />
      </Field>
      <Field label="Chuyên môn HLV">
        <input
          name="specialties"
          maxLength={250}
          defaultValue={user?.specialties}
        />
      </Field>
    </FormModal>
  );
}
export function UserProfileModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  return (
    <Modal
      title={
        user.roleName === "COACH"
          ? "Thông tin huấn luyện viên"
          : "Hồ sơ học viên"
      }
      onClose={onClose}
      wide
    >
      <div className="member-detail-header">
        <Avatar name={user.fullName} size="large" />
        <div>
          <h2>{user.fullName}</h2>
          <p>{roleLabels[user.roleName]}</p>
        </div>
      </div>
      <div className="detail-grid">
        {[
          ["Email", user.email],
          ["Điện thoại", user.phone],
          ["Ngày sinh", user.dob],
          ["Giới tính", user.gender],
          ["Địa chỉ", user.address],
          ["Trình độ", user.level],
          ["Mục tiêu tập luyện", user.fitnessGoals],
          ["Chuyên môn", user.specialties],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "Chưa cung cấp"}</strong>
          </div>
        ))}
      </div>
      <p>{user.bio}</p>
    </Modal>
  );
}
