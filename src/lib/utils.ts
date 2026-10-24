/** Tiện ích hiển thị dùng chung, không đọc/ghi backend. */
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Không thể hoàn tất thao tác. Vui lòng thử lại.";
