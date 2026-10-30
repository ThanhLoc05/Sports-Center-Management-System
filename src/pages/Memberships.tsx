/**
 * FLOW 1 — ĐĂNG KÝ, GIA HẠN VÀ THEO DÕI THỜI HẠN GÓI TẬP.
 * Package là danh mục gói, Subscription là gói một thành viên đã đăng ký.
 * Thao tác gói ở màn này tách riêng thao tác tạo/thu tiền hóa đơn trong Payments.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePermissions } from "../lib/hooks";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Crown,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { api } from "../lib/api";
import { readDemo } from "../lib/demo";

import type { Package, Subscription } from "../lib/types";
import { parseDate, dateLabel, localDate, money } from "../lib/utils";
import {
  Badge,
  Button,
  CheckItem,
  Confirm,
  DataTable,
  DemoOnly,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  MemberField,
  Notice,
  PageHeader,
  Panel,
  useToast,
} from "../components/ui";
import { MembershipCheckoutPage } from "../components/MembershipCheckout";
export default function Memberships() {
  const { session } = useAuth();
  return session?.mode === "api" ? (
    <MembershipCheckoutPage />
  ) : (
    <LegacyMemberships />
  );
}
/** Nhánh fixture chỉ dùng cho kiểm thử hồi quy; bản dev/build luôn vào luồng API phía trên. */
function LegacyMemberships() {
  const { session } = useAuth();
  const can = usePermissions();
  const [params] = useSearchParams();
  const member = session!.user.roleName === "MEMBER",
    demo = session!.mode === "demo";
  const users = useUsers();
  const [memberId, setMemberId] = useState(
    member
      ? String(session!.user.id)
      : params.get("memberId") || (demo ? "10" : ""),
  );
  const [action, setAction] = useState<{
    pkg?: Package;
    renew?: Subscription;
  } | null>(null);
  const [cancel, setCancel] = useState<Subscription | null>(null);

  const client = useQueryClient();
  const toast = useToast();
  /**
   * Chỉ tải lịch sử khi đã có memberId. Thành viên lấy ID từ session; nhân viên
   * chọn người cần hỗ trợ. queryKey dùng cùng ID để cache theo từng thành viên.
   */
  const query = useQuery({
    queryKey: ["subscriptions", Number(memberId)],
    queryFn: () => api.subscriptions(Number(memberId)),
    enabled: !!memberId,
  });
  /**
   * Danh mục gói hiện chỉ có trong demo. API mode không tự lấy giá mẫu thay giá thật,
   * nên form sử dụng packageId đã tồn tại ở backend.
   */
  const packages = demo
    ? readDemo().packages.filter((p) => p.status !== "INACTIVE")
    : [];
  /**
   * Đang ACTIVE và ngày kết thúc chưa qua hôm nay mới được coi là còn hiệu lực
   * trên giao diện; trạng thái thực tế khi ghi vẫn do backend xử lý.
   */
  const active = query.data?.find(
    (s) =>
      s.status === "ACTIVE" &&
      s.startDate <= localDate() &&
      s.endDate >= localDate(),
  );
  const currentName =
    users.data?.find((u) => u.id === Number(memberId))?.fullName ||
    `Thành viên #${memberId}`;
  return (
    <>
      <PageHeader
        eyebrow="INVEST IN YOURSELF"
        title="Gói thành viên"
        description="Chọn sự đồng hành phù hợp. Bền bỉ trên hành trình khỏe mạnh."
        actions={
          <>
            {can("packages.manage") && (
              <Link className="btn btn-secondary" to="/packages">
                Quản lý danh mục gói
              </Link>
            )}
            <Button onClick={() => setAction({ renew: active })}>
              <Plus size={16} />
              {active ? "Gia hạn gói tập" : "Đăng ký gói tập"}
            </Button>
          </>
        }
      />
      {!member && (
        <div className="member-picker-bar">
          <span>
            <CreditCard size={18} />
            Đang quản lý gói tập của
          </span>
          {users.data?.some((u) => u.roleName === "MEMBER") ? (
            <select
              aria-label="Chọn thành viên xem gói"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Chọn thành viên</option>
              {users.data
                .filter((u) => u.roleName === "MEMBER")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} · #{u.id}
                  </option>
                ))}
            </select>
          ) : (
            <input
              type="number"
              min="1"
              aria-label="ID thành viên xem gói"
              placeholder="Nhập ID thành viên"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
          )}
        </div>
      )}
      {memberId && query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : active ? (
        <section className="active-membership">
          <div className="active-membership-icon">
            <Crown size={30} strokeWidth={1.4} />
          </div>
          <div className="active-membership-copy">
            <span className="eyebrow">
              GÓI TẬP HIỆN TẠI ·{" "}
              {member ? "CỦA BẠN" : currentName.toUpperCase()}
            </span>
            <h2>
              {packages.find((p) => p.id === active.packageId)?.name ||
                `Gói thành viên #${active.packageId}`}
            </h2>
            <p>
              <CalendarClock size={15} />
              {dateLabel(active.startDate)} – {dateLabel(active.endDate)}
              <span className="badge badge-active">
                Còn{" "}
                {Math.max(
                  0,
                  Math.floor(
                    (parseDate(active.endDate + "T23:59:59").getTime() -
                      Date.now()) /
                      86400000,
                  ),
                )}{" "}
                ngày
              </span>
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setAction({ renew: active })}
          >
            <RefreshCw size={16} />
            Gia hạn ngay
          </Button>
        </section>
      ) : memberId ? (
        <Notice>
          Thành viên chưa có gói đang hoạt động.{" "}
          {demo
            ? "Chọn gói bên dưới để bắt đầu."
            : "Chọn Đăng ký gói tập và nhập mã gói được trung tâm cung cấp."}
        </Notice>
      ) : null}
      {demo ? (
        <>
          <div className="section-intro">
            <span className="eyebrow">MEMBERSHIP COLLECTION</span>
            <h2>Đầu tư cho phiên bản tốt hơn của bạn.</h2>
            <p>Minh bạch quyền lợi. Linh hoạt lựa chọn.</p>
          </div>
          <div className="pricing-grid">
            {packages.map((pkg, i) => (
              <article
                className={`pricing-card ${i === 1 ? "featured" : ""}`}
                key={pkg.id}
              >
                {i === 1 && (
                  <div className="pricing-ribbon">
                    <Sparkles size={13} />
                    LỰA CHỌN ĐƯỢC YÊU THÍCH
                  </div>
                )}
                <span className="pricing-icon">
                  {i === 1 ? (
                    <Crown size={25} />
                  ) : i === 2 ? (
                    <Sparkles size={25} />
                  ) : (
                    <CreditCard size={25} />
                  )}
                </span>
                <h3>{pkg.name}</h3>
                <p>{pkg.description}</p>
                <div className="pricing-price">
                  <strong>{money(pkg.price)}</strong>
                  <span>/ {pkg.durationDays} ngày</span>
                </div>
                <ul>
                  <CheckItem>
                    {pkg.sportIds
                      ?.map(
                        (id) =>
                          readDemo().sports.find((s) => s.id === id)?.name,
                      )
                      .join(", ") || "Tất cả bộ môn"}
                  </CheckItem>
                  <CheckItem>
                    {pkg.classLimit
                      ? `${pkg.classLimit} lượt lớp trong kỳ`
                      : "Không giới hạn lượt lớp"}
                  </CheckItem>
                  {pkg.features.map((f) => (
                    <CheckItem key={f}>{f}</CheckItem>
                  ))}
                </ul>
                <Button
                  variant={i === 1 ? "primary" : "secondary"}
                  onClick={() => setAction({ pkg, renew: active })}
                >
                  {active ? "Gia hạn với gói này" : "Chọn gói tập"}
                  <ArrowRight size={16} />
                </Button>
                <small>Danh mục minh họa · ID #{pkg.id}</small>
              </article>
            ))}
          </div>
        </>
      ) : (
        <DemoOnly>
          Backend có API đăng ký và gia hạn nhưng chưa có API danh mục gói tập.
          Hãy nhập ID gói tồn tại trong DB; tên, giá và quyền lợi không được suy
          đoán từ dữ liệu demo.
        </DemoOnly>
      )}
      <Panel
        title="Lịch sử đăng ký gói"
        description={
          memberId
            ? `Thông tin gói tập của ${member ? "bạn" : currentName}.`
            : "Chọn thành viên để xem lịch sử."
        }
      >
        {!memberId ? (
          <Empty
            title="Chọn một thành viên"
            description="Lịch sử gói tập sẽ hiển thị tại đây."
          />
        ) : (
          query.data && (
            <DataTable
              rows={query.data.slice().sort((a, b) => b.id - a.id)}
              columns={[
                {
                  key: "id",
                  label: "Mã đăng ký",
                  render: (s) => (
                    <span className="mono">
                      GĐK{String(s.id).padStart(4, "0")}
                    </span>
                  ),
                },
                {
                  key: "package",
                  label: "Gói thành viên",
                  render: (s) => (
                    <strong>
                      {packages.find((p) => p.id === s.packageId)?.name ||
                        `Gói #${s.packageId}`}
                    </strong>
                  ),
                },
                {
                  key: "start",
                  label: "Ngày bắt đầu",
                  render: (s) => dateLabel(s.startDate),
                },
                {
                  key: "end",
                  label: "Ngày hết hạn",
                  render: (s) => dateLabel(s.endDate),
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  render: (s) => (
                    <Badge
                      status={
                        s.status === "ACTIVE" && s.endDate < localDate()
                          ? "EXPIRED"
                          : s.status
                      }
                    />
                  ),
                },
                {
                  key: "action",
                  label: "Thao tác",
                  render: (s) => (
                    <div className="row-actions">
                      <button
                        className="subtle-link"
                        disabled={!!active && active.id !== s.id}
                        title={
                          active && active.id !== s.id
                            ? "Hãy gia hạn gói đang có hiệu lực"
                            : undefined
                        }
                        onClick={() => setAction({ renew: s })}
                      >
                        <RefreshCw size={14} />
                        Gia hạn
                      </button>
                      {s.status === "ACTIVE" && (
                        <button
                          className="text-danger"
                          onClick={() => setCancel(s)}
                        >
                          Hủy gói
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )
        )}
      </Panel>
      {action && (
        <FormModal
          title={
            action.renew ? "Gia hạn gói thành viên" : "Đăng ký gói thành viên"
          }
          description={
            action.pkg
              ? `${action.pkg.name} · ${money(action.pkg.price)} / ${action.pkg.durationDays} ngày`
              : undefined
          }
          onClose={() => setAction(null)}
          submitLabel={action.renew ? "Xác nhận gia hạn" : "Xác nhận đăng ký"}
          onSubmit={async (data) => {
            const id = member ? session!.user.id : Number(data.get("memberId"));
            /**
             * renew.id quyết định gọi gia hạn hay đăng ký mới. Không gửi ngày bắt đầu/kết thúc
             * từ form vì backend tính ngày. Lưu xong tải lại dữ liệu; thu tiền thực hiện ở Payments.
             */
            await api.subscribe(
              id,
              action.pkg?.id || Number(data.get("packageId")),
              action.renew?.id,
            );
            setMemberId(String(id));
            await client.invalidateQueries();
            toast(
              "Đã lưu gói thành viên. Thanh toán được ghi nhận riêng trong mục Hóa đơn.",
            );
          }}
        >
          <MemberField
            users={users.data || []}
            defaultValue={
              action.renew?.memberId || Number(memberId) || undefined
            }
            selfOnly={member || !!action.renew}
          />
          {!action.pkg && (
            <Field label="Gói tập">
              {demo ? (
                <select
                  name="packageId"
                  required
                  defaultValue={action.renew?.packageId || ""}
                >
                  <option value="" disabled>
                    Chọn gói thành viên
                  </option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.price)} / {p.durationDays} ngày
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="packageId"
                  type="number"
                  min="1"
                  required
                  placeholder="ID gói tập từ backend"
                  defaultValue={action.renew?.packageId}
                />
              )}
            </Field>
          )}
          {action.renew && (
            <Notice tone="warning">
              Theo logic BE hiện tại, gia hạn thay thế gói cũ và tính thời hạn
              mới từ hôm nay. Số ngày còn lại của gói cũ không được cộng dồn.
            </Notice>
          )}
          <Notice>
            {demo
              ? "Demo sẽ tạo hóa đơn chờ thu theo giá gói. Mở Hóa đơn để xem QR; gói chỉ dùng đặt lớp sau khi nhân viên xác nhận thu tiền."
              : "Backend hiện tách đăng ký gói và tạo hóa đơn. Liên hệ lễ tân để lập phiếu và xác nhận thanh toán."}
          </Notice>
        </FormModal>
      )}
      {cancel && (
        <Confirm
          title="Hủy gói thành viên?"
          description="Gói này sẽ ngừng hoạt động. Hủy gói không tự động hoàn tiền hóa đơn đã thanh toán."
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            /**
             * Hủy gói không tự hoàn tiền. Nếu cần ghi nhận hoàn tiền phải thao tác riêng
             * trên hóa đơn và đáp ứng quyền/trạng thái tương ứng.
             */
            await api.cancelSubscription(cancel.id, cancel.memberId);
            await client.invalidateQueries();
            toast("Đã hủy gói thành viên.");
          }}
        />
      )}
    </>
  );
}
