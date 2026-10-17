export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
export const number = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value);
export const centerTimezone = "Asia/Ho_Chi_Minh";
/** Java LocalDate/LocalDateTime values are center-local (UTC+7), never browser-local. */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(`${value}T00:00:00+07:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))
    return new Date(`${value}+07:00`);
  return new Date(value);
}
export const dateLabel = (
  value: string | Date,
  opts?: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("vi-VN", {
    ...(opts || { day: "2-digit", month: "2-digit", year: "numeric" }),
    timeZone: centerTimezone,
  }).format(parseDate(value));
export const timeLabel = (value: string) =>
  dateLabel(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function localDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: centerTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDays(days: number, origin = new Date()) {
  const date = new Date(origin);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}
export function dateTimeLocal(value = new Date()) {
  return `${localDate(value)}T${timeLabel(value.toISOString())}:00`;
}
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export const normalize = (str: string) =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
export const matches = (query: string, ...values: unknown[]) =>
  normalize(values.join(" ")).includes(normalize(query.trim()));
export function csvContent(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            let value = String(cell ?? "");
            if (/^\s*[=+\-@]|^[\t\r\n]/.test(value)) value = "'" + value;
            return '"' + value.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const content = csvContent(rows);
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Không thể hoàn tất thao tác. Vui lòng thử lại.";
export const idLabel = (id: number, prefix = "TV") =>
  `${prefix}${String(id).padStart(4, "0")}`;
