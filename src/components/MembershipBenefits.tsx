import { Check } from "lucide-react";
import type { MembershipBenefits as Benefits } from "../lib/types";
import { packageBenefitItems } from "../lib/package-benefits";
import "../styles-package-benefits.css";

export function MembershipBenefits({ value }: { value: Benefits }) {
  const items = packageBenefitItems(value);
  if (!items.length) return null;
  return (
    <ul className="membership-benefits" aria-label="Quyền lợi gói tập">
      {items.map((item) => (
        <li key={item}>
          <Check size={16} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
