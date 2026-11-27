import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, CalendarDays, CalendarX, CircleCheck, Clock3, Dumbbell, X } from "lucide-react";
import { getSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { routeAllowed } from "../lib/permissions";
import {
  getNotificationStreamStatus, getReceivedNotifications, mergeNotificationItems, newestNotificationFirst,
  notificationsApi, subscribeNotificationStreamStatus, subscribeReceivedNotifications, type NotificationEvent,
} from "../lib/notifications-api";
import { addDays, dateLabel, errorText, localDate, parseDate, timeLabel } from "../lib/utils";
import { Button, Loading, useToast } from "./ui";
import "../styles-notification-center.css";

const categories = {
  SCHEDULE: { label: "Thay đổi lịch", icon: CalendarDays, tone: "blue" },
  BOOKING: { label: "Đăng ký", icon: CircleCheck, tone: "green" },
  CANCELLATION: { label: "Hủy lịch hoặc đăng ký", icon: CalendarX, tone: "red" },
  WAITLIST: { label: "Danh sách chờ", icon: Clock3, tone: "amber" },
  WARNING: { label: "Cảnh báo", icon: Clock3, tone: "amber" },
  HOMEWORK: { label: "Bài tập", icon: Dumbbell, tone: "purple" },
  GENERAL: { label: "Thông báo", icon: Bell, tone: "neutral" },
};

type Category = keyof typeof categories;
function categoryOf(event: NotificationEvent): Category {
  if (event.kind === "HOMEWORK") return "HOMEWORK";
  if (event.category && Object.prototype.hasOwnProperty.call(categories, event.category)) return event.category as Category;
  if (!event.category && event.link === "/schedule") return "SCHEDULE";
  return "GENERAL";
}

const destinations = new Set(["/schedule", "/sessions", "/classes", "/session-bookings", "/memberships", "/training", "/support", "/payments"]);
function notificationLink(event: NotificationEvent, session: ReturnType<typeof getSession>) {
  const member = session?.user.roleName === "MEMBER";
  const category = categoryOf(event);
  if (category === "WAITLIST" && member) return "/classes?tab=waitlist";
  if (category === "BOOKING" && member) return "/classes";
  const link = event.link || (event.kind === "HOMEWORK" ? "/training" : null);
  if (!link) return null;
  const path = link.split(/[?#]/, 1)[0];
  return destinations.has(path) && routeAllowed(session, path) !== false ? link : null;
}

function useNotificationCenter() {
  const { session } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const key = ["notification-history", session?.user.id];
  const live = useSyncExternalStore(subscribeReceivedNotifications, getReceivedNotifications, getReceivedNotifications);
  const stream = useSyncExternalStore(subscribeNotificationStreamStatus, getNotificationStreamStatus, getNotificationStreamStatus);
  const history = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => notificationsApi.history(pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.hasNext ? page.page + 1 : undefined,
    enabled: session?.mode === "api",
    retry: false,
    staleTime: 30_000,
  });
  const reconnecting = useRef(false);
  useEffect(() => {
    if (stream.status === "reconnecting") reconnecting.current = true;
    else {
      if (stream.status === "connected" && reconnecting.current && session?.mode === "api")
        void client.invalidateQueries({ queryKey: ["notification-history", session.user.id] }, { cancelRefetch: false });
      reconnecting.current = false;
    }
  }, [client, session?.mode, session?.user.id, stream.status]);
  const current = () => getSession()?.token === session?.token && getSession()?.user.id === session?.user.id;
  const read = useMutation({
    mutationFn: notificationsApi.markRead,
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (item) => {
      if (!current()) return;
      client.setQueryData(key, (old: typeof history.data) => {
        if (!old) return old;
        const saved = old.pages.flatMap((page) => page.content).find((row) => row.id === item.id);
        const updated = { ...item, category: item.category ?? saved?.category };
        return {
          ...old,
          pages: old.pages.map((page, index) => ({
            ...page,
            unreadCount: index === 0 && page.unreadCount !== undefined && saved && !saved.readAt
              ? Math.max(0, page.unreadCount - 1) : page.unreadCount,
            content: index === 0 && !saved ? [updated, ...page.content]
              : page.content.map((row) => row.id === item.id ? updated : row),
          })),
        };
      });
      void client.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
    },
    onError: (error) => { if (current()) toast(errorText(error), "error"); },
  });
  const items = mergeNotificationItems(history.data?.pages.flatMap((page) => page.content) ?? [], live);
  const unread = history.data?.pages[0]?.unreadCount;
  return { history, stream, items, unread, read, session };
}

export interface InboxCard {
  key: string;
  id: number;
  createdAt: string;
  content: ReactNode;
}

type Filter = "all" | "unread" | "schedule" | "homework";
type Center = ReturnType<typeof useNotificationCenter>;
const labels: Record<Filter, string> = { all: "Tất cả", unread: "Chưa đọc", schedule: "Lịch tập", homework: "Bài tập" };

function NotificationFeed({ center, openLink, compact, additionalCards = [], canShowEmpty = true }: {
  center: Center; openLink?: () => void; compact?: boolean; additionalCards?: InboxCard[]; canShowEmpty?: boolean;
}) {
  const [filter, select] = useState<Filter>("all");
  const { history, items, read, session, stream } = center;
  const visible = items.filter((event) => {
    const category = categoryOf(event);
    return filter === "all" || (filter === "unread" && event.kind === "GENERAL" && !event.readAt)
      || (filter === "schedule" && ["SCHEDULE", "BOOKING", "WAITLIST", "CANCELLATION", "WARNING"].includes(category))
      || (filter === "homework" && category === "HOMEWORK");
  });
  const cards: InboxCard[] = (compact ? visible.slice(0, 8) : visible).map((event) => {
    const { icon: Icon, label, tone } = categories[categoryOf(event)];
    const general = event.kind === "GENERAL";
    const unread = general && !event.readAt;
    const link = notificationLink(event, session ?? null);
    return {
      key: general ? `GENERAL:${event.id}` : `HOMEWORK:${event.id}:${event.createdAt}`,
      id: event.id,
      createdAt: event.createdAt,
      content: (
        <article className={`notification-row inbox-card${unread ? " unread" : ""}`} data-tone={tone}>
          <div className="notification-row-icon"><Icon size={18} aria-hidden="true" /></div>
          <div className="notification-row-copy">
            <header>
              {link ? <Link to={link} onClick={() => { if (unread && !read.isPending) read.mutate(event.id); openLink?.(); }}>
                {event.title}
              </Link> : <strong>{event.title}</strong>}
              {general && <span className="notification-row-state">{event.readAt ? "Đã đọc" : "Chưa đọc"}</span>}
            </header>
            <p>{event.content}</p>
            {event.link && !link && <small>Nội dung liên quan không khả dụng.</small>}
            <div className="notification-row-meta">
              <small>{label} · <time dateTime={event.createdAt}>{dateLabel(event.createdAt)} · {timeLabel(event.createdAt)}</time></small>
              {unread && <button type="button" className="text-link" disabled={read.isPending} onClick={() => read.mutate(event.id)}>Đánh dấu đã đọc</button>}
            </div>
          </div>
        </article>
      ),
    };
  });
  if (filter === "all") cards.push(...additionalCards);
  cards.sort(newestNotificationFirst);

  const today = localDate();
  const yesterday = localDate(addDays(-1));
  const groups = new Map<string, InboxCard[]>();
  for (const card of cards) {
    const date = parseDate(card.createdAt);
    const received = Number.isFinite(date.getTime()) ? localDate(date) : "";
    const group = received === today ? "Hôm nay" : received === yesterday ? "Hôm qua" : "Trước đó";
    const rows = groups.get(group);
    if (rows) rows.push(card);
    else groups.set(group, [card]);
  }

  return (
    <>
      <div className="notification-filters" role="group" aria-label="Lọc thông báo">
        {(Object.keys(labels) as Filter[]).filter((value) => value !== "homework" || session?.user.roleName === "MEMBER").map((value) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => select(value)}>{labels[value]}</button>)}
      </div>
      {(stream.status === "reconnecting" || stream.status === "error") &&
        <p className="notification-feedback" role="status">Mất kết nối thông báo trực tiếp. <button className="text-link" onClick={() => void history.refetch()}>Tải lại danh sách</button></p>}
      <div className="notification-feed" aria-label="Danh sách thông báo" tabIndex={compact ? 0 : undefined}>
        {history.isPending && !cards.length && <Loading />}
        {history.error && <div className="notification-feedback" role="alert">
          Không thể tải thông báo. <button className="text-link" onClick={() => void history.refetch()}>Thử lại</button>
        </div>}
        {!history.isPending && !history.error && canShowEmpty && !cards.length &&
          <p className="notification-feedback">{filter === "all" ? "Chưa nhận thông báo nào"
            : history.hasNextPage ? "Chưa có thông báo phù hợp trong các mục đã tải."
              : filter === "unread" ? "Không có thông báo chưa đọc." : "Không có thông báo thuộc loại này."}</p>}
        {[...groups].map(([group, rows]) => <section key={group} className="notification-day">
          <h3>{group}</h3>
          {rows.map((card) => <Fragment key={card.key}>{card.content}</Fragment>)}
        </section>)}
        {history.hasNextPage && (!compact || !cards.length) && (
          <Button variant="secondary" loading={history.isFetchingNextPage} disabled={history.isFetching && !history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}>Tải thêm thông báo</Button>
        )}
      </div>
    </>
  );
}

export function ApiNotificationInbox({ additionalCards, canShowEmpty }: { additionalCards?: InboxCard[]; canShowEmpty?: boolean }) {
  const center = useNotificationCenter();
  return <section className="panel notification-inbox">
    <h2>Thông báo của bạn</h2>
    {center.unread !== undefined && <p className="notification-inbox-count">{center.unread ? `${center.unread} chưa đọc` : "Đã đọc tất cả"}</p>}
    <NotificationFeed key={center.session?.user.id} center={center} additionalCards={additionalCards} canShowEmpty={canShowEmpty} />
  </section>;
}

export function NotificationBell() {
  const center = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [position, setPosition] = useState<CSSProperties>({});
  const unread = center.unread ?? 0;
  function dismiss(focus = false) {
    setOpen(false);
    if (focus) button.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    function place() {
      const anchor = button.current?.getBoundingClientRect();
      if (anchor) setPosition({
        "--notification-top": `${anchor.bottom + 8}px`,
        "--notification-right": `${Math.max(12, window.innerWidth - anchor.right)}px`,
      } as CSSProperties);
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !button.current?.contains(event.target) && !panel.current?.contains(event.target)) dismiss();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss(true);
    }
    place();
    heading.current?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <>
      <button type="button" className="icon-btn notification-trigger" ref={button} aria-label="Thông báo"
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        <Bell size={19} aria-hidden="true" />
        {unread > 0 && <span className="notification-count" aria-label={`${unread} thông báo chưa đọc`}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && createPortal(
        <section id={id} role="dialog" aria-labelledby={`${id}-title`} className="notification-popover" ref={panel} style={position}>
          <header className="notification-popover-head">
            <div><h2 id={`${id}-title`} tabIndex={-1} ref={heading}>Thông báo</h2>
              {center.unread !== undefined && <p>{unread ? `${unread} chưa đọc` : "Đã đọc tất cả"}</p>}
            </div>
            <button type="button" className="icon-btn" aria-label="Đóng thông báo" onClick={() => dismiss(true)}><X size={19} /></button>
          </header>
          <NotificationFeed compact center={center} openLink={() => dismiss()} />
          <Link className="notification-all" to="/notifications" onClick={() => dismiss()}>
            Xem tất cả thông báo <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>, document.body)}
    </>
  );
}
