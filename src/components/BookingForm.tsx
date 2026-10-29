import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useClasses, useDemoData, useUsers } from "../lib/hooks";
import {
  activeSubscription,
  apiMembershipAccess,
  classAccessAllowed,
  classEligibility,
  membershipAccess,
  subscriptionUsage,
} from "../lib/entitlements";
import { api } from "../lib/api";
import {
  dateLabel,
  timeLabel,
  parseDate,
  errorText,
} from "../lib/utils";
import { Field, FormModal, Notice, useToast } from "./ui";

/** Một form cho cả đặt từ thẻ lớp và trang đăng ký.
 * Demo kiểm tra đủ quyền lợi gói. API chỉ đọc điều kiện thật mà backend cung cấp,
 * không lấy tên/giá/hạn mức demo để thay thế dữ liệu thật còn thiếu. */
export default function BookingForm({
  classId,
  memberId,
  onClose,
}: {
  classId?: number;
  memberId?: number;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const db = useDemoData();
  const users = useUsers();
  const classes = useClasses();
  const client = useQueryClient();
  const toast = useToast();
  const member = session!.user.roleName === "MEMBER";
  // MEMBER dùng chính mình; nhân viên đặt hộ phải kiểm tra gói của người được chọn.
  const [selectedMember, setMember] = useState(
    member ? session!.user.id : memberId || 0,
  );
  const [selectedClass, setClass] = useState(classId || 0);
  const activeMembership = useQuery({
    queryKey: ["activeSubscription", selectedMember],
    queryFn: () => api.activeSubscription(selectedMember),
    enabled: !db && selectedMember > 0,
  });
  const membershipPackages = useQuery({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
    enabled: !db && selectedMember > 0,
  });
  const capacity = useQuery({
    queryKey: ["capacity", selectedClass],
    queryFn: () => api.capacity(selectedClass),
    enabled: !db && selectedClass > 0,
  });
  const membershipError = activeMembership.error || membershipPackages.error;
  const membershipLoading =
    activeMembership.isPending ||
    membershipPackages.isPending ||
    activeMembership.isFetching ||
    membershipPackages.isFetching;
  // Query theo memberId; không dùng quyền cũ khi đổi thành viên hoặc API báo lỗi.
  const apiAccess =
    !db && selectedMember > 0 && !membershipLoading && !membershipError
      ? apiMembershipAccess(
          activeMembership.data ?? null,
          membershipPackages.data ?? [],
          selectedMember,
        )
      : null;
  const subscription = db
    ? activeSubscription(db, selectedMember)
    : apiAccess?.allowed
      ? apiAccess.subscription
      : undefined;
  const pkg = db?.packages.find((p) => p.id === subscription?.packageId);
  const access =
    db && selectedMember ? membershipAccess(db, selectedMember) : null;
  const used = db && subscription ? subscriptionUsage(db, subscription) : 0;
  const eligibility =
    db && selectedClass && selectedMember
      ? classEligibility(db, selectedClass, selectedMember)
      : undefined;
  const clazz = classes.data?.find((c) => c.id === selectedClass);
  // Ngày hết hạn và sức chứa lấy từ API thật; backend vẫn kiểm tra lại khi nhận POST.
  const apiReason = !selectedMember
    ? "Chọn thành viên."
    : membershipError
      ? errorText(membershipError)
      : membershipLoading
        ? "Đang kiểm tra gói tập…"
        : !apiAccess?.allowed || !subscription
          ? activeMembership.data === null
            ? "Chưa có gói còn hiệu lực. Vui lòng đăng ký hoặc gia hạn gói."
            : apiAccess?.reason || "Chưa xác minh được quyền lợi gói tập."
          : !clazz
            ? "Chọn lớp học."
            : !classAccessAllowed(apiAccess.accessLevel, clazz.requiredAccessLevel)
              ? "Cấp gói không đáp ứng cấp yêu cầu của lớp học."
              : clazz.status !== "SCHEDULED" ||
                  parseDate(clazz.scheduleTime) <= new Date()
                ? "Lớp không còn mở đăng ký."
                : clazz.scheduleTime.slice(0, 10) > subscription.endDate
                  ? "Buổi học diễn ra sau ngày hết hạn gói."
                  : capacity.isPending
                    ? "Đang kiểm tra chỗ trống…"
                    : capacity.error
                      ? errorText(capacity.error)
                      : (capacity.data ?? 0) <= 0
                        ? "Lớp đã đủ số lượng đăng ký."
                        : "";
  const allowed = db ? !!eligibility?.allowed : !apiReason;
  return (
    <FormModal
      title={db ? "Đăng ký lớp theo gói tập" : "Đăng ký lớp học"}
      onClose={onClose}
      submitLabel="Xác nhận đăng ký"
      submitDisabled={!allowed || classes.isPending || !!classes.error}
      onSubmit={async () => {
        if (!allowed)
          throw new Error(
            db ? eligibility?.reason || "Chọn thành viên và lớp." : apiReason,
          );
        await api.book(selectedClass, selectedMember);
        await client.invalidateQueries();
        toast(
          db
            ? "Đã đăng ký lớp thuộc quyền lợi gói tập."
            : "Backend đã xác nhận đăng ký lớp.",
        );
      }}
    >
      {!member && (
        <Field label="Thành viên">
          {users.data?.some((u) => u.roleName === "MEMBER") ? (
            <select
              required
              value={selectedMember || ""}
              onChange={(e) => {
                setMember(Number(e.target.value));
                if (!classId) setClass(0);
              }}
            >
              <option value="">Chọn thành viên</option>
              {users.data
                .filter((u) => u.roleName === "MEMBER" && u.status === "ACTIVE")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
            </select>
          ) : (
            <input
              type="number"
              min="1"
              required
              value={selectedMember || ""}
              onChange={(e) => setMember(Number(e.target.value))}
              placeholder="ID thành viên ở backend"
            />
          )}
        </Field>
      )}
      <Notice>
        {subscription
          ? `${pkg?.name || (apiAccess?.allowed ? `${apiAccess.pkg.packageName} · ${apiAccess.accessLevel}` : `Gói #${subscription.packageId}`)} · đến ${dateLabel(subscription.endDate)}`
          : selectedMember
            ? "Chưa có gói đang hoạt động."
            : "Chọn thành viên để xem quyền lợi gói."}
        {pkg && (
          <p>
            {pkg.classLimit
              ? `Còn ${Math.max(0, pkg.classLimit - used)}/${pkg.classLimit} lượt trong kỳ`
              : "Không giới hạn lượt lớp"}{" "}
            ·{" "}
            {pkg.sportIds
              ?.map((id) => db?.sports.find((s) => s.id === id)?.name)
              .filter(Boolean)
              .join(", ") || "Tất cả bộ môn"}
          </p>
        )}
        <Link to={`/memberships?memberId=${selectedMember}`} onClick={onClose}>
          Xem / đăng ký gói
        </Link>
        {" · "}
        <Link to={`/payments?memberId=${selectedMember}`} onClick={onClose}>
          Hóa đơn / QR
        </Link>
      </Notice>
      {access && !access.allowed && (
        <Notice tone="warning">{access.reason}</Notice>
      )}
      {!db && (
        <Notice>
          Cấp gói và thời hạn được đọc từ backend. Phù hợp cấp gói chưa bảo đảm
          đăng ký thành công; backend kiểm tra các điều kiện còn lại.
        </Notice>
      )}
      {membershipError && !db && (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            void activeMembership.refetch();
            void membershipPackages.refetch();
          }}
        >
          Thử lại kiểm tra gói
        </button>
      )}
      <Field label={db ? "Lớp học thuộc gói" : "Lớp học"}>
        <select
          required
          value={selectedClass || ""}
          onChange={(e) => setClass(Number(e.target.value))}
        >
          <option value="">Chọn lớp</option>
          {classes.data
            ?.filter((c) => !classId || c.id === classId)
            .filter((c) => c.status === "SCHEDULED")
            .map((c) => {
              const check =
                db && selectedMember
                  ? classEligibility(db, c.id, selectedMember)
                  : null;
              const reason =
                check && !check.allowed
                  ? check.reason
                  : !db &&
                      (!apiAccess?.allowed ||
                        !classAccessAllowed(apiAccess.accessLevel, c.requiredAccessLevel))
                    ? apiAccess?.allowed
                      ? "Cấp gói không đáp ứng cấp yêu cầu của lớp học."
                      : "Chưa xác minh được quyền lợi gói tập."
                    : !db && parseDate(c.scheduleTime) <= new Date()
                      ? "Lớp không còn mở đăng ký."
                      : !db &&
                          subscription &&
                          c.scheduleTime.slice(0, 10) > subscription.endDate
                        ? "Sau ngày hết hạn gói."
                        : "";
              return (
                <option key={c.id} value={c.id} disabled={!!reason}>
                  {c.className} · {dateLabel(c.scheduleTime)}{" "}
                  {timeLabel(c.scheduleTime)}
                  {reason ? ` — ${reason}` : ""}
                </option>
              );
            })}
        </select>
      </Field>
      {classes.error && (
        <Notice tone="warning">
          {errorText(classes.error)}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => void classes.refetch()}
          >
            Tải lại lớp học
          </button>
        </Notice>
      )}
      {db
        ? eligibility && (
            <Notice tone={eligibility.allowed ? "info" : "warning"}>
              {eligibility.reason}
            </Notice>
          )
        : selectedMember > 0 && (
            <Notice tone={apiReason ? "warning" : "info"}>
              {apiReason ||
                `Còn ${capacity.data} chỗ. Cấp gói phù hợp; backend sẽ xác nhận đăng ký.`}
            </Notice>
          )}
    </FormModal>
  );
}
