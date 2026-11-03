/**
 * BỘ COMPONENT GIAO DIỆN DÙNG CHUNG.
 * Các trang ghép Button, bảng, hộp thoại và form từ đây để có hành vi nhất quán.
 * FormModal/Confirm chỉ điều phối thao tác; hàm nghiệp vụ thực tế do trang truyền vào.
 */
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  FormEvent,
  ReactElement,
  ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Info,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { User } from "../lib/types";
import { errorText, initials } from "../lib/utils";
/**
 * Nút hỗ trợ trạng thái loading; khi đang xử lý sẽ disabled để hạn chế nhấn
 * nhiều lần trong cùng một thao tác giao diện.
 */
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
/**
 * Đổi mã trạng thái từ dữ liệu (BOOKED, PAID...) thành nhãn tiếng Việt và màu.
 * Chỉ hiển thị trạng thái; không thực hiện chuyển trạng thái nghiệp vụ.
 */
export function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  const labels: Record<string, string> = {
    ACTIVE: "Đang hoạt động",
    INACTIVE: "Ngừng hoạt động",
    BLOCKED: "Đã khóa",
    EXPIRED: "Hết hạn",
    CANCELLED: "Đã hủy",
    SCHEDULED: "Sắp diễn ra",
    COMPLETED: "Hoàn thành",
    BOOKED: "Đã đăng ký",
    PAID: "Đã thanh toán",
    PENDING: "Chờ thanh toán",
    REFUNDED: "Đã hoàn tiền",
    PRESENT: "Có mặt",
    ABSENT: "Vắng mặt",
    OPEN: "Chờ tiếp nhận",
    RESOLVED: "Đã xử lý",
  };
  return (
    <span className={`badge badge-${(status || "neutral").toLowerCase()} ${status === "PENDING" ? "status-unpaid" : status === "PAID" ? "status-paid" : ""}`}>
      <span className="badge-dot" />
      {children || labels[status || ""] || status}
    </span>
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
/**
 * Tiêu đề và nhóm nút thao tác đầu trang, tái sử dụng cho các module.
 */
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
/**
 * Controlled input: giá trị do trang cha giữ; khi gõ sẽ gọi onChange về cha
 * để trang quyết định lọc dữ liệu. Component này không tự gọi API tìm kiếm.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  label = "Tìm kiếm",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={label}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Xóa tìm kiếm" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = "Chưa có dữ liệu",
  description = "Dữ liệu mới sẽ xuất hiện tại đây.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
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
/**
 * Hiện lỗi đọc dữ liệu và cho thử lại khi trang truyền hàm retry.
 * Không biến lỗi mạng thành trạng thái danh sách trống.
 */
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => unknown;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={25} />
      <h3>Không thể tải dữ liệu</h3>
      <p>{errorText(error)}</p>
      {retry && (
        <Button variant="secondary" onClick={() => retry()}>
          Thử lại
        </Button>
      )}
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
/**
 * Thông báo giới hạn những chức năng backend chưa có API. Tên component
 * không có nghĩa tự ẩn nó trong API mode; trang truyền nội dung thông báo phù hợp.
 */
export function DemoOnly({ children }: { children?: ReactNode }) {
  return (
    <Notice tone="warning">
      {children || "Chức năng này chưa có endpoint trong backend hiện tại."}
    </Notice>
  );
}
/**
 * Hộp thoại dùng chung: khóa cuộn nền, giữ focus trong hộp thoại khi Tab, hỗ trợ
 * Escape và trả focus về chỗ cũ khi đóng. dismissible=false chặn đóng khi đang gửi.
 */
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  dismissible = true,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dismissible?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = () => {
    if (dismissible) onClose();
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll("[role=dialog]");
      if (dialogs[dialogs.length - 1] !== node) return;
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const list = focusable();
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="modal-heading">
          <div>
            <h2 id={id}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-btn"
            aria-label="Đóng hộp thoại"
            disabled={!dismissible}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
/**
 * Luồng form: chặn reload trang → gom FormData → khóa nút trong lúc chờ →
 * await onSubmit do trang cung cấp. Chỉ thành công mới đóng; lỗi giữ form để sửa
 * và hiện thông báo. finally luôn mở khóa dù thành công hay thất bại.
 */
export function FormModal({
  title,
  description,
  children,
  onClose,
  onSubmit,
  submitLabel = "Lưu thay đổi",
  submitDisabled = false,
  wide = false,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<unknown>;
  submitLabel?: string;
  submitDisabled?: boolean;
  wide?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await onSubmit(data);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      wide={wide}
      dismissible={!busy}
      className={className}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="form-fields">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
        <div className="modal-footer">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Đóng
          </Button>
          <Button loading={busy} disabled={submitDisabled} type="submit">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
/**
 * Gắn label với input/select/textarea bằng id tự sinh và nối mô tả trợ giúp
 * để người dùng bàn phím hoặc trình đọc màn hình nhận biết trường nhập.
 */
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
export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="select-wrap">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={15} />
    </label>
  );
}
/**
 * Có danh sách thì cho chọn thành viên; không có thì nhập ID backend.
 * selfOnly giữ người đang đăng nhập, đồng thời thêm hidden input vì control
 * disabled không được đưa vào FormData. Backend vẫn phải kiểm tra quyền sở hữu.
 */
export function MemberField({
  users,
  defaultValue,
  name = "memberId",
  label = "Thành viên",
  selfOnly = false,
}: {
  users: User[];
  defaultValue?: number;
  name?: string;
  label?: string;
  selfOnly?: boolean;
}) {
  const members = users.filter((u) => u.roleName === "MEMBER");
  return (
    <Field label={label}>
      {members.length ? (
        <select
          name={name}
          required
          defaultValue={defaultValue || ""}
          disabled={selfOnly}
        >
          <option value="" disabled>
            Chọn thành viên
          </option>
          {members.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} · #{u.id}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type="number"
          min="1"
          step="1"
          required
          defaultValue={defaultValue}
          readOnly={selfOnly}
          placeholder="Nhập ID thành viên từ backend"
        />
      )}
      {selfOnly && <input type="hidden" name={name} value={defaultValue} />}
    </Field>
  );
}
/**
 * Xác nhận thao tác như hủy đăng ký hoặc hoàn tiền; await onConfirm xong mới
 * đóng. Nếu API lỗi, hộp thoại giữ lại thông báo và không báo thành công.
 */
export function Confirm({
  title,
  description,
  onClose,
  onConfirm,
  danger = true,
  className = "",
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  danger?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title={title} onClose={onClose} dismissible={!busy} className={className}>
      <p className="confirm-description">{description}</p>
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <div className="modal-footer">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Quay lại
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setErr(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Xác nhận
        </Button>
      </div>
    </Modal>
  );
}
interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
}
/**
 * Bảng phân trang trên mảng đã tải ở frontend bằng slice; đây không phải
 * phân trang bằng API/SQL. Trang cha chịu trách nhiệm lọc rows trước khi truyền vào.
 */
export function DataTable<T extends { id: number }>({
  rows,
  columns,
  pageSize = 8,
  label = "Danh sách",
}: {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  label?: string;
}) {
  const [page, setPage] = useState(1);
  const max = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, max);
  return (
    <>
      <div className="table-scroll">
        <table aria-label={label}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice((current - 1) * pageSize, current * pageSize)
              .map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            title="Không có kết quả"
            description="Thử thay đổi bộ lọc hoặc thêm dữ liệu mới."
          />
        )}
      </div>
      <div className="table-footer">
        <span>
          {rows.length
            ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, rows.length)}`
            : "0"}{" "}
          trong <strong>{rows.length}</strong> kết quả
        </span>
        <div className="pagination">
          <button
            aria-label="Trang trước"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <ArrowLeft size={15} />
          </button>
          <span>
            {current} / {max}
          </span>
          <button
            aria-label="Trang sau"
            disabled={current >= max}
            onClick={() => setPage(current + 1)}
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
const ToastContext = createContext<
  (text: string, tone?: "success" | "error") => void
>(() => {});
/**
 * Cung cấp hàm toast cho toàn ứng dụng và quản lý thời gian tự ẩn thông báo.
 * Thông báo chỉ phản ánh kết quả hàm xử lý; không tự ghi dữ liệu nghiệp vụ.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<
    { id: number; text: string; tone: string }[]
  >([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = (text: string, tone = "success") => {
    const id = Date.now() + Math.random();
    setMessages((m) => [...m, { id, text, tone }]);
    timers.current.push(
      setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 5000),
    );
  };
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`toast toast-${m.tone}`}>
            {m.tone === "error" ? (
              <AlertCircle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <span>{m.text}</span>
            <button
              aria-label="Đóng thông báo"
              onClick={() => setMessages((x) => x.filter((t) => t.id !== m.id))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <ArrowDownToLine size={16} />
      Xuất CSV
    </Button>
  );
}
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li>
      <Check size={16} />
      {children}
    </li>
  );
}
