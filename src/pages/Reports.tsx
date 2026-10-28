/**
 * FLOW 3 — BÁO CÁO DOANH THU THEO KHOẢNG THỜI GIAN CHO QUẢN LÝ.
 * API hiện có tổng theo khoảng ngày và báo cáo phương thức dạng text. Biểu đồ
 * chi tiết theo ngày được tính từ hóa đơn demo, không tự suy ra từ một tổng API.
 */
import { useState } from "react";
import { BarChart3, CreditCard, TrendingUp, Users } from "lucide-react";
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
import { api, request } from "../lib/api";
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
  /**
   * Tải tổng doanh thu theo range, bao trọn ngày đầu/cuối bằng 00:00:00 và 23:59:59.
   * queryKey đổi theo range để React Query tải kết quả cho khoảng mới.
   */
  const query = useQuery({
    queryKey: ["report", range],
    queryFn: () =>
      api.revenue(`${range.start}T00:00:00`, `${range.end}T23:59:59`),
  });
  const methods = useQuery({
    queryKey: ["revenueMethods", range],
    queryFn: () =>
      request<string>(
        `/payments/revenue/by-method?startDate=${encodeURIComponent(range.start + "T00:00:00")}&endDate=${encodeURIComponent(range.end + "T23:59:59")}`,
      ),
    enabled: !demo,
  });
  /**
   * Chỉ demo có tập hóa đơn chi tiết để cộng theo từng ngày/phương thức.
   * API mode không dùng hóa đơn mẫu dựng biểu đồ của doanh thu thật.
   */
  const db = demo ? readDemo() : null;
  const invoices =
    db?.invoices.filter(
      (i) =>
        i.paymentStatus === "PAID" &&
        i.createdAt >= range.start &&
        i.createdAt <= range.end + "T23:59:59",
    ) || [];
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
        .filter((inv) => inv.createdAt.startsWith(d))
        .reduce((s, inv) => s + inv.amount, 0),
    };
  });
  const breakdown = Object.entries(methodLabels)
    .map(([id, name]) => ({
      name,
      value: invoices
        .filter((i) => i.paymentMethod === id)
        .reduce((s, i) => s + i.amount, 0),
    }))
    .filter((x) => x.value > 0);
  const colors = ["#306c4e", "#a0b97b", "#dfbd7d", "#9291b1"];
  return (
    <>
      <PageHeader
        eyebrow="TURN INSIGHTS INTO ACTION"
        title="Báo cáo & phân tích"
        description="Hiểu rõ nhịp vận hành để đưa ra quyết định tốt hơn."
        actions={
          <ExportButton
            onClick={() =>
              downloadCsv("bao-cao-doanh-thu.csv", [
                ["BÁO CÁO DOANH THU SPORTIVA"],
                ["Từ ngày", range.start],
                ["Đến ngày", range.end],
                [
                  "Tổng doanh thu đã thanh toán",
                  query.data ?? "Không khả dụng",
                ],
                ...(demo
                  ? [
                      ["Ngày", "Doanh thu"],
                      ...chart.map((x) => [x.date, x.revenue]),
                    ]
                  : []),
              ])
            }
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
          <p>Doanh thu tính trên hóa đơn đã thanh toán.</p>
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
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-top">
            Doanh thu đã thu
            <span className="stat-icon green">
              <TrendingUp size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {query.data !== undefined
              ? money(query.data)
              : query.isPending
                ? "…"
                : "—"}
          </strong>
          <small>
            {dateLabel(range.start)} – {dateLabel(range.end)}
          </small>
        </div>
        <div className="stat-card">
          <span className="stat-top">
            Giao dịch đã thanh toán
            <span className="stat-icon purple">
              <CreditCard size={19} />
            </span>
          </span>
          <strong className="stat-value">
            {demo ? number(invoices.length) : "—"}
          </strong>
          <small>
            {demo
              ? "Trong khoảng thời gian đã chọn"
              : "API chưa có tổng số giao dịch"}
          </small>
        </div>
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
          description="Số tiền ghi nhận theo ngày tạo hóa đơn."
          action={
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
          }
        >
          {query.error ? (
            <ErrorState error={query.error} retry={query.refetch} />
          ) : demo ? (
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
              <h3>Đã kết nối số liệu tổng</h3>
              <p>
                Backend trả về tổng doanh thu. Biểu đồ từng ngày cần bổ sung
                endpoint tổng hợp.
              </p>
            </div>
          )}
        </Panel>
        <Panel
          title="Phương thức thanh toán"
          description="Tỷ trọng doanh thu theo kênh thu tiền."
        >
          {demo ? (
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
                  <strong>{invoices.length}</strong>
                  <span>GIAO DỊCH</span>
                </div>
              </div>
              <div className="breakdown-legend">
                {breakdown.map((b, i) => (
                  <div key={b.name}>
                    <i style={{ background: colors[i] }} />
                    <span>{b.name}</span>
                    <strong>{money(b.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : methods.isPending ? (
            <Loading />
          ) : methods.error ? (
            <ErrorState error={methods.error} retry={methods.refetch} />
          ) : (
            <div className="live-method-report">
              <pre>
                {methods.data ||
                  "Chưa có doanh thu trong khoảng thời gian này."}
              </pre>
            </div>
          )}
        </Panel>
      </div>
      <Notice>
        {demo
          ? "Báo cáo đang dùng dữ liệu demo trên trình duyệt. Khi kết nối API, chỉ số chỉ được hiển thị khi backend có dữ liệu tương ứng."
          : "Doanh thu dựa trên trạng thái PAID và ngày tạo hóa đơn theo logic BE; chưa có ngày thanh toán riêng để lập báo cáo dòng tiền theo ngày thu."}
      </Notice>
    </>
  );
}
