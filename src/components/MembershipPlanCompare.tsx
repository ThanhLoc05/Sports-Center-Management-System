/**
 * [GÓI COMBO] So sánh quyền lợi STANDARD và VIP, hiển thị từng gói đang bán trong mỗi nhóm.
 * Dùng chung cho MEMBER (tự chọn gói) và LỄ TÂN (chọn gói hộ thành viên) ở trang Gói thành viên.
 * Tên, giá niêm yết và thời hạn lấy từ API GET /membership-packages.
 */
import { CircleCheck, CreditCard, Crown, X } from "lucide-react";
import type { MembershipOffer } from "../lib/membership-checkout";
import { money } from "../lib/utils";
import { Button } from "./ui";

type Level = "STANDARD" | "VIP";

// Danh sách quyền lợi hiển thị trên thẻ; ok = false thì hiện dấu X (gói không có quyền lợi này).
const PLANS: Record<Level, { title: string; subtitle: string; items: [string, boolean][] }> = {
  STANDARD: {
    title: "STANDARD",
    subtitle: "Gói tập tiêu chuẩn",
    items: [
      ["Tập không giới hạn số buổi", true],
      ["Đăng ký 1 bộ môn đã chọn", true],
      ["Tham gia lớp có HLV", true],
      ["Đăng ký lớp trước", true],
      ["Danh sách chờ Waitlist", true],
      ["Theo dõi kết quả tập luyện", true],
      ["Khăn tập miễn phí", false],
      ["Nước uống miễn phí", false],
      ["Tập tất cả bộ môn", false],
    ],
  },
  VIP: {
    title: "VIP",
    subtitle: "Gói tập cao cấp",
    items: [
      ["Tập không giới hạn số buổi", true],
      ["Đăng ký tất cả bộ môn", true],
      ["Tham gia lớp có HLV", true],
      ["Đăng ký lớp trước", true],
      ["Danh sách chờ Waitlist", true],
      ["Theo dõi kết quả tập luyện", true],
      ["Khăn tập miễn phí", true],
      ["Nước uống miễn phí", true],
      ["Linh hoạt lựa chọn bộ môn", true],
    ],
  },
};

export function MembershipPlanCompare({
  offers,
  disabled,
  activePackageId,
  onChoose,
}: {
  offers: MembershipOffer[];
  disabled: boolean;
  activePackageId?: number;
  onChoose: (offer: MembershipOffer) => void;
}) {
  return (
    <div className="plan-compare">
      {(["STANDARD", "VIP"] as Level[]).map((level) => {
        const plan = PLANS[level];
        // Giữ từng mã gói để các gói cùng thời hạn vẫn có thể được chọn riêng.
        const availableOffers = offers
          .filter((offer) => (offer.accessLevel || "STANDARD") === level)
          .sort((a, b) => a.durationDays - b.durationDays || a.id - b.id);
        return (
          <article
            key={level}
            className={`plan-card${level === "VIP" ? " plan-card-vip" : ""}`}
            aria-label={`Gói ${plan.title}`}
          >
            <span className="plan-icon" aria-hidden="true">
              {level === "VIP" ? <Crown size={22} /> : <CreditCard size={22} />}
            </span>
            <h3>{plan.title}</h3>
            <p className="plan-subtitle">{plan.subtitle}</p>
            <ul className="plan-benefits">
              {plan.items.map(([text, ok]) => (
                <li key={text} className={ok ? "" : "plan-benefit-off"}>
                  {ok ? <CircleCheck size={15} /> : <X size={15} />}
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <div className="plan-combos">
              {availableOffers.length ? (
                availableOffers.map((offer) => (
                  <div className="plan-combo" key={offer.id}>
                    <div>
                      <span>{offer.name} · {offer.durationDays} ngày</span>
                      <strong>{money(offer.price)}</strong>
                    </div>
                    {/* [NÚT] NÚT "Chọn / Gia hạn" combo → mở form tạo đơn đăng ký/gia hạn (gọi POST /membership-orders khi gửi) */}
                    <Button
                      variant={level === "VIP" ? "secondary" : "primary"}
                      disabled={disabled}
                      aria-label={`Chọn ${offer.name}`}
                      onClick={() => onChoose(offer)}
                    >
                      {activePackageId === offer.id ? "Gia hạn" : "Chọn"}
                    </Button>
                  </div>
                ))
              ) : (
                <p className="plan-subtitle">Chưa có gói đang bán ở cấp này.</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
