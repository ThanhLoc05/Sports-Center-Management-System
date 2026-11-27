/**
 * [GÓI COMBO] So sánh quyền lợi 2 gói STANDARD và VIP, mỗi gói có combo 1 tháng và 3 tháng.
 * Dùng chung cho MEMBER (tự chọn gói) và LỄ TÂN (chọn gói hộ thành viên) ở trang Gói thành viên.
 * Giá lấy từ API GET /membership-packages (backend), FE chỉ hiển thị; giá tiền mặt = giá chuyển khoản.
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

/** 30 ngày → "Combo 1 tháng", 90 ngày → "Combo 3 tháng"; số ngày khác giữ nguyên. */
function comboLabel(days: number) {
  return days % 30 === 0 ? `Combo ${days / 30} tháng` : `${days} ngày`;
}

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
        // Mỗi gói chỉ hiện 2 combo: 1 tháng (30 ngày) và 3 tháng (90 ngày).
        // Nếu có nhiều gói cùng thời hạn, ưu tiên gói có tên chứa STANDARD/VIP (vd "Gói STANDARD 1 tháng").
        const sameLevel = offers.filter((o) => (o.accessLevel || "STANDARD") === level);
        const combos = [30, 90]
          .map((days) => {
            const matches = sameLevel.filter((o) => o.durationDays === days);
            return matches.find((o) => o.name.toUpperCase().includes(level)) || matches[0];
          })
          .filter((o): o is MembershipOffer => !!o);
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
              {combos.length ? (
                combos.map((offer) => (
                  <div className="plan-combo" key={offer.id}>
                    <div>
                      <span>{comboLabel(offer.durationDays)}</span>
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
                <p className="plan-subtitle">Chưa mở bán combo cho gói này.</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
