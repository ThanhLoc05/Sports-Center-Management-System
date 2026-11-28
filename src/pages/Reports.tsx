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
import { api, type RevenuePoint } from "../lib/api";
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
  DataTable,
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

// [FLOW 3] Khoảng báo cáo tối đa khoảng 3 năm để xem được doanh thu theo năm.
const MAX_REPORT_DAYS = 1095;
type GroupBy = "day" | "month" | "quarter" | "year";
const groupLabels: Record<GroupBy, string> = {
  day: "Ngày",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};
/**
 * [FLOW 3] Gộp doanh thu từng ngày thành từng kỳ (ngày/tháng/quý/năm).
 * Mỗi kỳ = tổng các ngày thuộc kỳ đó, nên cộng các kỳ vẫn bằng số tổng của báo cáo.
 */
function groupRevenue(points: RevenuePoint[], groupBy: GroupBy) {
  const result: (RevenuePoint & { id: number; label: string })[] = [];
  for (const p of points) {
    const [y, m, d] = p.date.split("-");
    const label =
      groupBy === "day"
        ? `${d}/${m}/${y}`
        : groupBy === "month"
          ? `${m}/${y}`
          : groupBy === "quarter"
            ? `Quý ${Math.ceil(Number(m) / 3)}/${y}`
            : y;
    const last = result[result.length - 1];
    if (last && last.label === label) {
      last.gross += p.gross;
      last.refunded += p.refunded;
      last.net += p.net;
    } else result.push({ ...p, id: result.length + 1, label });
  }
  return result;
}
/** [FLOW 3] Chọn nhanh khoảng ngày: tháng này / quý này / năm nay (đến hôm nay). */
function presetRange(kind: "month" | "quarter" | "year") {
  const today = localDate();
  const [y, m] = today.split("-").map(Number);
  const startMonth =
    kind === "month" ? m : kind === "quarter" ? Math.floor((m - 1) / 3) * 3 + 1 : 1;
  return { start: `${y}-${String(startMonth).padStart(2, "0")}-01`, end: today };
}
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
  // [FLOW 3] Cách nhóm biểu đồ/bảng doanh thu: theo ngày, tháng, quý hoặc năm.
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  // Số Member hoạt động/lớp mở là ảnh chụp hiện tại; tổng tiền bên dưới mới áp dụng bộ lọc ngày.
  const users = useUsers();
  const classes = useClasses();
  // Một response cho cả màn và CSV để các chỉ số luôn cùng khoảng thời gian.
  // [FLOW 3] BÁO CÁO DOANH THU: GET /reports/summary -> tổng thu, tiền hoàn, doanh thu ròng, số hóa đơn.
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
  const collectedInvoices = (db?.invoices || []).filter(
    (invoice) =>
      ["PAID", "REFUNDED"].includes(invoice.paymentStatus) &&
      (invoice.paidAt || invoice.createdAt).slice(0, 10) >= range.start &&
      (invoice.paidAt || invoice.createdAt).slice(0, 10) <= range.end,
  );
  const refunded = (db?.invoices || []).filter(
    (invoice) =>
      invoice.paymentStatus === "REFUNDED" &&
      (invoice.refundedAt || invoice.createdAt).slice(0, 10) >= range.start &&
      (invoice.refundedAt || invoice.createdAt).slice(0, 10) <= range.end,
  );
  const demoGross = collectedInvoices.reduce(
    (total, invoice) => total + invoice.amount,
    0,
  );
  const demoRefunded = refunded.reduce(
    (total, invoice) => total + (invoice.refundedAmount ?? invoice.amount),
    0,
  );
  const demoSummary = {
    totalGrossRevenue: demoGross,
    totalRefunded: demoRefunded,
    netRevenue: demoGross - demoRefunded,
    totalPaidInvoices: collectedInvoices.length,
    totalRefundedInvoices: refunded.length,
    revenueByMethod: Object.fromEntries(
      Object.keys(methodLabels).map((method) => [
        method,
        collectedInvoices
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
    MAX_REPORT_DAYS + 1,
    Math.round(
      (new Date(range.end).getTime() - new Date(range.start).getTime()) /
        86400000,
    ) + 1,
  );
  /**
   * [FLOW 3] DOANH THU TỪNG NGÀY trong khoảng đã chọn.
   * API: lấy summary.dailyRevenue do backend trả về (cùng công thức với các ô tổng).
   * Demo: tự tính từ hóa đơn mẫu (thu theo ngày thanh toán, hoàn theo ngày hoàn).
   */
  const dailyPoints: RevenuePoint[] = demo
    ? Array.from({ length: days }, (_, i) => {
        const d = localDate(addDays(i, parseDate(range.start)));
        const gross = collectedInvoices
          .filter((inv) => (inv.paidAt || inv.createdAt).startsWith(d))
          .reduce((s, inv) => s + inv.amount, 0);
        const back = refunded
          .filter((inv) => (inv.refundedAt || inv.createdAt).startsWith(d))
          .reduce((s, inv) => s + (inv.refundedAmount ?? inv.amount), 0);
        return { date: d, gross, refunded: back, net: gross - back };
      })
    : query.error
      ? []
      : query.data?.dailyRevenue || [];
  // [FLOW 3] Gộp doanh thu từng ngày thành ngày / tháng / quý / năm cho biểu đồ và bảng tổng doanh thu.
  const periods = groupRevenue(dailyPoints, groupBy);
  // Giữ tên biến chart cho phần xuất CSV và biểu đồ.
  const chart = periods.map((p) => ({ ...p, date: p.label, revenue: p.net }));
  // Dữ liệu phân bổ phương thức lấy từ cùng summary với các ô tổng và file CSV.
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
                ...(periods.length
                  ? [
                      [groupLabels[groupBy], "Tổng thu (VND)", "Tiền hoàn (VND)", "Doanh thu ròng (VND)"],
                      ...periods.map((p) => [p.label, p.gross, p.refunded, p.net]),
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
              MAX_REPORT_DAYS
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
        {/* [FLOW 3] NÚT "Áp dụng": chọn khoảng ngày báo cáo rồi tải lại số liệu. */}
        <Button
          disabled={
            !start ||
            !end ||
            start > end ||
            (new Date(end).getTime() - new Date(start).getTime()) / 86400000 >
              MAX_REPORT_DAYS
          }
          type="submit"
        >
          Áp dụng
        </Button>
      </form>
      {/* [FLOW 3] NÚT CHỌN NHANH khoảng báo cáo: Tháng này / Quý này / Năm nay (áp dụng ngay). */}
      <div className="report-presets">
        {!demo && (
          <Button
            type="button"
            variant="secondary"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RotateCcw size={16} />
            Làm mới báo cáo
          </Button>
        )}
        <span>Chọn nhanh:</span>
        {(
          [
            ["month", "Tháng này", "month"],
            ["quarter", "Quý này", "month"],
            ["year", "Năm nay", "month"],
          ] as const
        ).map(([kind, text, group]) => (
          <Button
            key={kind}
            type="button"
            variant="secondary"
            onClick={() => {
              const next = presetRange(kind);
              setStart(next.start);
              setEnd(next.end);
              setRange(next);
              setGroupBy(kind === "month" ? "day" : group);
            }}
          >
            {text}
          </Button>
        ))}
      </div>
      {(new Date(end).getTime() - new Date(start).getTime()) / 86400000 >
        MAX_REPORT_DAYS && (
        <Notice tone="warning">
          Chọn khoảng thời gian tối đa 3 năm để xem báo cáo.
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
        {/* [FLOW 3] BIỂU ĐỒ DOANH THU theo khoảng ngày đã chọn; nhóm theo Ngày/Tháng/Quý/Năm; Đường = doanh thu ròng, Cột = tổng thu và tiền hoàn. */}
        <Panel
          title="Doanh thu theo thời gian"
          description={`Từ ${dateLabel(range.start)} đến ${dateLabel(range.end)} · nhóm theo ${groupLabels[groupBy].toLowerCase()}.`}
          action={
            <div className="report-chart-actions">
              <div className="segmented" aria-label="Nhóm doanh thu theo">
                {(Object.keys(groupLabels) as GroupBy[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={groupBy === key ? "active" : ""}
                    onClick={() => setGroupBy(key)}
                  >
                    {groupLabels[key]}
                  </button>
                ))}
              </div>
              <div className="segmented" aria-label="Kiểu biểu đồ">
                <button
                  type="button"
                  className={chartType === "area" ? "active" : ""}
                  onClick={() => setChartType("area")}
                >
                  Đường
                </button>
                <button
                  type="button"
                  className={chartType === "bar" ? "active" : ""}
                  onClick={() => setChartType("bar")}
                >
                  Cột
                </button>
              </div>
            </div>
          }
        >
          {reportLoading ? (
            <Loading />
          ) : chart.length ? (
            <div className="report-chart">
              <ResponsiveContainer width="100%" height="88%">
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
                      formatter={(v, name) => [money(Number(v)), String(name)]}
                    />
                    <Area
                      dataKey="revenue"
                      name="Doanh thu ròng"
                      type="monotone"
                      stroke="#306c4e"
                      strokeWidth={2.5}
                      fill="url(#reportGradient)"
                    />
                    {/* [FLOW 3] ĐƯỜNG MÀU ĐỎ: tiền hoàn theo ngày hoàn tiền, để so với doanh thu ròng. */}
                    <Area
                      dataKey="refunded"
                      name="Tiền hoàn"
                      type="monotone"
                      stroke="#c0392b"
                      strokeWidth={2}
                      fill="none"
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
                      formatter={(v, name) => [money(Number(v)), String(name)]}
                    />
                    <Bar
                      dataKey="gross"
                      name="Tổng thu"
                      fill="#527c55"
                      radius={[5, 5, 0, 0]}
                    />
                    <Bar
                      dataKey="refunded"
                      name="Tiền hoàn"
                      fill="#c0392b"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
              {/* [FLOW 3] Chú thích màu của biểu đồ: xanh = doanh thu (ròng / tổng thu), đỏ = tiền hoàn. */}
              <div className="report-chart-legend">
                <span>
                  <i style={{ background: chartType === "area" ? "#306c4e" : "#527c55" }} />
                  {chartType === "area" ? "Doanh thu ròng" : "Tổng thu"}
                </span>
                <span>
                  <i style={{ background: "#c0392b" }} />
                  Tiền hoàn
                </span>
              </div>
            </div>
          ) : (
            <div className="report-unavailable">
              <BarChart3 size={40} />
              <h3>Chưa có dữ liệu doanh thu theo thời gian</h3>
              <p>
                Không tải được doanh thu từng ngày cho khoảng đã chọn. Hãy tải
                lại trang hoặc khởi động lại backend bản mới.
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
      {/* [FLOW 3] BẢNG TỔNG DOANH THU theo kỳ (ngày/tháng/quý/năm) trong khoảng ngày đã chọn, có dòng tổng cộng. */}
      <Panel
        title="Bảng tổng doanh thu"
        description={`Từ ${dateLabel(range.start)} đến ${dateLabel(range.end)} · mỗi dòng là một ${groupLabels[groupBy].toLowerCase()}.`}
      >
        {reportLoading ? (
          <Loading />
        ) : !periods.length ? (
          <Empty
            title="Chưa có dữ liệu doanh thu"
            description="Chọn khoảng thời gian khác hoặc tải lại trang."
          />
        ) : (
          <>
            <DataTable
              label="Bảng tổng doanh thu"
              rows={periods}
              pageSize={12}
              columns={[
                { key: "label", sort: (p) => p.date, label: groupLabels[groupBy], render: (p) => p.label },
                { key: "gross", sort: (p) => p.gross, label: "Tổng thu", render: (p) => money(p.gross) },
                { key: "refunded", sort: (p) => p.refunded, label: "Tiền hoàn", render: (p) => money(p.refunded) },
                {
                  key: "net",
                  sort: (p) => p.net,
                  label: "Doanh thu ròng",
                  render: (p) => <strong>{money(p.net)}</strong>,
                },
              ]}
            />
            <p className="report-table-total">
              Tổng cộng: thu <strong>{money(periods.reduce((s, p) => s + p.gross, 0))}</strong>
              {" · "}hoàn <strong>{money(periods.reduce((s, p) => s + p.refunded, 0))}</strong>
              {" · "}doanh thu ròng <strong>{money(periods.reduce((s, p) => s + p.net, 0))}</strong>
            </p>
          </>
        )}
      </Panel>
      <Notice>
        {demo
          ? "Báo cáo đang dùng dữ liệu demo trên trình duyệt. Khi kết nối API, chỉ số chỉ được hiển thị khi backend có dữ liệu tương ứng."
          : "Khoản thu được lọc theo ngày thanh toán, tiền hoàn theo ngày hoàn tiền. Với dữ liệu cũ thiếu thời điểm tương ứng, hệ thống dùng ngày tạo hóa đơn. Các chỉ số thu và hoàn theo khoảng đã Áp dụng; số thành viên và lớp phía trên là trạng thái hiện tại."}
      </Notice>
    </>
  );
}
