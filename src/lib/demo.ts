import type { Package, Sport } from "./types";
const initialPackages: Package[] = [
  {
    id: 1,
    name: "Essential",
    durationDays: 30,
    price: 800000,
    description: "Khởi đầu thói quen khỏe mạnh.",
    features: [
      "Tập gym không giới hạn",
      "Tham gia lớp học nhóm",
      "Tủ đồ & phòng thay đồ",
    ],
    sportIds: [2, 4],
    classLimit: 12,
    status: "ACTIVE",
  },
  {
    id: 2,
    name: "Signature",
    durationDays: 90,
    price: 2100000,
    description: "Nâng tầm trải nghiệm tập luyện.",
    features: [
      "Tất cả quyền lợi Essential",
      "Yoga, Pilates & hồ bơi",
      "Đánh giá thể lực hàng tháng",
      "2 buổi tư vấn cùng HLV",
    ],
    sportIds: [1, 2, 3, 4, 5],
    classLimit: 40,
    status: "ACTIVE",
  },
  {
    id: 3,
    name: "All Access",
    durationDays: 365,
    price: 8000000,
    description: "Một năm đầu tư cho chính bạn.",
    features: [
      "Tất cả quyền lợi Signature",
      "8 buổi tập cá nhân",
      "Ưu tiên đăng ký lớp",
      "Tặng 2 lượt tập cho bạn bè",
    ],
    sportIds: [1, 2, 3, 4, 5, 6],
    classLimit: null,
    status: "ACTIVE",
  },
];
const initialSports: Sport[] = [
  "Yoga",
  "Thể hình",
  "Pilates",
  "Cardio",
  "Bơi lội",
  "Cầu lông",
].map((name, i) => ({
  id: i + 1,
  name,
  description: "Bộ môn tại Sportiva Center",
}));
import { dateTimeLocal } from "./utils";
/** Dữ liệu demo tài khoản/hồ sơ, giữ riêng với dữ liệu backend. */
import type { Role, Session, DemoDatabase, User } from "./types";
const KEY = "sportiva-auth-demo-v1";

export function readDemo(): DemoDatabase {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      Array.isArray(data?.users) &&
      data.users.every((u: User) => u.id && u.email && u.fullName && u.roleName)
    ) {
      data.audit = Array.isArray(data.audit) ? data.audit : [];
      data.packages = Array.isArray(data.packages)
        ? data.packages
        : structuredClone(initialPackages);
      data.sports = Array.isArray(data.sports)
        ? data.sports
        : structuredClone(initialSports);
      data.subscriptions = Array.isArray(data.subscriptions)
        ? data.subscriptions
        : [];
      return data;
    }
  } catch {
    /* JSON hỏng thì tạo lại tài khoản mẫu. */
  }
  const db: DemoDatabase = {
    audit: [],
    packages: structuredClone(initialPackages),
    sports: structuredClone(initialSports),
    subscriptions: [],
    users: [
      {
        id: 1,
        fullName: "Nguyễn Thanh Lộc",
        email: "manager@sportiva.demo",
        phone: "0901234567",
        roleName: "CENTER_MANAGER",
        status: "ACTIVE",
      },
      {
        id: 2,
        fullName: "Lê Thu Trang",
        email: "reception@sportiva.demo",
        phone: "0902345678",
        roleName: "RECEPTIONIST",
        status: "ACTIVE",
      },
      {
        id: 3,
        fullName: "Trần Thanh Hương",
        email: "coach1@sportiva.demo",
        phone: "0903456780",
        roleName: "COACH",
        status: "ACTIVE",
      },
      {
        id: 10,
        fullName: "Nguyễn Minh Anh",
        email: "member1@sportiva.demo",
        phone: "0912340000",
        roleName: "MEMBER",
        status: "ACTIVE",
      },
    ],
  };
  saveDemo(db);
  return db;
}
export function saveDemo(db: DemoDatabase) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event("sportiva:demo-changed"));
}
/** Token mẫu không có quyền truy cập backend thật. */
export function demoSession(role: Role): Session {
  const user = readDemo().users.find((user) => user.roleName === role);
  if (!user) throw new Error("Vai trò demo không tồn tại.");
  return { token: "demo-local-only", user, mode: "demo" };
}

export function demoAudit(db: DemoDatabase, action: string, detail: string) {
  let actor = "Người dùng demo";
  try {
    actor =
      JSON.parse(sessionStorage.getItem("sportiva-session") || "{}").user
        ?.fullName || actor;
  } catch {
    /* Không đọc được phiên thì dùng tên người thao tác demo mặc định. */
  }
  db.audit.unshift({
    id: Date.now(),
    actor,
    action,
    detail,
    createdAt: dateTimeLocal(),
  });
  db.audit = db.audit.slice(0, 500);
  saveDemo(db);
}
