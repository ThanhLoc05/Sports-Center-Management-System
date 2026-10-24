/** Component chung tách từ frontend hiện có; chưa chứa màn nghiệp vụ. */
import { Children, cloneElement, isValidElement, useId } from "react";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { Info, Loader2 } from "lucide-react";
import { initials } from "../lib/utils";

export function Button({
  children,
  variant = "primary",
  className = "",
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`btn btn-${variant} ${className}`}
    >
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  );
}

export function Avatar({
  name,
  size = "normal",
  index = 0,
}: {
  name: string;
  size?: "small" | "normal" | "large";
  index?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar-${size} avatar-color-${index % 5}`}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading() {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={26} />
      <p>Đang tải dữ liệu...</p>
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div className={`notice notice-${tone}`}>
      <Info size={17} />
      <div>{children}</div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  let assigned = false;
  function attach(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (!isValidElement(child)) return child;
      const element = child as ReactElement<{
        children?: ReactNode;
        id?: string;
        type?: string;
        "aria-describedby"?: string;
      }>;
      if (
        typeof element.type === "string" &&
        ["input", "select", "textarea"].includes(element.type) &&
        element.props.type !== "hidden" &&
        !assigned
      ) {
        assigned = true;
        return cloneElement(element, {
          id,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        });
      }
      if (element.props.children)
        return cloneElement(element, {
          children: attach(element.props.children),
        });
      return element;
    });
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {attach(children)}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
