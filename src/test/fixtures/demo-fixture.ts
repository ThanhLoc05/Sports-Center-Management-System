/**
 * NGUỒN DỮ LIỆU CHO BẢN DEMO KHÔNG CẦN BACKEND.
 * Dữ liệu nằm ở localStorage với khóa riêng; tải lại trang vẫn giữ các thay đổi local.
 * Tài khoản, lớp và doanh thu mẫu không phải dữ liệu thật và không đồng bộ vào SQL.
 */
import type { DemoDatabase, Role, Session } from "../../lib/types";
import { addDays, localDate, dateTimeLocal } from "../../lib/utils";
const KEY = "sportiva-demo-v1";
const names = [
  "Nguyễn Minh Anh",
  "Trần Hoàng Nam",
  "Lê Thảo Linh",
  "Phạm Đức Huy",
  "Võ Ngọc Hà",
  "Đặng Quốc Bảo",
  "Bùi Khánh Vy",
  "Đỗ Tuấn Kiệt",
  "Nguyễn Phương Nhi",
  "Trương Gia Hân",
  "Lý Minh Khang",
  "Hoàng Bảo Ngọc",
  "Phan Thành Đạt",
  "Trịnh Ngọc Mai",
  "Lê Quỳnh Anh",
  "Vũ Anh Tú",
  "Đinh Hải Yến",
  "Ngô Minh Đức",
  "Tạ Thanh Tâm",
  "Huỳnh Nhật Long",
  "Đào Thùy Dương",
  "Nguyễn Duy Khánh",
  "Trần Yến Nhi",
  "Lê Đức Anh",
];
const schedule = (offset: number, hour: number, minute = 0) =>
  `${localDate(addDays(offset))}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
/**
 * Tạo dữ liệu khởi đầu gồm người dùng nhiều vai trò, lớp, booking, gói và hóa đơn.
 * Các mốc lịch được tính quanh ngày hiện tại để thuận tiện trình diễn nghiệp vụ.
 */
export function seedDatabase(): DemoDatabase {
  const users = [
    {
      id: 1,
      fullName: "Nguyễn Thanh Lộc",
      email: "manager@sportiva.demo",
      phone: "0901234567",
      roleName: "CENTER_MANAGER" as Role,
      status: "ACTIVE",
    },
    {
      id: 2,
      fullName: "Lê Thu Trang",
      email: "reception@sportiva.demo",
      phone: "0902345678",
      roleName: "RECEPTIONIST" as Role,
      status: "ACTIVE",
    },
    ...[
      "Trần Thanh Hương",
      "Nguyễn Minh Tuấn",
      "Lê Bảo Trâm",
      "Phạm Quốc Hưng",
    ].map((fullName, i) => ({
      id: 3 + i,
      fullName,
      email: `coach${i + 1}@sportiva.demo`,
      phone: `090345678${i}`,
      roleName: "COACH" as Role,
      status: "ACTIVE",
    })),
    ...names.map((fullName, i) => ({
      id: 10 + i,
      fullName,
      email: `member${i + 1}@sportiva.demo`,
      phone: `09${String(12340000 + i)}`,
      roleName: "MEMBER" as Role,
      status: i === 17 ? "INACTIVE" : "ACTIVE",
    })),
  ];
  const classes = [
    ["Morning Yoga", 1, 3, 1, 20, 8, 0],
    ["Functional Strength", 2, 4, 2, 16, 9, 30],
    ["Pilates Flow", 3, 5, 3, 12, 11, 0],
    ["HIIT & Burn", 4, 6, 2, 20, 14, 0],
    ["Sunset Yoga", 1, 3, 1, 20, 17, 30],
    ["Aqua Fit", 5, 6, 4, 16, 18, 0],
    ["Yoga cho người mới", 1, 3, 1, 18, 8, 0],
    ["Full Body Strength", 2, 4, 2, 16, 10, 0],
    ["Pilates & Balance", 3, 5, 3, 12, 16, 0],
    ["Cardio Energy", 4, 6, 2, 20, 18, 0],
    ["Yoga phục hồi", 1, 3, 1, 20, 9, 0],
    ["Badminton Club", 6, 4, 5, 12, 17, 0],
    ["Power Yoga", 1, 3, 1, 18, 8, 0],
    ["Core & Mobility", 3, 5, 3, 12, 14, 0],
    ["Swim Technique", 5, 6, 4, 16, 17, 0],
    ["Weekend Strength", 2, 4, 2, 16, 9, 0],
    ["Sunday Flow", 1, 3, 1, 20, 9, 0],
  ].map((v, i) => ({
    id: i + 1,
    className: String(v[0]),
    sportId: Number(v[1]),
    coachId: Number(v[2]),
    roomId: Number(v[3]),
    maxCapacity: Number(v[4]),
    scheduleTime: schedule(
      i < 6 ? 0 : i < 10 ? 1 : i < 12 ? 2 : i < 15 ? 3 : i === 15 ? 4 : 5,
      Number(v[5]),
      Number(v[6]),
    ),
    durationMinutes: i % 3 === 0 ? 60 : 45,
    status: "SCHEDULED",
  }));
  const bookings = classes.flatMap((c, i) =>
    Array.from(
      {
        length: Math.min(
          c.maxCapacity,
          i % 4 === 0 ? 18 : i % 3 === 0 ? 12 : 8 + (i % 5),
        ),
      },
      (_, j) => ({
        id: i * 30 + j + 1,
        classId: c.id,
        memberId: 10 + j,
        bookedAt: dateTimeLocal(addDays(-1)),
        status: "BOOKED",
      }),
    ),
  );
  const subscriptions = names.map((_, i) => ({
    id: i + 1,
    memberId: 10 + i,
    packageId: i === 0 ? 3 : (i % 3) + 1,
    startDate: localDate(addDays(-25)),
    endDate: localDate(addDays(i === 17 ? -2 : i % 5 === 0 ? 3 : 25 + i * 2)),
    status: i === 17 ? "EXPIRED" : "ACTIVE",
  }));
  const invoices = Array.from({ length: 90 }, (_, i) => ({
    id: 1001 + i,
    subscriptionId: (i % 24) + 1,
    memberId: 10 + (i % 24),
    receptionistId: 2,
    amount: [800000, 2100000, 8000000][i % 3],
    paymentMethod: ["BANK_TRANSFER", "CASH", "CREDIT_CARD"][i % 3],
    paymentStatus: i < 7 ? "PENDING" : i === 8 ? "REFUNDED" : "PAID",
    createdAt: schedule(-Math.floor(i / 3), 9 + (i % 10), i % 60),
  }));
  const attendance = bookings
    .filter((b) => b.classId <= 3)
    .slice(0, 25)
    .map((b, i) => ({
      id: i + 1,
      classId: b.classId,
      memberId: b.memberId,
      checkedInBy: 2,
      checkedInAt: schedule(0, 7, 30 + i),
      status: i % 7 === 0 ? "ABSENT" : "PRESENT",
    }));
  return {
    rooms: [
      {
        id: 1,
        name: "Studio Zen",
        capacity: 25,
        description: "Không gian Yoga và thiền",
      },
      {
        id: 2,
        name: "Phòng thể lực",
        capacity: 30,
        description: "Thiết bị tập sức mạnh và cardio",
      },
      {
        id: 3,
        name: "Studio Flow",
        capacity: 16,
        description: "Không gian Pilates",
      },
      {
        id: 4,
        name: "Hồ bơi",
        capacity: 25,
        description: "Lớp bơi và Aqua Fit",
      },
      {
        id: 5,
        name: "Sân cầu lông",
        capacity: 16,
        description: "Tập luyện cầu lông",
      },
    ],
    sports: [
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
    })),
    users: users.map((u, i) => ({
      ...u,
      createdAt: dateTimeLocal(addDays(-35 + i)),
      fitnessGoals:
        u.roleName === "MEMBER"
          ? "Duy trì vận động và cải thiện thể lực"
          : undefined,
      level: "Mới bắt đầu",
      bio:
        u.roleName === "COACH"
          ? "Đồng hành cùng học viên xây dựng thói quen tập luyện."
          : undefined,
      specialties:
        u.roleName === "COACH"
          ? "Thể lực, vận động và kỹ thuật cơ bản"
          : undefined,
    })),
    classes,
    bookings,
    subscriptions,
    invoices,
    attendance,
    packages: [
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
    ],
    plans: [
      {
        id: 1,
        title: "Xây dựng nền tảng thể lực",
        memberId: 10,
        coachId: 3,
        goal: "Cải thiện sức bền",
        notes:
          "Tập 3 buổi mỗi tuần, tăng dần theo khả năng. Nghỉ 60 giây giữa các hiệp.",
        exercises:
          "Khởi động · 8 phút\nSquat · 3 hiệp × 12 lần\nGlute bridge · 3 hiệp × 15 lần\nPlank · 3 hiệp × 30 giây\nĐi bộ nhanh · 15 phút\nGiãn cơ · 5 phút",
        createdAt: dateTimeLocal(addDays(-5)),
      },
    ],
    logs: [
      {
        id: 1,
        planId: 1,
        memberId: 10,
        coachId: 3,
        result: "Hoàn thành 3/3 hiệp, plank 35 giây.",
        feedback:
          "Kiểm soát nhịp thở tốt. Buổi tới chú ý giữ thẳng lưng khi squat.",
        createdAt: dateTimeLocal(addDays(-1)),
      },
    ],
    tickets: [
      {
        id: 1,
        memberId: 12,
        title: "Tư vấn chuyển gói tập",
        description:
          "Mình muốn chuyển từ Essential sang Signature. Nhờ trung tâm tư vấn.",
        status: "OPEN",
        createdAt: dateTimeLocal(addDays(-1)),
      },
    ],
    audit: [
      {
        id: 1,
        actor: "Lê Thu Trang",
        action: "Ghi nhận thanh toán",
        detail: "Hóa đơn HD1008 · Chuyển khoản",
        createdAt: schedule(0, 8, 15),
      },
      {
        id: 2,
        actor: "Nguyễn Thanh Lộc",
        action: "Cập nhật lớp học",
        detail: "Morning Yoga · Studio Zen",
        createdAt: schedule(0, 7, 45),
      },
    ],
  };
}
/**
 * Ưu tiên đọc dữ liệu demo đã lưu. Nếu JSON không đọc được hoặc thiếu các mảng
 * bắt buộc, tạo lại bộ dữ liệu mẫu để demo tiếp tục hoạt động.
 */
export function readDemo(): DemoDatabase {
  try {
    const data = localStorage.getItem(KEY);
    if (data) {
      const db = JSON.parse(data);
      if (
        [
          "users",
          "classes",
          "bookings",
          "subscriptions",
          "invoices",
          "attendance",
          "packages",
          "plans",
          "logs",
          "tickets",
          "audit",
          "rooms",
          "sports",
        ].every((key) => Array.isArray(db[key]))
      )
        return db;
    }
  } catch {
    /* localStorage lỗi hoặc dữ liệu hỏng: tạo lại dữ liệu demo hợp lệ. */
  }
  const db = seedDatabase();
  saveDemo(db);
  return db;
}
/**
 * Lưu toàn bộ dữ liệu giả lập dưới dạng JSON. Chỉ ghi trình duyệt, không gọi API.
 */
export function saveDemo(db: DemoDatabase) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event("sportiva:demo-changed"));
}
/**
 * Xóa khóa dữ liệu demo rồi tạo lại dữ liệu mẫu; không xóa database backend.
 */
export function resetDemo() {
  localStorage.removeItem(KEY);
  return readDemo();
}
/**
 * Chọn một tài khoản mẫu theo vai trò để trải nghiệm demo. Token cố định này
 * không phải JWT hợp lệ của backend và không có quyền truy cập backend thật.
 */
export function demoSession(role: Role): Session {
  const user = readDemo().users.find((u) => u.roleName === role);
  if (!user) throw new Error("Vai trò demo không tồn tại.");
  return { token: "demo-local-only", user, mode: "demo" };
}
/**
 * Ghi ai làm gì, chi tiết và thời gian trong demo; giữ tối đa 500 dòng mới nhất
 * rồi lưu lại localStorage. Đây không phải nhật ký audit được server bảo vệ.
 */
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
