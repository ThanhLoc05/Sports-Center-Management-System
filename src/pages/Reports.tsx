/**
 * FLOW 3 — BÁO CÁO DOANH THU THEO KHOẢNG THỜI GIAN CHO QUẢN LÝ.
 * API summary là nguồn chung cho số tiền, số hóa đơn, phương thức và file xuất.
 * Biểu đồ ngày chỉ hiện khi có dữ liệu chi tiết; không chia tổng thu thành số liệu giả.
 */
import { useState } from "react";
import {
  BarChart3,
  CreditCard,
  RotateCcw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { readDemo } from "../lib/demo";
import { useClasses, useUsers } from "../lib/hooks";
import {
  addDays,
  parseDate,
  dateLabel,
  downloadCsv,
  localDate,
  money,
  number,
} from "../lib/utils";
import {
  Button,
  Empty,
  ErrorState,
  ExportButton,
  Field,
  Loading,
  Notice,
  PageHeader,
  Panel,
} from "../components/ui";
import { methodLabels } from "./Payments";
import { OperationsReport } from "./Management";
export default function Reports() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [start, setStart] = useState(`${localDate().slice(0, 7)}-01`);
  const [end, setEnd] = useState(localDate());
  /**
   * start/end là giá trị đang nhập; range là bộ lọc đã áp dụng khi người dùng
   * xem báo cáo. Tách hai state để không gọi API lại theo từng lần sửa ô ngày.
   */
  const [range, setRange] = useState({ start, end });
  const [chartType, setChartType] = useState("area");
  const users = useUsers();
  const classes = useClasses();
  // Một response cho cả màn và CSV để các chỉ số luôn cùng khoảng thời gian.
  const query = useQuery({
    queryKey: ["revenue-summary", session!.user.id, range],
    queryFn: () =>
      api.revenueSummary(
        range.start + "T00:00:00",
        range.end + "T23:59:59.9999999",
      ),
    enabled: !demo,
    retry: false,
  });
  const db = demo ? readDemo() : null;
  const invoices = (db?.invoices || []).filter(
    (i) =>
      i.paymentStatus === "PAID" &&
      (i.paidAt || i.createdAt).slice(0, 10) >= range.start &&
      (i.paidAt || i.createdAt).slice(0, 10) <= range.end,
  );
  // Fixture không có thời điểm hoàn tiền riêng; chỉ dùng ngày tạo trong chế độ test.
  const refunded = (db?.invoices || []).filter(
    (i) =>
      i.paymentStatus === "REFUNDED" &&
      i.createdAt.slice(0, 10) >= range.start &&
      i.createdAt.slice(0, 10) <= range.end,
  );
  const demoPaid = invoices.reduce(
    (total, invoice) => total + invoice.amount,
    0,
  );
  const demoRefunded = refunded.reduce(
    (total, invoice) => total + invoice.amount,
    0,
  );
  const demoSummary = {
    totalGrossRevenue: demoPaid + demoRefunded,
    totalRefunded: demoRefunded,
    netRevenue: demoPaid,
    totalPaidInvoices: invoices.length,
    totalRefundedInvoices: refunded.length,
    revenueByMethod: Object.fromEntries(
      Object.keys(methodLabels).map((method) => [
        method,
        invoices
          .filter((invoice) => invoice.paymentMethod === method)
          .reduce((total, invoice) => total + invoice.amount, 0),
      ]),
    ),
  };
  // Giữ nguyên số liệu BE trả về, kể cả doanh thu ròng âm; FE không sửa công thức BE.
  const summary = demo ? demoSummary : query.error ? undefined : query.data;
  const reportLoading = !demo && query.isPending;
  const exportDisabled =
    !summary || (!demo && (query.isFetching || !!query.error));
  const amountLabel = (value?: number) =>
    value === undefined ? (reportLoading ? "…" : "—") : money(value);
  const countLabel = (value?: number) =>
    value === undefined ? (reportLoading ? "…" : "—") : number(value);
  const days = Math.min(
    366,
    Math.round(
      (new Date(range.end).getTime() - new Date(range.start).getTime()) /
        86400000,
    ) + 1,
  );
  const chart = Array.from({ length: days }, (_, i) => {
    const d = localDate(addDays(i, parseDate(range.start)));
    return {
      date: dateLabel(d, { day: "2-digit", month: "2-digit" }),
      revenue: invoices
        .filter((inv) => (inv.paidAt || inv.createdAt).startsWith(d))
        .reduce((s, inv) => s + inv.amount, 0),
    };
  });
  const breakdown = Object.entries(summary?.revenueByMethod || {})
    .map(([method, value]) => ({ name: methodLabels[method] || method, value }))
    .filter((item) => item.value > 0);
  const colors = ["#306c4e", "#a0b97b", "#dfbd7d", "#9291b1"];
  return (
    <>
      <PageHeader
        eyebrow="TURN INSIGHTS INTO ACTION"
        title="Báo cáo & phân tích"
        description="Hiểu rõ nhịp vận hành để đưa ra quyết định tốt hơn."
        actions={
          <ExportButton
            disabled={exportDisabled}
            onClick={() => {
              if (exportDisabled || !summary) return;
              // Xuất đúng bộ lọc đã Áp dụng, không lấy các ô ngày đang nhập dở.
              downloadCsv("bao-cao-doanh-thu.csv", [
                ["BÁO CÁO DOANH THU SPORTIVA"],
                ["Từ ngày", range.start],
                ["Đến ngày", range.end],
                ["Tổng thu (VND)", summary.totalGrossRevenue],
                ["Tiền hoàn (VND)", summary.totalRefunded],
                ["Doanh thu ròng (VND)", summary.netRevenue],
                ["Hóa đơn đã thanh toán", summary.totalPaidInvoices],
                ["Hóa đơn hoàn tiền", summary.totalRefundedInvoices],
                [
                  "Cơ sở thời gian",
                  demo
                    ? "Dữ liệu kiểm thử"
                    : "Ngày thanh toán và ngày hoàn tiền; dữ liệu cũ thiếu thời điểm dùng ngày tạo hóa đơn",
                ],
                ["Phương thức", "Tổng thu (VND)"],
                ...breakdown.map((item) => [item.name, item.value]),
                ...(demo
                  ? [
                      ["Ngày", "Tổng thu (VND)"],
                      ...chart.map((item) => [item.date, item.revenue]),
                    ]
                  : []),
              ]);
            }}
          />
        }
      />
      <form
        className="report-range panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            start <= end &&
            (new Date(end).getTime() - new Date(start).getTime()) / 86400000 <=
              365
          )
            setRange({ start, end });
        }}
      >
        <div>
          <h2>Khoảng thời gian báo cáo</h2>
          <p>Thu và hoàn tiền trong khoảng thời gian đã chọn.</p>
        </div>
        <Field label="Từ ngày">
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </Field>
        <Field label="Đến ngày">
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </Field>
        <Button
          disabled={
            !start ||
            !end ||
            start > end ||
            (new Date(end).getTime() - new Date(start).getTime()) / 86400000 >
              365
          }
          type="submit"
        >
          Áp dụng
        </Button>
      </form>
      {(new Date(end).getTime() - new Date(start).getTime()) / 86400000 >
        365 && (
        <Notice tone="warning">
          Chọn khoảng thời gian tối đa 366 ngày để xem báo cáo.
        </Notice>
      )}
      {!demo && reportLoading && <Loading />}
      {!demo && query.error && (
        <ErrorState error={query.error} retry={query.refetch} />
      )}
      <div className="stats-grid">
        <div className="stat-card" aria-label="Tổng thu">
          <span className="stat-top">
            Tổng thu
            <span className="stat-icon green">
              <Wallet size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {amountLabel(summary?.totalGrossRevenue)}
          </strong>
          <small>
            {dateLabel(range.start)} – {dateLabel(range.end)}
          </small>
        </div>
        <div className="stat-card" aria-label="Tiền hoàn">
          <span className="stat-top">
            Tiền hoàn
            <span className="stat-icon orange">
              <RotateCcw size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {amountLabel(summary?.totalRefunded)}
          </strong>
          <small>
            {countLabel(summary?.totalRefundedInvoices)} hóa đơn hoàn tiền trong
            kỳ
          </small>
        </div>
        <div className="stat-card" aria-label="Doanh thu ròng">
          <span className="stat-top">
            Doanh thu ròng
            <span className="stat-icon green">
              <TrendingUp size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {amountLabel(summary?.netRevenue)}
          </strong>
          <small>Tổng thu − tiền hoàn</small>
        </div>
        <div className="stat-card" aria-label="Hóa đơn đã thanh toán">
          <span className="stat-top">
            Hóa đơn đã thanh toán
            <span className="stat-icon purple">
              <CreditCard size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {countLabel(summary?.totalPaidInvoices)}
          </strong>
          <small>Trong khoảng thời gian đã chọn</small>
        </div>
      </div>
      <div className="stats-grid report-current-stats">
        <div className="stat-card">
          <span className="stat-top">
            Thành viên hoạt động
            <span className="stat-icon blue">
              <Users size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {users.data
              ? users.data.filter(
                  (u) => u.roleName === "MEMBER" && u.status === "ACTIVE",
                ).length
              : "—"}
          </strong>
          <small>Trạng thái hiện tại của trung tâm</small>
        </div>
        <div className="stat-card">
          <span className="stat-top">
            Lớp đang mở
            <span className="stat-icon orange">
              <BarChart3 size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {classes.data
              ? classes.data.filter((c) => c.status === "SCHEDULED").length
              : "—"}
          </strong>
          <small>Trạng thái hiện tại của trung tâm</small>
        </div>
      </div>
      <OperationsReport start={range.start} end={range.end} />
      <div className="report-chart-grid">
        <Panel
          title="Xu hướng doanh thu"
          description="Tổng thu theo từng ngày thanh toán."
          action={
            demo ? (
              <div className="segmented">
                <button
                  className={chartType === "area" ? "active" : ""}
                  onClick={() => setChartType("area")}
                >
                  Đường
                </button>
                <button
                  className={chartType === "bar" ? "active" : ""}
                  onClick={() => setChartType("bar")}
                >
                  Cột
                </button>
              </div>
            ) : undefined
          }
        >
          {demo ? (
            <div className="report-chart">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "area" ? (
                  <AreaChart
                    data={chart}
                    margin={{ top: 20, right: 25, left: 0, bottom: 10 }}
                  >
                    <defs>
                      <linearGradient
                        id="reportGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#568363"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="#568363"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 5"
                      stroke="#edf0ea"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      minTickGap={35}
                      tick={{ fontSize: 11, fill: "#8a9188" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v / 1000000}tr`}
                      tick={{ fontSize: 11, fill: "#8a9188" }}
                    />
                    <Tooltip
                      formatter={(v) => [money(Number(v)), "Doanh thu"]}
                    />
                    <Area
                      dataKey="revenue"
                      type="monotone"
                      stroke="#306c4e"
                      strokeWidth={2.5}
                      fill="url(#reportGradient)"
                    />
                  </AreaChart>
                ) : (
                  <BarChart
                    data={chart}
                    margin={{ top: 20, right: 25, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 5"
                      stroke="#edf0ea"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      minTickGap={35}
                      tick={{ fontSize: 11, fill: "#8a9188" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v / 1000000}tr`}
                      tick={{ fontSize: 11, fill: "#8a9188" }}
                    />
                    <Tooltip
                      formatter={(v) => [money(Number(v)), "Doanh thu"]}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#527c55"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="report-unavailable">
              <BarChart3 size={40} />
              <h3>Chưa có dữ liệu theo từng ngày</h3>
              <p>
                Báo cáo hiện có số liệu tổng hợp trong kỳ. Biểu đồ sẽ hiển thị
                khi có dữ liệu thu tiền theo từng ngày.
              </p>
            </div>
          )}
        </Panel>
        <Panel
          title="Phương thức thanh toán"
          description="Tỷ trọng tổng thu theo phương thức, trước khi trừ tiền hoàn."
        >
          {reportLoading ? (
            <Loading />
          ) : !summary ? (
            <p className="muted">
              Chưa tải được số liệu phương thức thanh toán.
            </p>
          ) : !breakdown.length ? (
            <Empty
              title="Chưa có khoản thu trong kỳ"
              description="Chọn khoảng thời gian khác để xem phương thức thanh toán."
            />
          ) : (
            <>
              <div className="donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={88}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => money(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  <strong>{number(summary.totalPaidInvoices)}</strong>
                  <span>HÓA ĐƠN</span>
                </div>
              </div>
              <div className="breakdown-legend">
                {breakdown.map((b, i) => (
                  <div key={b.name}>
                    <i style={{ background: colors[i % colors.length] }} />
                    <span>{b.name}</span>
                    <strong>{money(b.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
      <Notice>
        {demo
          ? "Báo cáo đang dùng dữ liệu demo trên trình duyệt. Khi kết nối API, chỉ số chỉ được hiển thị khi backend có dữ liệu tương ứng."
          : "Khoản thu được lọc theo ngày thanh toán, tiền hoàn theo ngày hoàn tiền. Với dữ liệu cũ thiếu thời điểm tương ứng, hệ thống dùng ngày tạo hóa đơn. Các chỉ số thu và hoàn theo khoảng đã Áp dụng; số thành viên và lớp phía trên là trạng thái hiện tại."}
      </Notice>
    </>
  );
}
