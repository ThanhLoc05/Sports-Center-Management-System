// [VAI TRÒ] Tổng quan. LỄ TÂN: số liệu chung + thao tác nhanh. MEMBER: gói đang dùng, lớp đã đăng ký, buổi tập hôm nay.
/**
 * TỔNG QUAN THEO VAI TRÒ: ghép dữ liệu thành viên, lớp, gói và doanh thu.
 * Không có database riêng cho dashboard; chỉ đọc các nguồn đã dùng ở module nghiệp vụ.
 * Số liệu/biểu đồ không có endpoint được phân biệt với dữ liệu demo để tránh hiểu sai.
 */
import { useCatalog } from "../lib/catalog";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Plus,
  ScanLine,
  TrendingUp,
  Users,
  Zap,
  Leaf,
  Target,
  CircleDot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../lib/auth";
import {
  useClasses,
  useUsers,
  usePermissions,
  useDemoData,
} from "../lib/hooks";
import { routeAllowed } from "../lib/permissions";
import { api } from "../lib/api";
import { readDemo } from "../lib/demo";
import { membershipCheckout } from "../lib/membership-checkout";
import { isStaff } from "../lib/types";
import {
  parseDate,
  addDays,
  dateLabel,
  downloadCsv,
  localDate,
  money,
  number,
  timeLabel,
} from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Select,
  TextLink,
} from "../components/ui";
/**
 * Hiệu ứng đếm tăng dần cho số liệu thẻ thống kê (vd "15.316.000 ₫" chạy từ 0 lên).
 * Cách làm: chỉ nhận chuỗi bắt đầu bằng số dạng vi-VN (dấu chấm ngăn nghìn), tách phần
 * số và phần đuôi, dùng requestAnimationFrame tăng số trong ~0,8s rồi trả đúng chuỗi gốc.
 * Lý do: tạo điểm nhấn khi mở Tổng quan mà không đổi dữ liệu; chuỗi không phải số
 * (tên gói, "—") hiển thị nguyên, và tắt hẳn khi người dùng bật giảm chuyển động.
 */
function countUpParts(value: string) {
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+)(\D*)$/.exec(value);
  const reduced =
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return match && !reduced ? match : null;
}
function useCountUp(value: string) {
  // Bắt đầu từ 0 ngay ở lần vẽ đầu để không bị nháy số cuối rồi mới đếm lại.
  const [display, setDisplay] = useState(() => {
    const match = countUpParts(value);
    return match ? "0" + match[2] : value;
  });
  useEffect(() => {
    const match = countUpParts(value);
    if (!match) {
      setDisplay(value);
      return;
    }
    const target = Number(match[1].replace(/\./g, ""));
    const suffix = match[2];
    const duration = 800;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      if (progress < 1) {
        setDisplay(
          Math.round(target * eased).toLocaleString("vi-VN") + suffix,
        );
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return display;
}
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "green",
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  tone?: string;
  trend?: string;
}) {
  const shown = useCountUp(value);
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={18} strokeWidth={1.7} />
        </span>
      </div>
      <strong className="stat-value" aria-label={value}>
        {shown}
      </strong>
      <div className="stat-bottom">
        {trend && (
          <span className="stat-trend">
            <TrendingUp size={13} />
            {trend}
          </span>
        )}
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
/**
 * Đọc role và mode từ session để chọn phần tổng quan phù hợp, tải các query
 * cần thiết rồi tính số liệu từ dữ liệu đã nhận; không ghi nghiệp vụ ở dashboard.
 */
export default function Dashboard() {
  // [API] useCatalog() (hook trong lib/catalog.ts) → api.sports → GET /sports; api.rooms → GET /rooms
  const { rooms } = useCatalog();
  const { session } = useAuth();
  const can = usePermissions();
  const permissionDb = useDemoData();
  const user = session!.user,
    manager = can("reports.read"),
    staff = isStaff(user.roleName),
    member = user.roleName === "MEMBER",
    coach = user.roleName === "COACH",
    demo = session!.mode === "demo";
  const classCatalog = member && !demo ? "/sessions" : "/classes";
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers();
  // [API] useClasses() (hook trong lib/hooks.ts) → api.classes → GET /classes/my-classes | /classes…
  const classes = useClasses();
  const [period, setPeriod] = useState("month");
  const [dayOffset, setDayOffset] = useState(0);
  // Khoảng doanh thu: hôm nay / 7 ngày qua / tháng này / quý này (đều tính đến hôm nay, giờ Việt Nam).
  const today = localDate();
  const quarterStart = `${today.slice(0, 5)}${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const start =
    period === "today"
      ? today
      : period === "week"
        ? localDate(addDays(-6))
        : period === "quarter"
          ? quarterStart
          : `${today.slice(0, 7)}-01`;
  const end = localDate();
  /**
   * Chỉ quản lý tải doanh thu; enabled=false không gửi query cho vai trò khác.
   * Khoảng thời gian trong key giúp cache phân biệt tuần/tháng.
   */
  const revenue = useQuery({
    queryKey: ["revenue", start, end],
    // [API] api.revenue → GET /payments/revenue?startDate={encodeURIComponent}&endDate={encodeURIComponent}
    queryFn: () => api.revenue(`${start}T00:00:00`, `${end}T23:59:59`),
    enabled: manager,
  });
  /**
   * [FLOW 3] Biểu đồ doanh thu từng ngày với dữ liệu thật từ backend (API mode).
   * Cách làm: gọi 1 lần GET /reports/summary (cùng API với trang Báo cáo), lấy dailyRevenue
   * rồi ghép thành mảng {date, revenue = doanh thu ròng, refunded = tiền hoàn}.
   * Lý do: một request thay cho gọi từng ngày, có thêm tiền hoàn để vẽ đường đỏ;
   * công thức giống ô "Doanh thu kỳ này" nên cộng các ngày vẫn khớp số tổng.
   */
  const dailyRevenue = useQuery({
    queryKey: ["revenue-daily", start, end],
    queryFn: async () => {
      // [API] api.revenueSummary → GET /reports/summary?startDate=…&endDate=…
      const summary = await api.revenueSummary(
        `${start}T00:00:00`,
        `${end}T23:59:59.9999999`,
      );
      if (!summary.dailyRevenue)
        throw new Error("Backend chưa trả doanh thu theo ngày.");
      return summary.dailyRevenue.map((p) => ({
        date: dateLabel(p.date, { day: "2-digit", month: "2-digit" }),
        revenue: p.net,
        refunded: p.refunded,
      }));
    },
    enabled: manager && !demo,
    retry: false,
  });
  /**
   * Thành viên cần booking để chọn lịch của mình. Ở API mode không tải booking
   * không có phạm vi cho nhân viên vì backend không có endpoint list-all.
   */
  const bookings = useQuery({
    queryKey: ["bookings", member ? user.id : 0],
    // [API] api.bookings → GET /classes/{classId}/bookings | /members/{memberId}/bookings
    queryFn: () => api.bookings(member ? user.id : undefined),
    enabled: demo || member,
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions", user.id],
    // [API] api.subscriptions → GET /memberships/members/{memberId}
    queryFn: () => api.subscriptions(user.id),
    enabled: member,
  });
  const memberPackages = useQuery({
    queryKey: ["membership-packages"],
    // [API] membershipCheckout.packages → GET /membership-packages
    queryFn: membershipCheckout.packages,
    enabled: member && !demo,
    retry: false,
  });
  /**
   * Các số liệu cần tập dữ liệu đầy đủ như điểm danh/ngày và biểu đồ mẫu lấy từ
   * db demo khi đang demo. API mode không dùng nguồn này thay số liệu server.
   */
  const db = demo ? readDemo() : null;
  const allClasses = classes.data || [];
  const date = localDate(addDays(dayOffset));
  const relevantClasses = member
    ? allClasses.filter((c) =>
        bookings.data?.some((b) => b.classId === c.id && b.status === "BOOKED"),
      )
    : allClasses;
  const daily = relevantClasses
    .filter((c) => c.scheduleTime.startsWith(date) && c.status !== "CANCELLED")
    .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime));
  const members = (users.data || []).filter((u) => u.roleName === "MEMBER");
  const checked =
    db?.attendance.filter(
      (a) =>
        a.status === "PRESENT" &&
        a.checkedInAt.startsWith(localDate()) &&
        (member
          ? a.memberId === user.id
          : coach
            ? allClasses.some((c) => c.id === a.classId)
            : true),
    ).length || 0;
  const activeSub = subscriptions.data?.find(
    (s) => s.status === "ACTIVE" && s.endDate >= localDate(),
  );
  const monthlyInvoices =
    db?.invoices.filter(
      (i) => i.createdAt >= start && i.paymentStatus === "PAID",
    ) || [];
  const chart = useMemo(() => {
    const list = [];
    const count =
      Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
      ) + 1;
    for (let i = 0; i < count; i++) {
      const day = addDays(i, parseDate(start));
      const key = localDate(day);
      list.push({
        date: dateLabel(day, { day: "2-digit", month: "2-digit" }),
        revenue: monthlyInvoices
          .filter((inv) => inv.createdAt.startsWith(key))
          .reduce((s, i) => s + i.amount, 0),
      });
    }
    return list;
  }, [start, end, monthlyInvoices]);
  if (classes.isPending) return <Loading />;
  if (classes.error)
    return <ErrorState error={classes.error} retry={classes.refetch} />;
  return (
    <>
      <PageHeader
        eyebrow={dateLabel(new Date(), {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).toUpperCase()}
        title={`Chào ${user.fullName.split(" ").slice(-1)[0]}, ngày mới tốt lành`}
        description={
          member
            ? "Dành một khoảng thời gian hôm nay cho phiên bản khỏe mạnh hơn của bạn."
            : coach
              ? "Cùng tạo nên những thay đổi tích cực, từng buổi tập một."
              : "Mọi chuyển động của trung tâm, trong tầm tay bạn."
        }
        actions={
          <>
            {/* [NÚT] NÚT "Xuất tổng quan" → tải file CSV */}
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv("tong-quan-sportiva.csv", [
                  ["Chỉ số", "Giá trị"],
                  ["Thành viên", members.length],
                  ["Lớp học", allClasses.length],
                  ["Doanh thu kỳ này", revenue.data ?? "Không khả dụng"],
                  ["Ngày xuất", localDate()],
                ])
              }
            >
              <ArrowDownToLine size={16} />
              Xuất tổng quan
            </Button>
            {staff ? (
              <Link className="btn btn-primary" to="/members?new=1">
                <Plus size={17} />
                Thêm thành viên
              </Link>
            ) : (
              <Link
                className="btn btn-primary"
                to={coach ? "/training?new=1" : classCatalog}
              >
                <Plus size={17} />
                {coach ? "Tạo kế hoạch" : "Khám phá lớp học"}
              </Link>
            )}
          </>
        }
      />
      <section className="welcome-banner">
        <div className="banner-copy">
          <span className="banner-eyebrow">
            <span /> MỖI NGÀY LÀ MỘT BƯỚC TIẾN
          </span>
          <h2>
            {member
              ? "Thói quen nhỏ. Thay đổi lớn."
              : coach
                ? "Truyền cảm hứng. Tạo khác biệt."
                : "Một trung tâm khỏe mạnh,\nmột cộng đồng vững vàng."}
          </h2>
          <p>
            {member
              ? "Lịch tập, mục tiêu và hành trình của bạn bắt đầu tại đây."
              : `Sẵn sàng cho ${daily.length} lớp học ${dayOffset === 0 ? "hôm nay" : "trong ngày"}? Cùng tạo nên một ngày đầy năng lượng.`}
          </p>
          <Link to="/schedule">
            {member ? "Xem lịch tập của tôi" : "Xem lịch hoạt động"}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="banner-ring ring-one" />
          <div className="banner-ring ring-two" />
          <div className="banner-grid" />
          <div className="art-weight weight-one">
            <span />
            <i />
            <span />
          </div>
          <div className="art-weight weight-two">
            <span />
            <i />
            <span />
          </div>
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">+</span>
          <div className="banner-tag">
            <span className="status-dot" />
            LET’S KEEP MOVING
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {member ? (
          <>
            <StatCard
              title="Gói tập hiện tại"
              value={
                activeSub
                  ? db?.packages.find((p) => p.id === activeSub.packageId)
                      ?.name ||
                    memberPackages.data?.find(
                      (p) => p.id === activeSub.packageId,
                    )?.name ||
                    `Gói #${activeSub.packageId}`
                  : "Chưa có gói"
              }
              subtitle={
                activeSub
                  ? // Thêm "còn N ngày" (tính theo ngày lịch như chip trạng thái gói) để thành viên biết sớm khi nào cần gia hạn.
                    `Hết hạn ${dateLabel(activeSub.endDate)} · còn ${Math.max(0, Math.round((parseDate(activeSub.endDate).getTime() - parseDate(localDate()).getTime()) / 86400000))} ngày`
                  : "Khám phá gói thành viên"
              }
              icon={CreditCard}
            />
            <StatCard
              title="Lớp đã đăng ký"
              value={number(
                bookings.data?.filter((b) => b.status === "BOOKED").length || 0,
              )}
              subtitle="Lớp học trong lịch cá nhân"
              icon={Dumbbell}
              tone="purple"
            />
            <StatCard
              title="Buổi tập hôm nay"
              value={number(daily.length)}
              subtitle="Dành thời gian cho chính bạn"
              icon={CalendarDays}
              tone="orange"
            />
            <StatCard
              title="Lượt có mặt hôm nay"
              value={demo ? number(checked) : "—"}
              subtitle={
                demo
                  ? "Được ghi nhận bởi trung tâm"
                  : "Xem chi tiết tại Điểm danh"
              }
              icon={Target}
              tone="blue"
            />
          </>
        ) : (
          <>
            <StatCard
              title={coach ? "Lớp phụ trách" : "Tổng thành viên"}
              value={
                coach
                  ? number(allClasses.length)
                  : users.data
                    ? number(members.length)
                    : "—"
              }
              subtitle={
                coach
                  ? "Được phân công cho bạn"
                  : users.data
                    ? `${members.filter((m) => m.status === "ACTIVE").length} thành viên đang hoạt động`
                    : "Danh sách cần quyền quản lý"
              }
              icon={coach ? Dumbbell : Users}
            />
            <StatCard
              title={manager ? "Doanh thu kỳ này" : "Đăng ký lớp"}
              value={
                manager
                  ? revenue.isPending
                    ? "…"
                    : revenue.data !== undefined
                      ? money(revenue.data)
                      : "—"
                  : demo
                    ? number(
                        bookings.data?.filter(
                          (b) =>
                            b.status === "BOOKED" &&
                            (!coach ||
                              allClasses.some((c) => c.id === b.classId)),
                        ).length || 0,
                      )
                    : "—"
              }
              subtitle={
                manager
                  ? {
                      today: "Trong ngày hôm nay",
                      week: "Trong 7 ngày gần nhất",
                      month: "Từ đầu tháng đến hôm nay",
                      quarter: "Từ đầu quý đến hôm nay",
                    }[period] || "Từ đầu tháng đến hôm nay"
                  : "Các lớp trong phạm vi phụ trách"
              }
              icon={CreditCard}
              tone="purple"
            />
            <StatCard
              title="Lớp học hôm nay"
              value={number(
                relevantClasses.filter(
                  (c) =>
                    c.scheduleTime.startsWith(localDate()) &&
                    c.status === "SCHEDULED",
                ).length,
              )}
              subtitle="Cùng chuyển động, cùng tiến bộ"
              icon={CalendarDays}
              tone="orange"
            />
            <StatCard
              title="Lượt điểm danh hôm nay"
              value={demo ? number(checked) : "—"}
              subtitle={
                demo
                  ? "Lượt có mặt đã ghi nhận"
                  : "Theo dõi chi tiết tại Điểm danh"
              }
              icon={ScanLine}
              tone="blue"
            />
          </>
        )}
      </div>
      <div className="dashboard-middle">
        <Panel
          title={
            manager
              ? "Tổng quan doanh thu"
              : member
                ? "Hành trình tập luyện"
                : coach
                  ? "Lịch dạy của bạn"
                  : "Hoạt động tại trung tâm"
          }
          description={
            manager
              ? "Theo dõi hiệu quả hoạt động của trung tâm."
              : "Từng bước tiến nhỏ đều đáng được ghi nhận."
          }
          action={
            manager ? (
              <Select
                label="Khoảng thời gian doanh thu"
                value={period}
                onChange={setPeriod}
              >
                <option value="today">Hôm nay</option>
                <option value="week">7 ngày qua</option>
                <option value="month">Tháng này</option>
                <option value="quarter">Quý này</option>
              </Select>
            ) : (
              <Link className="subtle-link" to="/attendance">
                Chi tiết
                <ArrowUpRight size={15} />
              </Link>
            )
          }
          className="revenue-panel"
        >
          {manager ? (
            <>
              {revenue.error ? (
                <ErrorState error={revenue.error} retry={revenue.refetch} />
              ) : (
                <>
                  <div className="chart-summary">
                    <strong>
                      {revenue.data !== undefined ? money(revenue.data) : "…"}
                    </strong>
                    <span>
                      <span className="legend-dot" />
                      Doanh thu đã thanh toán
                    </span>
                    {!demo && (
                      <span>
                        <span
                          className="legend-dot"
                          style={{ background: "#c0392b" }}
                        />
                        Tiền hoàn
                      </span>
                    )}
                  </div>
                  {!demo && dailyRevenue.isPending ? (
                    <div className="revenue-chart">
                      <Loading />
                    </div>
                  ) : demo || dailyRevenue.data ? (
                    <div className="revenue-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={demo ? chart : dailyRevenue.data}
                          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="revenueGradient"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#4e8062"
                                stopOpacity={0.18}
                              />
                              <stop
                                offset="100%"
                                stopColor="#4e8062"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="4 5"
                            vertical={false}
                            stroke="#edf0eb"
                          />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            minTickGap={35}
                            tick={{ fill: "#8b938b", fontSize: 11 }}
                            dy={9}
                          />
                          <YAxis
                            tickFormatter={(v) => `${v / 1000000}tr`}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: "#8b938b", fontSize: 11 }}
                          />
                          <Tooltip
                            formatter={(v, name) => [money(Number(v)), String(name)]}
                            contentStyle={{
                              borderRadius: 12,
                              border: "1px solid #e5e9e1",
                              fontSize: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            name="Doanh thu ròng"
                            stroke="#337153"
                            strokeWidth={2.5}
                            fill="url(#revenueGradient)"
                            activeDot={{ r: 5, strokeWidth: 3, stroke: "#fff" }}
                          />
                          {/* [FLOW 3] ĐƯỜNG MÀU ĐỎ: tiền hoàn theo ngày hoàn tiền (giống trang Báo cáo). */}
                          {!demo && (
                            <Area
                              type="monotone"
                              dataKey="refunded"
                              name="Tiền hoàn"
                              stroke="#c0392b"
                              strokeWidth={2}
                              fill="none"
                              activeDot={{ r: 5, strokeWidth: 3, stroke: "#fff" }}
                            />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="chart-api-placeholder">
                      <ChartPlaceholder />
                      <p>API hiện trả tổng doanh thu theo khoảng ngày.</p>
                      <small>
                        Biểu đồ chi tiết từng ngày cần endpoint tổng hợp tương
                        ứng.
                      </small>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="journey-panel">
              <div className="journey-circle">
                <ActivityRing />
                <strong>
                  {demo ? checked : "—"}
                  <small>LƯỢT HÔM NAY</small>
                </strong>
              </div>
              <div>
                <span className="eyebrow">CONSISTENCY IS KEY</span>
                <h3>
                  {member
                    ? "Cứ tiếp tục, bạn đang làm tốt."
                    : coach
                      ? "Mỗi buổi tập là một cơ hội."
                      : "Một khởi đầu thật nhiều năng lượng."}
                </h3>
                <p>
                  {member
                    ? "Đừng quên khởi động và lắng nghe cơ thể. Một lịch tập đều đặn bắt đầu bằng những bước nhỏ."
                    : coach
                      ? "Theo dõi lịch dạy, điểm danh và xây dựng kế hoạch phù hợp cho từng học viên."
                      : "Chào đón thành viên, theo dõi lượt đến và hỗ trợ mỗi người có một buổi tập trọn vẹn."}
                </p>
                <TextLink to={member ? "/training" : "/attendance"}>
                  {member ? "Xem kế hoạch tập luyện" : "Điểm danh lớp học"}
                </TextLink>
              </div>
            </div>
          )}
        </Panel>
        <Panel
          title="Thao tác nhanh"
          description="Ít thao tác hơn. Nhiều thời gian hơn."
          className="quick-panel"
        >
          <div className="quick-action-grid">
            {(staff
              ? [
                  {
                    to: "/attendance",
                    icon: ScanLine,
                    title: "Điểm danh",
                    desc: "Đón thành viên đến tập",
                    tone: "green",
                  },
                  {
                    to: "/memberships",
                    icon: CreditCard,
                    title: "Gia hạn gói",
                    desc: "Tiếp nối hành trình",
                    tone: "orange",
                  },
                  {
                    to: "/bookings",
                    icon: CalendarDays,
                    title: "Đăng ký lớp",
                    desc: "Sắp xếp một buổi tập",
                    tone: "purple",
                  },
                  {
                    to: "/payments?new=1",
                    icon: Plus,
                    title: "Tạo hóa đơn",
                    desc: "Ghi nhận thanh toán",
                    tone: "blue",
                  },
                ]
              : [
                  {
                    to: "/schedule",
                    icon: CalendarDays,
                    title: "Lịch của tôi",
                    desc: "Lên kế hoạch hôm nay",
                    tone: "green",
                  },
                  {
                    to: "/training",
                    icon: Target,
                    title: "Kế hoạch tập",
                    desc: "Từng bước tiến bộ",
                    tone: "orange",
                  },
                  {
                    to: "/attendance",
                    icon: Check,
                    title: "Điểm danh",
                    desc: "Xem lịch sử tham gia",
                    tone: "purple",
                  },
                  {
                    to: "/assistant",
                    icon: SparklesIcon,
                    title: "Trợ lý tập luyện",
                    desc: "Tìm cảm hứng mới",
                    tone: "blue",
                  },
                ]
            )
              .filter((a) => {
                if (a.to === "/payments?new=1") return can("payments.collect");
                if (a.to === "/attendance" && staff)
                  return can("attendance.record");
                if (a.to === "/bookings" && staff)
                  return can("bookings.assist");
                return (
                  routeAllowed(
                    session,
                    a.to.split("?")[0],
                    permissionDb || undefined,
                  ) ?? true
                );
              })
              .map((a) => (
                <Link key={a.to} to={a.to} className="quick-action">
                  <span className={`quick-icon ${a.tone}`}>
                    <a.icon size={20} />
                  </span>
                  <strong>{a.title}</strong>
                  <small>{a.desc}</small>
                  <ArrowUpRight size={14} />
                </Link>
              ))}
          </div>
          <div className="quick-note">
            <Leaf size={17} />
            <p>Một trải nghiệm tốt bắt đầu từ sự quan tâm nhỏ nhất.</p>
          </div>
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel
          title={member ? "Lịch tập cá nhân" : "Lớp học trong ngày"}
          description={`${dateLabel(addDays(dayOffset), { weekday: "long", day: "2-digit", month: "2-digit" })} · ${daily.length} lớp học`}
          action={
            <div className="day-nav">
              {/* [NÚT] NÚT "Ngày trước" → đổi cách hiển thị / bộ lọc trên màn hình (setDayOffset) */}
              <button
                aria-label="Ngày trước"
                onClick={() => setDayOffset((n) => n - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              {/* [NÚT] NÚT "Hôm nay" → đổi cách hiển thị / bộ lọc trên màn hình (setDayOffset) */}
              <button onClick={() => setDayOffset(0)}>Hôm nay</button>
              {/* [NÚT] NÚT "Ngày sau" → đổi cách hiển thị / bộ lọc trên màn hình (setDayOffset) */}
              <button
                aria-label="Ngày sau"
                onClick={() => setDayOffset((n) => n + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          }
        >
          <div className="today-class-list">
            {daily.length ? (
              daily.slice(0, 4).map((c) => {
                const count = db?.bookings.filter(
                  (b) => b.classId === c.id && b.status === "BOOKED",
                ).length;
                return (
                  <Link
                    className="today-class"
                    to={`${classCatalog}?q=${encodeURIComponent(c.className)}`}
                    key={c.id}
                  >
                    <div className="class-time">
                      <strong>{timeLabel(c.scheduleTime)}</strong>
                      <span>{c.durationMinutes} phút</span>
                    </div>
                    <span className={`class-icon sport-${c.sportId}`}>
                      <Dumbbell size={20} />
                    </span>
                    <div className="today-class-name">
                      <strong>{c.className}</strong>
                      <small>
                        {db ? rooms[c.roomId] : `Phòng #${c.roomId}`}
                        <span>·</span>
                        {users.data?.find((u) => u.id === c.coachId)
                          ?.fullName || `HLV #${c.coachId}`}
                      </small>
                    </div>
                    <div className="today-class-occupancy">
                      <span>
                        <Users size={13} />
                        {count !== undefined
                          ? `${count}/${c.maxCapacity}`
                          : `Tối đa ${c.maxCapacity}`}
                      </span>
                      <Badge
                        status={
                          parseDate(c.scheduleTime) < new Date()
                            ? "COMPLETED"
                            : "SCHEDULED"
                        }
                      />
                    </div>
                    <ChevronRight size={15} />
                  </Link>
                );
              })
            ) : (
              <Empty
                title="Một ngày để nạp lại năng lượng"
                description="Không có lớp nào trong ngày được chọn."
              />
            )}
          </div>
          <div className="panel-bottom-link">
            <TextLink to="/schedule">Xem toàn bộ lịch hoạt động</TextLink>
          </div>
        </Panel>
        <Panel
          title={staff ? "Thành viên mới" : "Dành riêng cho bạn"}
          description={
            staff
              ? "Chào đón những gương mặt mới."
              : "Khám phá thêm những điều tích cực."
          }
          action={
            staff && users.data ? (
              <Link to="/members" className="subtle-link">
                Tất cả
                <ArrowUpRight size={15} />
              </Link>
            ) : undefined
          }
        >
          {staff ? (
            <div className="new-members">
              {members.length ? (
                members
                  .slice(-4)
                  .reverse()
                  .map((m, i) => (
                    <Link
                      to={`/members?q=${encodeURIComponent(m.fullName)}`}
                      key={m.id}
                    >
                      <Avatar name={m.fullName} index={i} />
                      <div>
                        <strong>{m.fullName}</strong>
                        <small>{m.email}</small>
                      </div>
                      <Badge status={m.status} />
                    </Link>
                  ))
              ) : (
                <Notice>
                  Danh sách thành viên yêu cầu quyền quản lý từ backend. Bạn vẫn
                  có thể hỗ trợ qua ID trong từng nghiệp vụ.
                </Notice>
              )}
            </div>
          ) : (
            <div className="personal-discovery">
              <span className="discovery-icon">
                <Zap size={27} />
              </span>
              <h3>
                Một chút chuyển động,
                <br />
                thật nhiều năng lượng.
              </h3>
              <p>Khám phá lớp học mới và tìm nhịp tập phù hợp với bạn.</p>
              <Link to={classCatalog} className="btn btn-secondary">
                Tìm lớp học
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </Panel>
      </div>
      {demo && (
        <p className="demo-footnote">
          <CircleDot size={12} />
          Dữ liệu minh họa · Thao tác được lưu trên trình duyệt này
        </p>
      )}
    </>
  );
}
function ChartPlaceholder() {
  return <TrendingUp size={42} strokeWidth={1} />;
}
function ActivityRing() {
  return (
    <svg viewBox="0 0 160 160">
      <circle
        cx="80"
        cy="80"
        r="66"
        fill="none"
        stroke="#edf1e8"
        strokeWidth="10"
      />
      <circle
        cx="80"
        cy="80"
        r="66"
        fill="none"
        stroke="#527a4f"
        strokeWidth="10"
        strokeDasharray="310 415"
        strokeLinecap="round"
        transform="rotate(-90 80 80)"
      />
    </svg>
  );
}
function SparklesIcon(props: { size?: number }) {
  return <Zap {...props} />;
}
