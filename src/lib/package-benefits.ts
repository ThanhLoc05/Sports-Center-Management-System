import type { MembershipBenefits } from "./types";

/** Gợi ý khi tạo/chuyển cấp gói. Thẻ bán hàng luôn dùng giá trị API đã lưu. */
export const packageBenefitPresets = {
  STANDARD: {
    sportLimit: 1,
    maxConcurrentClasses: 1,
    courseDiscountPercent: 0,
    description:
      "Duy trì tập luyện với các lớp STANDARD; xem lịch, thông tin HLV và theo dõi kết quả tập luyện.",
  },
  VIP: {
    sportLimit: null,
    maxConcurrentClasses: 2,
    courseDiscountPercent: 10,
    description:
      "Tham gia lớp STANDARD và VIP, xem lịch, thông tin HLV và theo dõi kết quả tập luyện. Khăn tập và nước uống miễn phí khi tập tại trung tâm.",
  },
} as const;

export function packageBenefitItems(value: MembershipBenefits): string[] {
  const items: string[] = [];
  if (value.sportLimit === null) items.push("Tất cả bộ môn trung tâm cung cấp");
  else if (value.sportLimit !== undefined && value.sportLimit > 0)
    items.push(`Chọn ${value.sportLimit} bộ môn trong kỳ gói`);
  if (value.accessLevel === "STANDARD") items.push("Tham gia các lớp STANDARD");
  if (value.accessLevel === "VIP")
    items.push("Tham gia các lớp STANDARD và VIP");
  if (value.maxConcurrentClasses != null && value.maxConcurrentClasses > 0)
    items.push(
      `Đăng ký tối đa ${value.maxConcurrentClasses} lớp theo lịch cố định cùng lúc, không trùng lịch`,
    );
  if (value.courseDiscountPercent === 0)
    items.push("Khóa học theo học phí niêm yết");
  else if (
    value.courseDiscountPercent != null &&
    value.courseDiscountPercent > 0
  )
    items.push(`Giảm ${value.courseDiscountPercent}% học phí khóa học áp dụng`);
  return items;
}

export function packageBenefitInput(data: FormData) {
  const allSports = data.get("sportScope") === "ALL";
  return {
    allSports,
    sportLimit: allSports ? null : Number(data.get("sportLimit")),
    maxConcurrentClasses: Number(data.get("maxConcurrentClasses")),
    courseDiscountPercent: Number(data.get("courseDiscountPercent")),
  };
}
