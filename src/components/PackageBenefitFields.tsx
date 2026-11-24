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
  const [sportLimit, setSportLimit] = useState<number | null>(
    initial?.sportLimit !== undefined ? initial.sportLimit : preset.sportLimit,
  );
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
            setSportLimit(defaults.sportLimit);
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
          <select
            name="sportScope"
            value={sportLimit === null ? "ALL" : "LIMITED"}
            onChange={(event) =>
              setSportLimit(event.target.value === "ALL" ? null : 1)
            }
          >
            <option value="LIMITED">Chọn số bộ môn trong kỳ gói</option>
            <option value="ALL">Tất cả bộ môn</option>
          </select>
        </Field>
        {sportLimit !== null && (
          <Field label="Số bộ môn được chọn">
            <input
              name="sportLimit"
              type="number"
              min={1}
              step={1}
              required
              value={sportLimit || ""}
              onChange={(event) => setSportLimit(Number(event.target.value))}
            />
          </Field>
        )}
        <Field
          label="Số lớp đang đăng ký tối đa"
          hint="Một lớp có nhiều buổi mỗi tuần vẫn tính là một lớp."
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
