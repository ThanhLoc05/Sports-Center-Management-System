import { useState } from "react";
import type { MembershipPackage } from "../lib/types";
import { packageBenefitPresets } from "../lib/package-benefits";
import { Field } from "./ui";
import { MembershipBenefits } from "./MembershipBenefits";

export function PackageBenefitFields({
  initial,
}: {
  initial?: MembershipPackage;
}) {
  const initialLevel = initial?.accessLevel === "VIP" ? "VIP" : "STANDARD";
  const preset = packageBenefitPresets[initialLevel];
  const [level, setLevel] = useState<"STANDARD" | "VIP">(initialLevel);
  const sportLimit = level === "VIP" ? null : 1;
  const [maxClasses, setMaxClasses] = useState(
    String(initial?.maxConcurrentClasses ?? preset.maxConcurrentClasses),
  );
  const [discount, setDiscount] = useState(
    String(initial?.courseDiscountPercent ?? preset.courseDiscountPercent),
  );
  const [description, setDescription] = useState(
    initial ? initial.description || "" : preset.description,
  );

  return (
    <>
      <Field label="Cấp gói">
        <select
          name="accessLevel"
          value={level}
          onChange={(event) => {
            const next = event.target.value as "STANDARD" | "VIP";
            const defaults = packageBenefitPresets[next];
            setMaxClasses(String(defaults.maxConcurrentClasses));
            setDiscount(String(defaults.courseDiscountPercent));
            if (
              !description.trim() ||
              description === packageBenefitPresets[level].description
            )
              setDescription(defaults.description);
            setLevel(next);
          }}
        >
          <option value="STANDARD">STANDARD</option>
          <option value="VIP">VIP</option>
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Phạm vi bộ môn">
          <input value={sportLimit === null ? "Tất cả bộ môn" : "Một bộ môn mỗi kỳ"} readOnly />
          <input name="sportScope" type="hidden" value={sportLimit === null ? "ALL" : "LIMITED"} />
          {sportLimit !== null && <input name="sportLimit" type="hidden" value={sportLimit} />}
        </Field>
        <Field
          label="Số lớp đang đăng ký tối đa"
          hint="Áp dụng khi ghi danh lớp theo lịch cố định."
        >
          <input
            name="maxConcurrentClasses"
            type="number"
            min={1}
            step={1}
            required
            value={maxClasses}
            onChange={(event) => setMaxClasses(event.target.value)}
          />
        </Field>
        <Field
          label="Ưu đãi học phí khóa học (%)"
          hint="Áp dụng cho khóa học có ưu đãi."
        >
          <input
            name="courseDiscountPercent"
            type="number"
            min={0}
            max={100}
            step={1}
            required
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Mô tả"
        hint="Quyền lợi phục vụ như khăn tập và nước uống miễn phí của VIP được ghi tại đây."
      >
        <textarea
          name="description"
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="package-benefit-preview">
        <strong>Quyền lợi hiển thị cho học viên</strong>
        <MembershipBenefits
          value={{
            accessLevel: level,
            sportLimit,
            maxConcurrentClasses: Number(maxClasses),
            courseDiscountPercent: Number(discount),
          }}
        />
        {description && <p>{description}</p>}
      </div>
    </>
  );
}
